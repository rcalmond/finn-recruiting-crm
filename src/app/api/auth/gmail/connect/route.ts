import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'

// ── OAuth scopes ──────────────────────────────────────────────────────────────
//
// gmail.modify: read, label, and move messages (no send/delete)
// openid + email: fetch the Google account's email address in the callback
// so we can confirm it's Finn's account and key the token row correctly.

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
]

// ── OAuth2 client factory ─────────────────────────────────────────────────────
//
// Called once per request — env vars are resolved at runtime so the same
// factory works for both localhost (REDIRECT_URI = http://localhost:3000/...)
// and production (REDIRECT_URI = https://finn-recruiting-crm.vercel.app/...).

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI!
  )
}

// GET /api/auth/gmail/connect
//
// Security:
//   1. Requires authenticated Supabase session (401 otherwise).
//   2. Generates a cryptographically random state token (16 bytes → 32 hex chars).
//   3. Stores state in an httpOnly, SameSite=Lax, short-lived cookie.
//      httpOnly prevents XSS from reading it; SameSite=Lax allows the cookie
//      to travel on the OAuth redirect GET from Google back to our callback.
//   4. The state is embedded in the Google OAuth URL — Google echoes it back
//      in the callback, where we verify it matches the cookie before
//      exchanging the code for tokens.

export async function GET(req: NextRequest) {
  // 1. Auth guard — must be a signed-in CRM user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Generate state token for CSRF protection
  const state = randomBytes(16).toString('hex')

  // 3. Build the Google OAuth consent URL
  const authUrl = oauthClient().generateAuthUrl({
    access_type: 'offline',   // request refresh_token (required for background sync)
    prompt: 'consent',        // force consent screen so Google always returns refresh_token
    scope: GMAIL_SCOPES,
    state,
  })

  // 4. Set state in an httpOnly cookie, then redirect
  //    10-minute TTL — enough for a human to complete the OAuth flow.
  //    Path is scoped to the callback route so the cookie isn't sent
  //    on unrelated requests.
  const response = NextResponse.redirect(authUrl)
  response.cookies.set('gmail_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,  // 10 minutes
    path: '/api/auth/gmail/callback',
  })

  return response
}
