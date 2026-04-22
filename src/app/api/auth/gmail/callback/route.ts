import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI!
  )
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/auth/gmail/callback
//
// Google redirects here after the user grants (or denies) consent.
// Query params: code, state, (optionally) error
//
// Security sequence:
//   1. Require authenticated CRM session.
//   2. Verify state param matches the cookie set in /connect — prevents CSRF.
//      Clear the state cookie immediately (one-time use).
//   3. Exchange authorization code for tokens via googleapis (server-to-server,
//      code never touches the client).
//   4. Fetch the Google account email via oauth2.userinfo so we know whose
//      tokens these are and can key the DB row.
//   5. Upsert into gmail_tokens via the service role key — anon key has no
//      access to this table (RLS blocks it).
//   6. Redirect to settings page with a success or error indicator.

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const settingsUrl = `${origin}/settings/gmail`

  // 1. Auth guard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${settingsUrl}?error=unauthorized`)
  }

  // 2. CSRF check — verify state param matches the cookie
  const stateParam  = searchParams.get('state')
  const stateCookie = req.cookies.get('gmail_oauth_state')?.value

  // Clear the state cookie regardless of outcome (one-time use)
  const response = NextResponse.redirect(settingsUrl)
  response.cookies.set('gmail_oauth_state', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/api/auth/gmail/callback',
  })

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    console.error('[gmail-callback] CSRF state mismatch — aborting')
    return buildRedirect(settingsUrl, 'error=csrf_mismatch', response)
  }

  // 3. Check for OAuth denial / error from Google
  const oauthError = searchParams.get('error')
  if (oauthError) {
    console.error(`[gmail-callback] Google OAuth error: ${oauthError}`)
    return buildRedirect(settingsUrl, `error=oauth_denied`, response)
  }

  // 4. Exchange authorization code for access + refresh tokens
  const code = searchParams.get('code')
  if (!code) {
    return buildRedirect(settingsUrl, 'error=no_code', response)
  }

  let tokens: {
    access_token?: string | null
    refresh_token?: string | null
    expiry_date?: number | null
    scope?: string | null
  }

  try {
    const client = oauthClient()
    const { tokens: t } = await client.getToken(code)
    tokens = t
  } catch (err) {
    console.error('[gmail-callback] Token exchange failed:', err)
    return buildRedirect(settingsUrl, 'error=token_exchange_failed', response)
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    // refresh_token is absent when the user already granted access previously
    // and prompt=consent wasn't honoured. Should not happen with our connect
    // URL, but handle it gracefully.
    console.error('[gmail-callback] Missing access_token or refresh_token')
    return buildRedirect(settingsUrl, 'error=missing_tokens', response)
  }

  // 5. Fetch the Google account email to key the DB row
  let userEmail: string
  try {
    const client = oauthClient()
    client.setCredentials({ ...tokens, scope: tokens.scope ?? undefined })
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const { data } = await oauth2.userinfo.get()
    if (!data.email) throw new Error('No email in userinfo response')
    userEmail = data.email
  } catch (err) {
    console.error('[gmail-callback] Userinfo fetch failed:', err)
    return buildRedirect(settingsUrl, 'error=userinfo_failed', response)
  }

  // 5b. Validate that the authorized account is the expected Gmail.
  //     GOOGLE_EXPECTED_EMAIL must be set in env (e.g. finnalmond08@gmail.com).
  //     If Finn accidentally clicks "Use a different account" and authorizes
  //     with a parent or test account, we reject clearly rather than storing
  //     tokens for the wrong mailbox.
  const expectedEmail = process.env.GOOGLE_EXPECTED_EMAIL
  if (expectedEmail && userEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
    console.error(
      `[gmail-callback] Wrong Google account: got "${userEmail}", expected "${expectedEmail}"`
    )
    return buildRedirect(settingsUrl, 'error=wrong_account', response)
  }

  // 6. Upsert tokens via service role (RLS blocks anon key on this table)
  //    expires_at: Google returns expiry_date as a Unix millisecond timestamp.
  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString() // fallback: 1 hour from now

  const admin = serviceClient()
  const { error: upsertError } = await admin
    .from('gmail_tokens')
    .upsert(
      {
        user_email:    userEmail,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at:    expiresAt,
        scope:         tokens.scope ?? GMAIL_SCOPES_STRING,
        last_used_at:  new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'user_email' }  // update existing row if already connected
    )

  if (upsertError) {
    console.error('[gmail-callback] Token upsert failed:', upsertError.message)
    return buildRedirect(settingsUrl, 'error=db_write_failed', response)
  }

  console.log(`[gmail-callback] Connected Gmail account: ${userEmail}`)
  return buildRedirect(settingsUrl, 'connected=true', response)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GMAIL_SCOPES_STRING = [
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
].join(' ')

// Mutates the redirect response's Location header to append a query param.
// We do this instead of creating a new Response so we can carry over the
// cleared state cookie.
function buildRedirect(base: string, queryParam: string, res: NextResponse): NextResponse {
  const url = new URL(base)
  const [key, value] = queryParam.split('=')
  url.searchParams.set(key, value ?? 'true')
  res.headers.set('Location', url.toString())
  return res
}
