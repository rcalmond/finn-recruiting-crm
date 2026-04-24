/**
 * GET /api/classification-review/count
 * Returns { count } of low-confidence classified inbound rows.
 * Session-authenticated.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { count, error } = await admin
    .from('contact_log')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'Inbound')
    .eq('classification_confidence', 'low')
    .not('classified_at', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
