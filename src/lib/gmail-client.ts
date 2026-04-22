/**
 * gmail-client.ts
 *
 * Low-level Gmail API client with automatic token refresh.
 * All functions require a valid gmail_tokens row (stored by the OAuth flow).
 * No UI concerns — pure server-side.
 *
 * Usage:
 *   const gmail = await getAuthorizedClient(userEmail)
 *   const { messageIds } = await listRecruitingMessages(userEmail, { since })
 */

import { google, gmail_v1 } from 'googleapis'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GmailTokenRow {
  id: string
  user_email: string
  access_token: string
  refresh_token: string
  expires_at: string          // ISO timestamp
  scope: string
  last_sync_at: string | null
}

/** Parsed representation of a single Gmail message returned by getMessageDetails. */
export interface GmailMessageDetails {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  internalDate: string        // Unix milliseconds as string
  headers: Record<string, string>   // header name (lowercased) → value
  textBody: string | null     // decoded text/plain part, or HTML-stripped fallback
  htmlBody: string | null     // decoded text/html part (for reference; parser uses text)
}

/** Thrown when the Gmail access token can't be refreshed (revoked or > 7-day limit). */
export class GmailAuthError extends Error {
  constructor(message: string, public readonly code: 'REFRESH_FAILED' | 'NO_TOKEN') {
    super(message)
    this.name = 'GmailAuthError'
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI!
  )
}

// How many minutes before expiry to proactively refresh.
// Prevents using a token that expires mid-request.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000  // 5 minutes

// ── getAuthorizedClient ───────────────────────────────────────────────────────
//
// Token refresh path:
//
// 1. Fetch the token row from gmail_tokens (service role only).
//    Throws GmailAuthError('NO_TOKEN') if not found.
//
// 2. Check expiry: if expires_at < now + 5 min, the token is stale.
//    We refresh proactively rather than retrying on 401, which avoids
//    burning a request on a guaranteed failure.
//
// 3. Refresh: call client.refreshAccessToken() via googleapis.
//    This POSTs to Google's token endpoint using the stored refresh_token.
//
//    Success path:
//      - Google returns a new access_token (and optionally a new refresh_token).
//      - We update gmail_tokens.access_token, expires_at, last_used_at, updated_at.
//      - If Google issues a new refresh_token (unusual but possible), we update
//        that too. Ignoring a rotated refresh_token would break the next refresh.
//
//    Failure path (GmailAuthError REFRESH_FAILED):
//      - Google returns an error (most commonly "invalid_grant").
//      - "invalid_grant" means one of:
//          a) App is in testing mode and 7-day token expiry hit
//          b) User revoked access in Google account settings
//          c) Credentials (client secret) rotated without re-auth
//      - We throw GmailAuthError so the cron can log it and stop gracefully.
//        We do NOT delete the row — that's for the disconnect route (explicit user action).
//      - The settings page detects the stale state via last_sync_at being old
//        and prompts Finn to reconnect.
//
//    No retry: a failed refresh won't succeed on retry — Google is telling us
//    the refresh_token is dead. Retrying would just hammer Google and log noise.
//
// 4. Return an initialized gmail_v1.Gmail client with credentials set.

