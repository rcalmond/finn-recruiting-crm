/**
 * discover-coach-urls.ts
 *
 * Hybrid URL discovery — two phases per school, max 2 LLM calls:
 *
 * Phase 1 — Pattern-based (no LLM unless a page fetches)
 *   Try 8 candidate URL structures built from schools.domains[].
 *   Keyword pre-check first: if "coach" words aren't in the page text,
 *   skip Haiku and try the next pattern. LLM validation only fires when
 *   a page looks promising.
 *
 * Phase 2 — Homepage navigation fallback (when Phase 1 finds nothing)
 *   Fetch up to 3 athletics homepage candidates, extract all anchor links,
 *   ask Haiku: "which link goes to the men's soccer coaches page?"
 *   Fetch that link → validate with existing coach-page prompt.
 *   Max 1 extraction call + 1 validation call = 2 LLM calls total.
 *
 * Schools without domains[] cannot generate candidates — flagged for manual.
 *
 * Budget: ~62 schools × worst-case 2 Haiku calls × ~$0.001 = ~$0.13 total.
 *
 * ── Known gaps / future improvements ─────────────────────────────────────────
 *
 * Many D3 schools use branded third-party athletics platforms whose root domain
 * is not derivable from schools.domains[] (which stores coach email domains).
 * Observed patterns from the 2026-04-23 discovery run:
 *
 *   1. {shortname}athletics.com — e.g. colgateathletics.com, minesathletics.com
 *      Phase 2 found colgateathletics.com via homepage nav but landed on the
 *      sport home page (/sports/mens-soccer) instead of /coaches. Adding a
 *      "/coaches" suffix step after homepage navigation would fix Colgate.
 *
 *   2. go{shortname}.com — e.g. gocaltech.com, goriverhawks.com
 *      Common pattern for schools whose mascot gives a clean URL slug.
 *
 *   3. {mascot}sports.com — e.g. dartmouthsports.com, hopkinssports.com,
 *      tuftsjumbos.com. Discovered via homepage navigation but mascot is not
 *      in our DB — would need a schools.mascot field or a small lookup table.
 *
 *   4. Sport-homepage → coaches subpage: when navigation returns a sport home
 *      URL (e.g. /sports/mens-soccer), try appending /coaches and validate.
 *      Would rescue Dartmouth (dartmouthsports.com found, /coaches not tried).
 *
 *   5. Blocked fetches (JHU, MIT, Tufts, Caltech, WashU): all domains return
 *      no response — likely aggressive bot protection or firewall rules. These
 *      will always require manual URL seeding regardless of approach.
 *
 * The review UI (Phase 5) should surface schools with NULL coach_page_url
 * as a maintenance item — "N schools missing coaches page URL".
 *
 * Usage:
 *   npx tsx scripts/discover-coach-urls.ts --dry-run   ← real fetches, no DB writes
 *   npx tsx scripts/discover-coach-urls.ts             ← write confirmed URLs to DB
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─── Env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Phase 1 candidate patterns ───────────────────────────────────────────────
//
// {root} = last two domain parts (andrew.cmu.edu → cmu.edu)
// {raw}  = domains[0] as stored

const PATTERNS: Array<{ id: string; build: (root: string, raw: string) => string }> = [
  { id: 'A', build: (root)      => `https://athletics.${root}/sports/mens-soccer/coaches` },
  { id: 'B', build: (_,    raw) => `https://${raw}/sports/mens-soccer/coaches` },
  { id: 'C', build: (root)      => `https://www.${root}/sports/mens-soccer/coaches` },
  { id: 'D', build: (root)      => `https://${root}/sports/mens-soccer/coaches` },
  { id: 'E', build: (root)      => `https://athletics.${root}/sports/msoc/coaches` },
  { id: 'F', build: (_,    raw) => `https://${raw}/sports/msoc/coaches` },
  { id: 'G', build: (root)      => `https://athletics.${root}/sports/soccer-men/coaches` },
  { id: 'H', build: (root)      => `https://${root}/mens-soccer/coaches` },
]

// ─── Prompts ──────────────────────────────────────────────────────────────────

// Phase 1 / Phase 2b: validate a candidate page is a men's soccer coaches page.
const VALIDATE_SYSTEM =
  'You are a validation tool that checks whether a college athletics webpage ' +
  'is the coaching staff page for a men\'s soccer program. Respond only with valid JSON.'

function buildValidatePrompt(pageText: string): string {
  return `Is this the official men's soccer COACHES page for a college/university athletics program?

Answer ONLY with this JSON (no markdown):
{ "isCoachPage": true/false, "confidence": "high"/"medium"/"low", "reason": "one sentence" }

isCoachPage=true: lists coaching staff (Head Coach, Assistant Coach) for men's soccer at a college.
isCoachPage=false: 404 / login wall / generic homepage / player roster / different sport / women's soccer.

Page content (first 5000 chars):
---
${pageText.slice(0, 5000)}
---`
}

// Phase 2a: given extracted links from an athletics homepage, find the coaches URL.
const NAVIGATE_SYSTEM =
  'You are a navigation assistant that locates specific pages on college athletics websites. ' +
  'Respond only with valid JSON.'

function buildNavigatePrompt(schoolName: string, links: Array<{ href: string; text: string }>): string {
  const linkList = links
    .slice(0, 120)  // cap at 120 links to stay well under token limit
    .map(l => `  ${l.href}  →  "${l.text}"`)
    .join('\n')

  return `I am looking for the official MEN\'S soccer coaching staff page for ${schoolName}.

Below are all navigation links found on their athletics homepage. Find the link
that goes to the men's soccer coaches/staff page (NOT women's soccer, NOT roster,
NOT schedule).

Links:
${linkList}

Return ONLY this JSON (no markdown):
{ "url": "https://full-absolute-url-or-null", "reasoning": "one sentence" }

If no clear coaching staff link is visible, return { "url": null, "reasoning": "..." }.`
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; FinnRecruitingCRM/1.0; roster data collection)',
  'Accept': 'text/html,application/xhtml+xml',
}

async function fetchHtml(url: string, timeoutMs = 15_000): Promise<{ html: string; finalUrl: string } | null> {
  try {
    // HEAD probe first (cheap) — skip if site returns 405
    const head = await fetch(url, {
      method: 'HEAD',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    }).catch(() => null)

    // If HEAD hard-failed or returned client error (not 4xx for method itself), skip
    if (head && !head.ok && head.status !== 405) return null

    const get = await fetch(url, {
      method: 'GET',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    if (!get.ok) return null
    const html = await get.text()
    return { html, finalUrl: get.url }
  } catch {
    return null
  }
}

/** Strip HTML to readable text for page validation. Removes nav/header/footer. */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Extract all anchor links from HTML, resolving relative URLs against baseUrl.
 * Returns unique hrefs with link text. Skips anchors, mailto:, tel:.
 */
