import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateConversationSummary } from '@/lib/school-conversation-summary-generator'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST — force regeneration (ignores idempotency check)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: schoolId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

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
      }, { onConflict: 'school_id' })
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
