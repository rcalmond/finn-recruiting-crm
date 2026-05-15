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
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateCampaignEmailBody, type GenerateInput } from '@/lib/campaign-email-generator'
import { fetchSchoolContext } from '@/lib/school-context'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function buildSubject(schoolName: string): string {
  return `Finn Almond | Left Wingback | Class of 2027 | ${schoolName}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const db = admin()

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

  // Shared context + route-specific fetches
  const [ctx, { data: profile }] = await Promise.all([
    fetchSchoolContext(db, schoolId),
    db.from('player_profile').select('current_reel_url').limit(1).maybeSingle(),
  ])

  const { school, contactLog, upcomingCamps } = ctx

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
    schoolNotes: school.notes,
    contactHistory: contactLog.map(r => ({
      date: r.date,
      direction: r.direction as 'Inbound' | 'Outbound',
      channel: r.channel,
      coach_name: r.coach_name,
      summary: r.summary,
    })),
    camps,
    currentReelUrl: (profile as { current_reel_url: string | null } | null)?.current_reel_url ?? null,
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
    const result = await generateCampaignEmailBody(generatorInput)
    const subject = buildSubject(school.name)

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