export async function getAuthorizedClient(userEmail: string): Promise<gmail_v1.Gmail> {
  const admin = serviceClient()

  // 1. Fetch token row
  const { data: row, error } = await admin
    .from('gmail_tokens')
    .select('id, user_email, access_token, refresh_token, expires_at, scope, last_sync_at')
    .eq('user_email', userEmail)
    .single()

  if (error || !row) {
    throw new GmailAuthError(`No Gmail token found for ${userEmail}`, 'NO_TOKEN')
  }

  const tokenRow = row as GmailTokenRow
  const client   = oauthClient()

  // 2. Check expiry
  const expiresAt = new Date(tokenRow.expires_at).getTime()
  const needsRefresh = expiresAt - Date.now() < EXPIRY_BUFFER_MS

  if (needsRefresh) {
    // 3. Refresh the access token
    client.setCredentials({
      refresh_token: tokenRow.refresh_token,
    })

    let newTokens: {
      access_token?: string | null
      refresh_token?: string | null
      expiry_date?: number | null
    }

    try {
      const { credentials } = await client.refreshAccessToken()
      newTokens = credentials
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[gmail-client] Token refresh failed for ${userEmail}: ${msg}`)
      throw new GmailAuthError(
        `Token refresh failed — reconnect required: ${msg}`,
        'REFRESH_FAILED'
      )
    }

    if (!newTokens.access_token) {
      throw new GmailAuthError('Refresh succeeded but returned no access_token', 'REFRESH_FAILED')
    }

    // Persist the new tokens
    const updates: Record<string, string> = {
      access_token: newTokens.access_token,
      expires_at:   newTokens.expiry_date
        ? new Date(newTokens.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
      last_used_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }
    // Google may rotate the refresh_token; store it if so
    if (newTokens.refresh_token) {
      updates.refresh_token = newTokens.refresh_token
    }

    await admin
      .from('gmail_tokens')
      .update(updates)
      .eq('id', tokenRow.id)

    client.setCredentials({
      access_token:  newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokenRow.refresh_token,
    })
  } else {
    // Token still valid — use as-is
    client.setCredentials({
      access_token:  tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
    })

    // Stamp last_used_at (fire-and-forget, non-blocking)
    void admin
      .from('gmail_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)
  }

  return google.gmail({ version: 'v1', auth: client })
}

// ── listRecruitingMessages ────────────────────────────────────────────────────
//
// Returns one page of Gmail message IDs with the Recruiting label.
// No date filter — we fetch all labeled messages and rely on the
// gmail_message_id dedup in contact_log to skip already-captured ones.
//
// Why no after: filter:
//   The after: timestamp approach missed messages labeled after the cron ran.
//   Scanning all labeled messages + deduping in the DB is correct and cheap:
//   dedup is a single indexed lookup per ID, not a full message fetch.
//   New messages accumulate slowly (recruiting emails, not inbox firehose),
//   so the full label scan stays fast in practice.
//
// Safety cap: maxResults=100 per page. The cron caps total pages (see cron route).

export async function listRecruitingMessages(
  userEmail: string,
  options: { pageToken?: string } = {}
): Promise<{ messageIds: string[]; nextPageToken?: string }> {
  const gmail = await getAuthorizedClient(userEmail)

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'label:Recruiting',
    maxResults: 100,
    pageToken: options.pageToken,
  })

  const messageIds = (res.data.messages ?? [])
    .map(m => m.id)
    .filter((id): id is string => id != null)

  return {
    messageIds,
    nextPageToken: res.data.nextPageToken ?? undefined,
  }
}

// ── getMessageDetails ─────────────────────────────────────────────────────────
//
// Fetches a full message and extracts:
//   - All headers as a lowercased key→value map
//   - text/plain body (preferred) and text/html body (for fallback)
//   - threadId, labelIds, snippet, internalDate
//
// Body extraction is recursive: handles multipart/alternative,
// multipart/mixed, and nested multipart trees. See extractBodyParts.

export async function getMessageDetails(
  userEmail: string,
  messageId: string
): Promise<GmailMessageDetails> {
  const gmail = await getAuthorizedClient(userEmail)

  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const msg = res.data

  // Parse headers into a flat lowercased map.
  // Gmail may include multiple headers with the same name (e.g. Received);
  // we take the first occurrence for relevant headers.
  const headers: Record<string, string> = {}
  for (const h of msg.payload?.headers ?? []) {
    const key = (h.name ?? '').toLowerCase()
    if (key && !(key in headers)) {
      headers[key] = h.value ?? ''
    }
  }

  // Recursively extract text and HTML body parts
  const { text, html } = extractBodyParts(msg.payload ?? {})

  return {
    id:           msg.id ?? messageId,
    threadId:     msg.threadId ?? '',
    labelIds:     msg.labelIds ?? [],
    snippet:      msg.snippet ?? '',
    internalDate: msg.internalDate ?? String(Date.now()),
    headers,
    textBody:     text,
    htmlBody:     html,
  }
}

// ── Body extraction ───────────────────────────────────────────────────────────
//
// MIME structure patterns we handle:
//
//   text/plain                             → direct body
//   text/html                              → direct body
//   multipart/alternative                  → prefer text/plain, fallback html
//   multipart/mixed                        → recurse; take first found text
//   multipart/related                      → recurse (inline images wrapper)
//   multipart/* (other)                    → recurse
//
// We return both text and html so the parser can log html for debugging
// without using it in the summary.

function extractBodyParts(
  part: gmail_v1.Schema$MessagePart
): { text: string | null; html: string | null } {
  const mime = (part.mimeType ?? '').toLowerCase()

  // Leaf node: text/plain
  if (mime === 'text/plain') {
    return { text: decodeGmailBody(part.body?.data), html: null }
  }

  // Leaf node: text/html
  if (mime === 'text/html') {
    return { text: null, html: decodeGmailBody(part.body?.data) }
  }

  // Multipart: recurse into parts
  const parts = part.parts ?? []
  if (parts.length === 0) return { text: null, html: null }

  if (mime === 'multipart/alternative') {
    // Prefer text/plain; fall back to html
    let text: string | null = null
    let html: string | null = null
    for (const p of parts) {
      const result = extractBodyParts(p)
      if (!text && result.text)  text = result.text
      if (!html && result.html)  html = result.html
    }
    return { text, html }
  }

  // multipart/mixed, multipart/related, or unknown multipart:
  // recurse through parts and accumulate text (first wins)
  let text: string | null = null
  let html: string | null = null
  for (const p of parts) {
    const result = extractBodyParts(p)
    if (!text && result.text) text = result.text
    if (!html && result.html) html = result.html
    // Once we have both, stop looking
    if (text && html) break
  }
  return { text, html }
}

/** Decode Gmail's base64url-encoded body data. Returns null if data is absent. */
function decodeGmailBody(data: string | null | undefined): string | null {
  if (!data) return null
  return Buffer.from(data, 'base64url').toString('utf8')
}

// ── applyLabel ────────────────────────────────────────────────────────────────
//
// Applies a label by name to a message. Creates the label if it doesn't exist.
// Used by autoLabelKnownSenders (gmail-autolabel.ts) to tag known-coach emails.

// Cache label IDs within a single process lifetime to avoid repeated list calls.
const labelCache: Record<string, string> = {}   // "userEmail:labelName" → labelId

export async function applyLabel(
  userEmail: string,
  messageId: string,
  labelName: string
): Promise<void> {
  const gmail = await getAuthorizedClient(userEmail)
  const cacheKey = `${userEmail}:${labelName}`

  // Find or create the label
  let labelId = labelCache[cacheKey]
  if (!labelId) {
    const listRes = await gmail.users.labels.list({ userId: 'me' })
    const existing = (listRes.data.labels ?? []).find(
      l => l.name?.toLowerCase() === labelName.toLowerCase()
    )

    if (existing?.id) {
      labelId = existing.id
    } else {
      // Create the label with Gmail's default visibility settings
      const createRes = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      })
      if (!createRes.data.id) throw new Error(`Failed to create label "${labelName}"`)
      labelId = createRes.data.id
    }
    labelCache[cacheKey] = labelId
  }

  // Apply the label
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [labelId] },
  })
}
