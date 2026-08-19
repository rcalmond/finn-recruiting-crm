/**
 * POST /api/campaigns/generate-draft
 *
 * Generates a personalized campaign email body for a specific school.
 * Checks campaign_email_drafts cache first; generates fresh if missing.
 * Supports regeneration via ?regenerate=true query param.
 *
 * Body: { campaignId, schoolId, coachId }
 * Returns: { draft: CampaignEmailDraft }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { generateCampaignEmailBody, type GenerateInput } from '@/lib/campaign-email-generator'
import { fetchSchoolContext } from '@/lib/school-context'
import { buildOutreachSubject } from '@/lib/player-identity'

// Subject derives from the players row — never a name literal. The identity
// gate in DraftModal prevents reaching this with no player; the API still
// fails closed rather than emit an unnamed outreach subject.

export async function POST(req: NextRequest) {
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = fam.ctx.familyId

  const { campaignId, schoolId, coachId, regenerate, hint } = await req.json() as {
    campaignId: string
    schoolId: string
    coachId: string | null
    regenerate?: boolean
    hint?: string
  }

  if (!campaignId || !schoolId) {
    return NextResponse.json({ error: 'campaignId and schoolId are required' }, { status: 400 })
  }

  const db = familyAdmin(familyId) // T1: service role, family-scoped (SSE/LLM path)

  // Check cache (unless regenerating)
  if (!regenerate) {
    let query = db
      .from('campaign_email_drafts')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('school_id', schoolId)

    if (coachId) {
      query = query.eq('coach_id', coachId)
    } else {
      query = query.is('coach_id', null)
    }

    const { data: cached } = await query.maybeSingle()
    if (cached) {
      return NextResponse.json({ draft: cached })
    }
  }

  // Fetch campaign (for message_set)
  const { data: campaign, error: campErr } = await db
    .from('campaigns')
    .select('id, name, message_set, template:campaign_templates(body)')
    .eq('id', campaignId)
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Shared context fetch — currentAssets provides canonical reel URL from assets table.
  // Do NOT read from player_profile.current_reel_url — that field is stale.
  const ctx = await fetchSchoolContext(db, schoolId)

  const { school, contactLog, upcomingCamps, statusUpdates, currentAssets } = ctx

  if (!school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 })
  }

  // Fetch coach (campaign-specific — uses the campaign's coach_id, not primary)
  let coachName: string | null = null
  let coachRole: string | null = null
  if (coachId) {
    const { data: coach } = await db
      .from('coaches')
      .select('name, role')
      .eq('id', coachId)
      .single()
    if (coach) {
      coachName = coach.name
      coachRole = coach.role
    }
  }

  // Filter to targeted/registered camps only (campaign emails only mention committed camps)
  const camps = upcomingCamps
    .filter(c => c.status === 'targeted' || c.status === 'registered')
    .map(c => ({ name: c.name, start_date: c.start_date, end_date: c.end_date }))

  const generatorInput: GenerateInput = {
    messageSet: campaign.message_set,
    schoolName: school.name,
    coachName,
    coachRole,
    schoolCategory: school.category,
    schoolStatus: school.status,
    schoolDivision: school.division,
    schoolConference: school.conference,
    schoolLocation: school.location,
    contactHistory: contactLog.map(r => ({
      date: r.date,
      direction: r.direction as 'Inbound' | 'Outbound',
      channel: r.channel,
      coach_name: r.coach_name,
      summary: r.summary,
    })),
    camps,
    currentReelUrl: currentAssets.highlightReelUrl,
    statusUpdates,
    regenerationHint: hint?.trim() || null,
  }

  // If no message_set and no template body with content, fall back
  const hasMessageSet = !!campaign.message_set?.trim()
  const templateBody = (campaign.template as { body?: string } | null)?.body ?? ''
  if (!hasMessageSet && !templateBody.trim()) {
    // Nothing to generate from — return a stub
    return NextResponse.json({
      draft: null,
      fallback: true,
      message: 'No message set or template body configured',
    })
  }

  try {
    // Identity first: the persona feeds BOTH the body and the subject, and a
    // missing player must stop the draft before a model call, not after.
    // TODO(multi-player): first player by created_at
    const { data: playerRow } = await db.from('players')
      .select('name, position, grad_year, club')
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    const result = await generateCampaignEmailBody({ ...generatorInput, player: playerRow })
    if (!(playerRow?.name as string | undefined)?.trim()) {
      return NextResponse.json(
        { error: 'No player profile yet — add your player before drafting outreach.' },
        { status: 400 },
      )
    }
    const subject = buildOutreachSubject(playerRow, school.name)

    // Upsert to cache
    if (regenerate) {
      // Fetch existing to get current regeneration_count
      let fetchQuery = db
        .from('campaign_email_drafts')
        .select('id, regeneration_count')
        .eq('campaign_id', campaignId)
        .eq('school_id', schoolId)

      if (coachId) {
        fetchQuery = fetchQuery.eq('coach_id', coachId)
      } else {
        fetchQuery = fetchQuery.is('coach_id', null)
      }

      const { data: existing } = await fetchQuery.maybeSingle()
      const newCount = ((existing as { regeneration_count: number } | null)?.regeneration_count ?? 0) + 1

      if (existing) {
        const { data: updated } = await db
          .from('campaign_email_drafts')
          .update({
            body: result.body,
            subject,
            regenerated_at: new Date().toISOString(),
            regeneration_count: newCount,
            model_used: 'claude-opus-4-7',
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
            last_hint: hint?.trim() || null,
          })
          .eq('id', (existing as { id: string }).id)
          .select('*')
          .single()

        return NextResponse.json({ draft: updated })
      }
    }

    // Insert new row (or upsert on first generation)
    const { data: draft, error: insertErr } = await db
      .from('campaign_email_drafts')
      .upsert({
        campaign_id: campaignId,
        school_id: schoolId,
        coach_id: coachId ?? null,
        subject,
        body: result.body,
        model_used: 'claude-opus-4-7',
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        last_hint: null,
      }, { onConflict: 'campaign_id,school_id,coach_id' })
      .select('*')
      .single()

    if (insertErr) {
      console.error('[generate-draft] cache insert failed:', insertErr.message)
    }

    return NextResponse.json({ draft: draft ?? { subject, body: result.body } })
  } catch (err) {
    console.error('[generate-draft] generation failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
