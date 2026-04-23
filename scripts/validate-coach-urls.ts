/**
 * validate-coach-urls.ts
 *
 * Validates a hardcoded list of predicted coach page URLs against the
 * actual pages. For each school in the list that doesn't already have
 * a coach_page_url in the DB:
 *
 *   1. Fetch the predicted URL (30s timeout)
 *   2. Send stripped HTML to Claude Haiku 4.5 for validation
 *   3. Mark as CONFIRMED / FAILED / NEEDS_REVIEW
 *
 * Usage:
 *   npx tsx scripts/validate-coach-urls.ts --dry-run   ← fetch + validate, no DB writes
 *   npx tsx scripts/validate-coach-urls.ts              ← write CONFIRMED URLs to DB
 *
 * Budget estimate: ~58 schools × 1 Haiku call = ~$0.06 total
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

// ── Env loading ───────────────────────────────────────────────────────────────

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

// ── Predicted URL table ───────────────────────────────────────────────────────

const PREDICTED: { school: string; url: string }[] = [
  { school: 'Amherst',                                              url: 'https://athletics.amherst.edu/sports/mens-soccer/coaches' },
  { school: 'Berkeley',                                             url: 'https://calbears.com/sports/mens-soccer/coaches' },
  { school: 'Bowdoin',                                              url: 'https://athletics.bowdoin.edu/sports/mens-soccer/coaches' },
  { school: 'Brandeis',                                             url: 'https://gobrandeisjudges.com/sports/mens-soccer/coaches' },
  { school: 'Bucknell University',                                  url: 'https://bucknellbison.com/sports/mens-soccer/coaches' },
  { school: 'Cal Poly Pomona',                                      url: 'https://gobroncos.com/sports/mens-soccer/coaches' },
  { school: 'Cal Poly San Luis Obispo (Cal Poly SLO)',              url: 'https://gopoly.com/sports/mens-soccer/coaches' },
  { school: 'Case Western',                                         url: 'https://athletics.case.edu/sports/mens-soccer/coaches' },
  { school: 'Clark',                                                url: 'https://clarkathletics.com/sports/mens-soccer/coaches' },
  { school: 'Clemson',                                              url: 'https://clemsontigers.com/sports/mens-soccer/coaches' },
  { school: 'Colby',                                                url: 'https://athletics.colby.edu/sports/mens-soccer/coaches' },
  { school: 'Colgate',                                              url: 'https://gocolgateraiders.com/sports/mens-soccer/coaches' },
  { school: 'Cornell',                                              url: 'https://cornellbigred.com/sports/mens-soccer/coaches' },
  { school: 'DU',                                                   url: 'https://denverpioneers.com/sports/mens-soccer/coaches' },
  { school: 'Duke',                                                 url: 'https://goduke.com/sports/mens-soccer/coaches' },
  { school: 'Emory',                                                url: 'https://athletics.emory.edu/sports/mens-soccer/coaches' },
  { school: 'Harvard',                                              url: 'https://gocrimson.com/sports/mens-soccer/coaches' },
  { school: 'Illinois Institute of Technology (Illinois Tech)',     url: 'https://illinoistechathletics.com/sports/mens-soccer/coaches' },
  { school: 'Johns Hopkins',                                        url: 'https://hopkinssports.com/sports/mens-soccer/coaches' },
  { school: 'Lafayette College',                                    url: 'https://goleopards.com/sports/mens-soccer/coaches' },
  { school: 'Lehigh University',                                    url: 'https://lehighsports.com/sports/mens-soccer/coaches' },
  { school: 'Middlebury',                                           url: 'https://athletics.middlebury.edu/sports/mens-soccer/coaches' },
  { school: 'Milwaukee School of Engineering (MSOE)',               url: 'https://msoeathletics.com/sports/mens-soccer/coaches' },
  { school: 'MIT',                                                  url: 'https://mitathletics.com/sports/mens-soccer/coaches' },
  { school: 'NC State',                                             url: 'https://gopack.com/sports/mens-soccer/coaches' },
  { school: 'Northeastern',                                         url: 'https://nuhuskies.com/sports/mens-soccer/coaches' },
  { school: 'Northwestern',                                         url: 'https://nusports.com/sports/mens-soccer/coaches' },
  { school: 'Notre Dame',                                           url: 'https://und.com/sports/mens-soccer/coaches' },
  { school: 'Ohio State',                                           url: 'https://ohiostatebuckeyes.com/sports/mens-soccer/coaches' },
  { school: 'Penn',                                                 url: 'https://pennathletics.com/sports/mens-soccer/coaches' },
  { school: 'Penn State',                                           url: 'https://gopsusports.com/sports/mens-soccer/coaches' },
  { school: 'Princeton',                                            url: 'https://goprincetontigers.com/sports/mens-soccer/coaches' },
  { school: 'Rochester Institute of Technology (RIT)',              url: 'https://ritathletics.com/sports/mens-soccer/coaches' },
  { school: 'Rose-Hulman Institute of Technology',                  url: 'https://rhsports.com/sports/mens-soccer/coaches' },
  { school: 'RPI',                                                  url: 'https://rpiathletics.com/sports/mens-soccer/coaches' },
  { school: 'San Jose State University (SJSU)',                     url: 'https://sjsuspartans.com/sports/mens-soccer/coaches' },
  { school: 'Santa Clara University',                               url: 'https://santaclarabroncos.com/sports/mens-soccer/coaches' },
  { school: 'South Dakota Mines (South Dakota School of Mines & Technology)', url: 'https://sdmineshardrockers.com/sports/mens-soccer/coaches' },
  { school: 'Stanford',                                             url: 'https://gostanford.com/sports/mens-soccer/coaches' },
  { school: 'Stevens Institute of Technology',                      url: 'https://stevensducks.com/sports/mens-soccer/coaches' },
  { school: 'Suffolk',                                              url: 'https://suffolkrams.com/sports/mens-soccer/coaches' },
  { school: 'Tufts',                                                url: 'https://gotuftsjumbos.com/sports/mens-soccer/coaches' },
  { school: 'U Michigan',                                           url: 'https://mgoblue.com/sports/mens-soccer/coaches' },
  { school: 'U of Maryland',                                        url: 'https://umterps.com/sports/mens-soccer/coaches' },
  { school: 'U of Washington',                                      url: 'https://gohuskies.com/sports/mens-soccer/coaches' },
  { school: 'UC Irvine (UCI)',                                      url: 'https://ucirvinesports.com/sports/mens-soccer/coaches' },
  { school: 'UC San Diego',                                         url: 'https://ucsdtritons.com/sports/mens-soccer/coaches' },
  { school: 'UC Santa Barbara (UCSB)',                              url: 'https://ucsbgauchos.com/sports/mens-soccer/coaches' },
  { school: 'UCLA',                                                 url: 'https://uclabruins.com/sports/mens-soccer/coaches' },
  { school: 'University of Portland',                               url: 'https://portlandpilots.com/sports/mens-soccer/coaches' },
  { school: 'University of Rochester',                              url: 'https://uofrathletics.com/sports/mens-soccer/coaches' },
  { school: 'University of Wisconsin Madison',                      url: 'https://uwbadgers.com/sports/mens-soccer/coaches' },
  { school: 'UVA',                                                  url: 'https://virginiasports.com/sports/mens-soccer/coaches' },
  { school: 'VA Tech',                                              url: 'https://hokiesports.com/sports/mens-soccer/coaches' },
  { school: 'Washington University',                                url: 'https://bearsports.wustl.edu/sports/mens-soccer/coaches' },
  { school: 'Wentworth Institute of Technology',                    url: 'https://wentworthathletics.com/sports/mens-soccer/coaches' },
  { school: 'Williams',                                             url: 'https://ephsports.williams.edu/sports/mens-soccer/coaches' },
  { school: 'WPI',                                                  url: 'https://wpiathletics.com/sports/mens-soccer/coaches' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'CONFIRMED' | 'FAILED' | 'NEEDS_REVIEW' | 'SKIPPED' | 'NO_MATCH'

interface Result {
  inputName:  string
  dbName:     string | null
  schoolId:   string | null
  url:        string
  status:     Status
  reason:     string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|section|article|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Match predicted school name → DB school row.
// Strategy: case-insensitive substring match on name and short_name.
// Words in parentheses are treated as aliases (e.g. "Cal Poly SLO").
function matchSchool(
  inputName: string,
  dbSchools: { id: string; name: string; short_name: string | null }[],
): { id: string; name: string } | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()

  // Extract tokens from input (including parenthetical aliases)
  const tokens = [inputName, ...inputName.match(/\(([^)]+)\)/g)?.map(m => m.slice(1, -1)) ?? []]
    .map(normalize)

  for (const db of dbSchools) {
    const dbTokens = [db.name, db.short_name ?? ''].map(normalize)
    for (const t of tokens) {
      for (const d of dbTokens) {
        if (!t || !d) continue
        if (d === t || d.includes(t) || t.includes(d)) return { id: db.id, name: db.name }
      }
    }
  }
  return null
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; FinnRecruitingCRM/1.0; roster data collection)',
  'Accept': 'text/html,application/xhtml+xml',
}

// ── Validation prompt ─────────────────────────────────────────────────────────
//
// Deliberately loose — we just need to know if this is a coaching staff
// page for the right sport at the right school. We don't require emails
// or full roster completeness here; that's the scraper's job later.

function buildValidationPrompt(schoolName: string, pageText: string): string {
  return `Is this HTML page the men's soccer coaching staff page for ${schoolName}?

A valid page should list current coaching staff (head coach + assistants) with
names and roles. It does NOT need to include emails or phone numbers to be valid.

Respond ONLY with this JSON (no markdown fences):
{ "isValid": true, "reason": "brief explanation" }
or
{ "isValid": false, "reason": "brief explanation" }

Page content (first 5000 characters):
---
${pageText.slice(0, 5000)}
---`
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')

  console.log(`validate-coach-urls — ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE (will write CONFIRMED URLs to DB)'}`)
  console.log(`Schools to process: ${PREDICTED.length}`)
  console.log()

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Fetch all DB schools
  const { data: dbSchools, error: dbErr } = await admin
    .from('schools')
    .select('id, name, short_name, coach_page_url')
  if (dbErr) { console.error('Failed to fetch schools:', dbErr.message); process.exit(1) }

  const results: Result[] = []
  let i = 0

  for (const entry of PREDICTED) {
    i++
    process.stdout.write(`[${String(i).padStart(2)}/${PREDICTED.length}] ${entry.school.padEnd(50)} `)

    // ── 1. Match to DB school ──────────────────────────────────────────────

    const match = matchSchool(entry.school, dbSchools ?? [])

    if (!match) {
      console.log('NO_MATCH — not found in DB')
      results.push({ inputName: entry.school, dbName: null, schoolId: null, url: entry.url, status: 'NO_MATCH', reason: 'School name not matched in DB' })
      continue
    }

    // ── 2. Skip if already has a URL ───────────────────────────────────────

    const dbRow = (dbSchools ?? []).find(s => s.id === match.id)
    if (dbRow?.coach_page_url) {
      console.log(`SKIPPED — already has URL: ${dbRow.coach_page_url}`)
      results.push({ inputName: entry.school, dbName: match.name, schoolId: match.id, url: entry.url, status: 'SKIPPED', reason: `Already set: ${dbRow.coach_page_url}` })
      continue
    }

    // ── 3. Fetch the URL ───────────────────────────────────────────────────

    await sleep(1_000)

    let html: string
    try {
      const res = await fetch(entry.url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(30_000),
        redirect: 'follow',
      })
      if (!res.ok) {
        console.log(`FAILED — HTTP ${res.status}`)
        results.push({ inputName: entry.school, dbName: match.name, schoolId: match.id, url: entry.url, status: 'FAILED', reason: `HTTP ${res.status}` })
        continue
      }
      html = await res.text()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FAILED — ${msg}`)
      results.push({ inputName: entry.school, dbName: match.name, schoolId: match.id, url: entry.url, status: 'FAILED', reason: msg })
      continue
    }

    // ── 4. Validate with Haiku ─────────────────────────────────────────────

    const pageText = stripHtml(html)

    let isValid = false
    let reason  = 'unknown'
    try {
      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:     'You are a data validation assistant. Respond only with valid JSON — no prose, no markdown.',
        messages:   [{ role: 'user', content: buildValidationPrompt(match.name, pageText) }],
      })
      const raw  = (msg.content[0] as { text: string }).text.trim()
      const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      const parsed = JSON.parse(json)
      isValid = parsed.isValid === true
      reason  = String(parsed.reason ?? 'no reason given')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`NEEDS_REVIEW — Haiku error: ${msg}`)
      results.push({ inputName: entry.school, dbName: match.name, schoolId: match.id, url: entry.url, status: 'NEEDS_REVIEW', reason: `Haiku error: ${msg}` })
      continue
    }

    if (!isValid) {
      console.log(`NEEDS_REVIEW — ${reason}`)
      results.push({ inputName: entry.school, dbName: match.name, schoolId: match.id, url: entry.url, status: 'NEEDS_REVIEW', reason })
      continue
    }

    // ── 5. Write to DB (if not dry-run) ───────────────────────────────────

    if (!DRY_RUN) {
      const { error: writeErr } = await admin
        .from('schools')
        .update({ coach_page_url: entry.url })
        .eq('id', match.id)
      if (writeErr) {
        console.log(`NEEDS_REVIEW — DB write failed: ${writeErr.message}`)
        results.push({ inputName: entry.school, dbName: match.name, schoolId: match.id, url: entry.url, status: 'NEEDS_REVIEW', reason: `DB write failed: ${writeErr.message}` })
        continue
      }
    }

    console.log(`CONFIRMED — ${reason}`)
    results.push({ inputName: entry.school, dbName: match.name, schoolId: match.id, url: entry.url, status: 'CONFIRMED', reason })
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const confirmed    = results.filter(r => r.status === 'CONFIRMED')
  const failed       = results.filter(r => r.status === 'FAILED')
  const needsReview  = results.filter(r => r.status === 'NEEDS_REVIEW')
  const skipped      = results.filter(r => r.status === 'SKIPPED')
  const noMatch      = results.filter(r => r.status === 'NO_MATCH')

  console.log()
  console.log('═'.repeat(70))
  console.log(`SUMMARY${DRY_RUN ? ' (DRY RUN — nothing written)' : ''}`)
  console.log('═'.repeat(70))
  console.log(`  CONFIRMED    ${confirmed.length}   ${DRY_RUN ? '(would write to DB)' : '(written to DB)'}`)
  console.log(`  FAILED       ${failed.length}   (HTTP errors)`)
  console.log(`  NEEDS_REVIEW ${needsReview.length}   (reachable but not a coach page)`)
  console.log(`  SKIPPED      ${skipped.length}   (already had coach_page_url)`)
  console.log(`  NO_MATCH     ${noMatch.length}   (school name not found in DB)`)
  console.log()

  if (failed.length > 0) {
    console.log('── FAILED ─────────────────────────────────────────────────────────────')
    for (const r of failed) {
      console.log(`  ${(r.dbName ?? r.inputName).padEnd(45)} ${r.reason}`)
      console.log(`    ${r.url}`)
    }
    console.log()
  }

  if (needsReview.length > 0) {
    console.log('── NEEDS_REVIEW ───────────────────────────────────────────────────────')
    for (const r of needsReview) {
      console.log(`  ${(r.dbName ?? r.inputName).padEnd(45)} ${r.reason}`)
      console.log(`    ${r.url}`)
    }
    console.log()
  }

  if (noMatch.length > 0) {
    console.log('── NO_MATCH (school not in DB) ────────────────────────────────────────')
    for (const r of noMatch) {
      console.log(`  ${r.inputName}`)
    }
    console.log()
  }

  if (DRY_RUN && confirmed.length > 0) {
    console.log('── WOULD CONFIRM (re-run without --dry-run to write) ──────────────────')
    for (const r of confirmed) {
      console.log(`  ${(r.dbName ?? r.inputName).padEnd(45)} ${r.url}`)
    }
    console.log()
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
