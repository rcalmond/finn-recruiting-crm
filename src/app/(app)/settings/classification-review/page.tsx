import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import ClassificationReviewClient from './ClassificationReviewClient'

export default async function ClassificationReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch low-confidence inbound rows
  const { data: rows } = await admin
    .from('contact_log')
    .select('id, school_id, date, coach_name, coach_id, summary, authored_by, intent, classification_confidence, classification_notes, classified_at, schools!inner(id, name)')
    .eq('direction', 'Inbound')
    .eq('classification_confidence', 'low')
    .not('classified_at', 'is', null)
    .order('sent_at', { ascending: false })

  type ReviewRow = {
    id: string
    school_id: string
    school_name: string
    date: string
    coach_name: string | null
    authored_by: string | null
    intent: string | null
    classification_confidence: string | null
    classification_notes: string | null
    classified_at: string | null
    summary: string | null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviewRows: ReviewRow[] = ((rows ?? []) as any[]).map(r => ({
    id:                        r.id,
    school_id:                 r.school_id,
    school_name:               r.schools.name,
    date:                      r.date,
    coach_name:                r.coach_name,
    authored_by:               r.authored_by,
    intent:                    r.intent,
    classification_confidence: r.classification_confidence,
    classification_notes:      r.classification_notes,
    classified_at:             r.classified_at,
    summary:                   r.summary,
  }))

  return <ClassificationReviewClient rows={reviewRows} />
}