function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const base = new URL(baseUrl)
  const seen  = new Set<string>()
  const links: Array<{ href: string; text: string }> = []

  const re = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw  = m[1].trim()
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue

    let href: string
    try { href = new URL(raw, base).href } catch { continue }

    if (seen.has(href)) continue
    seen.add(href)
    if (text) links.push({ href, text })
  }
  return links
}

/** Quick keyword pre-check before spending an LLM call on validation. */
function looksLikeCoachPage(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    (lower.includes('head coach') || lower.includes('coaching staff') || lower.includes('assistant coach')) &&
    (lower.includes('soccer') || lower.includes('msoc'))
  )
}

/** Quick keyword check to confirm a fetched homepage belongs to an athletics site. */
function looksLikeAthleticsPage(text: string): boolean {
  const lower = text.toLowerCase()
  const hits  = ['athletics', 'sports', 'schedule', 'roster', 'varsity', 'coach'].filter(w => lower.includes(w))
  return hits.length >= 2
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function rootDomain(domain: string): string {
  return domain.split('.').slice(-2).join('.')
}

// ─── LLM calls ────────────────────────────────────────────────────────────────

async function validatePage(pageText: string): Promise<{ valid: boolean; confidence: string; reason: string }> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: VALIDATE_SYSTEM,
    messages: [{ role: 'user', content: buildValidatePrompt(pageText) }],
  })
  const raw  = (msg.content[0] as { text: string }).text.trim()
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    const p = JSON.parse(json)
    return { valid: Boolean(p.isCoachPage) && p.confidence !== 'low', confidence: p.confidence ?? 'low', reason: p.reason ?? '' }
  } catch {
    return { valid: false, confidence: 'low', reason: 'unparseable LLM response' }
  }
}

async function extractCoachUrl(
  schoolName: string,
  links: Array<{ href: string; text: string }>,
): Promise<string | null> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: NAVIGATE_SYSTEM,
    messages: [{ role: 'user', content: buildNavigatePrompt(schoolName, links) }],
  })
  const raw  = (msg.content[0] as { text: string }).text.trim()
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    const p = JSON.parse(json)
    return typeof p.url === 'string' && p.url.startsWith('http') ? p.url : null
  } catch {
    return null
  }
}

// ─── Outcome tracking ─────────────────────────────────────────────────────────

type Outcome =
  | { status: 'found'; url: string; method: 'pattern'; patternId: string }
  | { status: 'found'; url: string; method: 'navigation'; homepageUsed: string }
  | { status: 'manual' }
  | { status: 'skipped'; reason: string }

