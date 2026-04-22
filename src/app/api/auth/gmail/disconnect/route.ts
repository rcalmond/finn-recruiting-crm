import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/auth/gmail/disconnect
//
// 1. Require authenticated CRM session.
// 2. Fetch token row (service role — anon key has no access).
// 3. Revoke the access_token via Google's revoke endpoint.
//    Google invalidates both the access token AND the refresh token
//    when you revoke either one.
// 4. Delete the row from gmail_tokens.
// 5. Redirect to /settings/gmail.
//
// POST (not GET) so browsers can't be tricked into disconnecting
// via a crafted link. The settings UI submits a form/fetch POST.

export async function POST(req: NextRequest) {
  const { origin } = new URL(req.url)
  const settingsUrl = `${origin}/settings/gmail`

  // 1. Auth guard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = serviceClient()

  // 2. Fetch the token row (need the access_token to revoke)
  const { data: tokenRow, error: fetchError } = await admin
    .from('gmail_tokens')
    .select('id, access_token')
    .limit(1)
    .single()

  if (fetchError || !tokenRow) {
    // Already disconnected — redirect cleanly rather than error
    console.warn('[gmail-disconnect] No token row found; nothing to revoke')
    return NextResponse.redirect(`${settingsUrl}?disconnected=true`)
  }

  // 3. Revoke via Google's endpoint
  //    This immediately invalidates both the access_token and the paired
  //    refresh_token on Google's side — the account is fully de-authorized.
  //    We proceed to delete even if revocation fails (token may already
  //    be expired or previously revoked).
  try {
    const revokeUrl = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenRow.access_token)}`
    const revokeRes = await fetch(revokeUrl, { method: 'POST' })
    if (!revokeRes.ok) {
      const body = await revokeRes.text()
      console.warn(`[gmail-disconnect] Google revoke returned ${revokeRes.status}: ${body}`)
      // Don't abort — delete from DB regardless so the user isn't stuck
    } else {
      console.log('[gmail-disconnect] Google token revoked successfully')
    }
  } catch (err) {
    console.warn('[gmail-disconnect] Google revoke request failed (network?):', err)
    // Continue to DB delete
  }

  // 4. Delete the token row
  const { error: deleteError } = await admin
    .from('gmail_tokens')
    .delete()
    .eq('id', tokenRow.id)

  if (deleteError) {
    console.error('[gmail-disconnect] DB delete failed:', deleteError.message)
    return NextResponse.json({ error: 'Failed to remove token' }, { status: 500 })
  }

  console.log('[gmail-disconnect] Gmail account disconnected')
  return NextResponse.redirect(`${settingsUrl}?disconnected=true`)
}
