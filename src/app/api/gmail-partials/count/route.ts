/**
 * GET /api/gmail-partials/count
 *
 * Returns { count: number } of gmail rows with parse_status = 'partial'.
 * Used for the sidebar badge. Session-authenticated.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { count } = await admin
      .from('contact_log')
      .select('id', { count: 'exact', head: true })
      .eq('parse_status', 'partial')
      .not('gmail_message_id', 'is', null)

    return NextResponse.json({ count: count ?? 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