// ─── Per-school discovery ─────────────────────────────────────────────────────

async function discoverForSchool(
  schoolName: string,
  domains: string[],
  llmBudget: { used: number },
): Promise<Outcome> {
  const rawDomain = domains[0]
  const root      = rootDomain(rawDomain)

  // ── Phase 1: pattern-based ─────────────────────────────────────────────────

  console.log(`  [Phase 1] Trying ${PATTERNS.length} URL patterns...`)
  for (const pat of PATTERNS) {
    const url = pat.build(root, rawDomain)
    process.stdout.write(`    ${pat.id}. ${url} ... `)

    const fetched = await fetchHtml(url)
    if (!fetched) { console.log('no response'); await sleep(400); continue }

    const text = stripHtmlToText(fetched.html)

    if (!looksLikeCoachPage(text)) {
      console.log('fetched but no coach keywords — skip')
      await sleep(400)
      continue
    }

    // Looks promising — spend an LLM call to confirm
    process.stdout.write('has keywords, validating... ')
    llmBudget.used++
    const result = await validatePage(text)
    console.log(`${result.valid ? 'VALID' : 'invalid'} (${result.confidence}) — ${result.reason}`)

    if (result.valid) {
      await sleep(1000)
      return { status: 'found', url: fetched.finalUrl, method: 'pattern', patternId: pat.id }
    }
    await sleep(800)
  }

  // ── Phase 2: homepage navigation fallback ──────────────────────────────────

  console.log(`  [Phase 2] Pattern search exhausted — trying homepage navigation...`)

  // Up to 3 unique homepage candidates derived from domain
  const homepageCandidates = Array.from(new Set([
    `https://athletics.${root}`,
    `https://${rawDomain}`,
    `https://www.${root}`,
  ])).slice(0, 3)

  for (const homeUrl of homepageCandidates) {
    process.stdout.write(`    homepage: ${homeUrl} ... `)

    const fetched = await fetchHtml(homeUrl)
    if (!fetched) { console.log('no response'); await sleep(400); continue }

    const homeText = stripHtmlToText(fetched.html)
    if (!looksLikeAthleticsPage(homeText)) {
      console.log('not an athletics page — skip')
      await sleep(400)
      continue
    }
    console.log(`fetched (${homeText.length} chars after strip)`)

    // Extract all links and ask Haiku to find the coaches URL
    const links = extractLinks(fetched.html, fetched.finalUrl)
    console.log(`    → extracted ${links.length} links — asking Haiku for coaches URL...`)
    llmBudget.used++
    const extractedUrl = await extractCoachUrl(schoolName, links)

    if (!extractedUrl) {
      console.log(`    → Haiku returned null — no coaches link found on this homepage`)
      await sleep(800)
      continue
    }

    console.log(`    → Haiku suggested: ${extractedUrl}`)

    // Fetch the suggested URL and validate it
    process.stdout.write(`    → fetching suggested URL... `)
    const coachFetched = await fetchHtml(extractedUrl)
    if (!coachFetched) { console.log('no response'); await sleep(400); continue }

    const coachText = stripHtmlToText(coachFetched.html)
    if (!looksLikeCoachPage(coachText)) {
      console.log('fetched but no coach keywords — skip')
      await sleep(400)
      continue
    }

    process.stdout.write('has keywords, validating... ')
    llmBudget.used++
    const result = await validatePage(coachText)
    console.log(`${result.valid ? 'VALID' : 'invalid'} (${result.confidence}) — ${result.reason}`)

    if (result.valid) {
      await sleep(1000)
      return { status: 'found', url: coachFetched.finalUrl, method: 'navigation', homepageUsed: homeUrl }
    }
    await sleep(800)
  }

  return { status: 'manual' }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\ndiscover-coach-urls ${DRY_RUN ? '(DRY RUN — no DB writes)' : '(LIVE)'}`)
  console.log('='.repeat(60))
  console.log()
  console.log('Phase 1 patterns:')
  PATTERNS.forEach(p => {
    const ex = p.build('school.edu', 'school.edu')
    console.log(`  ${p.id}. ${ex}`)
  })
  console.log()

  const { data: schoolRows, error } = await supabase
    .from('schools')
    .select('id, name, domains, coach_page_url')
    .order('name')
  if (error) { console.error('DB error:', error.message); process.exit(1) }

  const schools = (schoolRows ?? []) as Array<{
    id: string; name: string; domains: string[]; coach_page_url: string | null
  }>

  const toProcess  = schools.filter(s => (s.domains ?? []).length > 0 && !s.coach_page_url)
  const alreadySet = schools.filter(s => s.coach_page_url)
  const noDomains  = schools.filter(s => (s.domains ?? []).length === 0 && !s.coach_page_url)

  console.log(`Total schools:          ${schools.length}`)
  console.log(`Already have URL:       ${alreadySet.length}`)
  console.log(`Has domains (to probe): ${toProcess.length}`)
  console.log(`No domains (manual):    ${noDomains.length}`)
  console.log()

  // ── Process each school ────────────────────────────────────────────────────

  const results: Array<{ school: string; schoolId: string; outcome: Outcome }> = []
  let totalLlmCalls = 0

  for (const school of toProcess) {
    console.log(`\n── ${school.name} (domains: ${school.domains.join(', ')})`)
    const llmBudget = { used: 0 }

    const outcome = await discoverForSchool(school.name, school.domains, llmBudget)
    totalLlmCalls += llmBudget.used
    results.push({ school: school.name, schoolId: school.id, outcome })

    if (outcome.status === 'found') {
      console.log(`  RESULT: found via ${outcome.method} — ${outcome.url}`)
    } else {
      console.log(`  RESULT: needs manual entry`)
    }

    await sleep(1500)
  }

  // ── Summary report ─────────────────────────────────────────────────────────

  const found       = results.filter(r => r.outcome.status === 'found') as Array<{ school: string; schoolId: string; outcome: Extract<Outcome, { status: 'found' }> }>
  const byPattern   = found.filter(r => r.outcome.method === 'pattern')
  const byNav       = found.filter(r => r.outcome.method === 'navigation')
  const needsManual = results.filter(r => r.outcome.status === 'manual')

  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log()
  console.log(`Schools processed:           ${toProcess.length}`)
  console.log(`URLs found (total):          ${found.length}`)
  console.log(`  via pattern matching:      ${byPattern.length}`)
  console.log(`  via homepage navigation:   ${byNav.length}`)
  console.log(`Still needs manual entry:    ${needsManual.length}`)
  console.log(`Haiku calls total:           ${totalLlmCalls}`)
  console.log()

  if (byPattern.length > 0) {
    console.log('Found via pattern:')
    byPattern.forEach(r => {
      const o = r.outcome as Extract<Outcome, { method: 'pattern' }>
      console.log(`  [${o.patternId}] ${r.school}: ${o.url}`)
    })
    console.log()
  }

  if (byNav.length > 0) {
    console.log('Found via homepage navigation:')
    byNav.forEach(r => {
      const o = r.outcome as Extract<Outcome, { method: 'navigation' }>
      console.log(`  ${r.school}: ${o.url}`)
      console.log(`    (homepage: ${o.homepageUsed})`)
    })
    console.log()
  }

  if (needsManual.length > 0) {
    console.log('Needs manual URL entry:')
    needsManual.forEach(r => console.log(`  • ${r.school}`))
    console.log()
  }

  if (noDomains.length > 0) {
    console.log(`No domains in DB — manual required (${noDomains.length} schools):`)
    noDomains.forEach(s => console.log(`  • ${s.name}`))
    console.log()
  }

  // ── Pattern hit breakdown ──────────────────────────────────────────────────

  if (byPattern.length > 0) {
    const patternCounts: Record<string, number> = {}
    byPattern.forEach(r => {
      const id = (r.outcome as Extract<Outcome, { method: 'pattern' }>).patternId
      patternCounts[id] = (patternCounts[id] ?? 0) + 1
    })
    console.log('Pattern hit counts:')
    Object.entries(patternCounts).forEach(([id, n]) => {
      const pat = PATTERNS.find(p => p.id === id)!
      console.log(`  ${id}: ${n} school${n > 1 ? 's' : ''} — template: ${pat.build('{root}', '{raw}')}`)
    })
    console.log()
  }

  // ── Apply (live mode only) ─────────────────────────────────────────────────

  if (DRY_RUN) {
    if (found.length > 0) {
      console.log(`DRY RUN: would write ${found.length} URL${found.length === 1 ? '' : 's'} to DB.`)
      console.log('Review the URLs above, then run without --dry-run to apply.')
    }
    return
  }

  if (found.length > 0) {
    console.log(`Writing ${found.length} URL${found.length === 1 ? '' : 's'} to DB...`)
    let written = 0
    for (const r of found) {
      const { error: updateErr } = await supabase
        .from('schools')
        .update({ coach_page_url: r.outcome.url })
        .eq('id', r.schoolId)
      if (updateErr) {
        console.error(`  ERROR ${r.school}: ${updateErr.message}`)
      } else {
        console.log(`  OK  ${r.school}: ${r.outcome.url}`)
        written++
      }
    }
    console.log(`Done. Wrote ${written} of ${found.length}.`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
