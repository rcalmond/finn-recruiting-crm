import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { generateConversationSummary } from '@/lib/school-conversation-summary-generator'

// POST — force regeneration (ignores idempotency check)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: schoolId } = await params
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = fam.ctx.familyId

  const db = familyAdmin(familyId) // T1: service role, family-scoped (generator context)

  try {
    const result = await generateConversationSummary(db, schoolId)
    if (!result) {
      return NextResponse.json({ error: 'Generation failed or school not found' }, { status: 404 })
    }

    // Find most recent contact_log id
    const { data: latestRow } = await db
      .from('contact_log')
      .select('id')
      .eq('school_id', schoolId)
      .not('parse_status', 'in', '("orphan","non_coach")')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: upserted, error: upsertErr } = await db
      .from('school_conversation_summary')
      .upsert({
        school_id: schoolId,
        summary: result.summary,
        recommended_action: result.recommended_action,
        last_contact_log_id: latestRow?.id ?? null,
        generated_at: new Date().toISOString(),
        model_used: 'claude-opus-4-7',
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
      }, { onConflict: 'school_id,family_id' })
      .select()
      .single()

    if (upsertErr) {
      console.error('[conv-summary] upsert failed:', upsertErr.message)
      return NextResponse.json({ error: 'Failed to store summary' }, { status: 500 })
    }

    return NextResponse.json(upserted)
  } catch (err) {
    console.error('[conv-summary] refresh failed:', err)
    return NextResponse.json({ error: 'Generation error' }, { status: 500 })
  }
}
