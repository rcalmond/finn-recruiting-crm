/**
 * backfill-sr-cleanup.ts
 *
 * Finds contact_log rows where summary contains SR email wrapper noise
 * (CSS comments, "just sent a message" boilerplate, HTML template tabs)
 * and re-extracts a clean summary from raw_source.
 *
 * After cleaning, re-classifies each affected row.
 *
 * Usage:
 *   npx tsx scripts/backfill-sr-cleanup.ts --dry-run
 *   npx tsx scripts/backfill-sr-cleanup.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { classifyInbound, type ClassificationInput } from '../src/lib/classify-inbound'

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const dryRun = process.argv.includes('--dry-run')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── SR body cleaning (mirrors the webhook's extractMessageBody logic) ─────────

function cleanSRBody(rawText: string): string {
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Strip CSS comment blocks and @media rules
  text = text.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '')
  text = text.replace(/@media[^{]*\{[^}]*\}/g, '')
  // Remove inline CSS rules
  text = text.replace(/[A-Za-z][A-Za-z, ]*\{[^}]*\}/g, '')
  // Remove SR boilerplate
  text = text.replace(/^An email from SportsRecruits\s*/im, '')
  text = text.replace(/.*just sent a message to you on SportsRecruits\.?\s*/gi, '')
  text = text.replace(/.*You received a new message\s*/gi, '')
  text = text.replace(/.*just sent a message to your SportsRecruits inbox:?\s*/gi, '')
  text = text.replace(/This is only a preview of the message\.[^\n]*\n*/gi, '')
  text = text.replace(/To reply, log in to SportsRecruits\.?\s*/gi, '')
  // Strip tab-heavy whitespace lines
  text = text.replace(/^[\t ]+$/gm, '')
  // Collapse blank lines
  text = text.replace(/\n{3,}/g, '\n\n')

  // Find Subject boundary
  const subjectPatterns = [
    /\*Subject:[^\n]+\*\s*\n+/i,
    /\*Subject:[^\n]+\s*\n+/i,
    /^[ \t]*Subject:[^\n]+\s*\n+/im,
  ]

  let startIdx = 0
  for (const pattern of subjectPatterns) {
    const m = text.match(pattern)
    if (m && m.index !== undefined) {
      startIdx = m.index + m[0].length
      break
    }
  }

  // Find end boundary
  let endIdx = text.length
  const endMarkers = [
    'Reply on SportsRecruits',
    'Please do not reply to this notification email',
    '\n---\n',
    'View the full message on SportsRecruits',
    'To view my full profile and video(s)',
    "To view Finn's full profile",
  ]
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker, startIdx)
    if (idx !== -1 && idx > startIdx) endIdx = Math.min(endIdx, idx)
  }

  // Strip quoted reply threads
  let extracted = text.slice(startIdx, endIdx)
  const quoteMatch = extracted.match(/\nOn\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}.*(?:Finn Almond|finnalmond08)/i)
  if (quoteMatch && quoteMatch.index !== undefined) {
    extracted = extracted.slice(0, quoteMatch.index)
  }

  // Strip orphaned subject-line tail
  extracted = extracted.replace(/^[^\n*]*\*[ \t]*\n+/, '')
  // Remove remaining CSS rules
  extracted = extracted.replace(/[A-Za-z]\s*\{[^}]*\}/g, '')
  // Collapse blank lines
  extracted = extracted.replace(/\n{3,}/g, '\n\n')

  return extracted.trim()
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`SR cleanup backfill${dryRun ? ' (DRY RUN)' : ''}`)
  console.log('')

  // Find polluted rows: SR inbound with CSS comments or "just sent a message" in summary
  const { data: rows, error } = await admin
    .from('contact_log')
    .select('id, date, school_id, coach_name, summary, raw_source, channel, direction')
    .eq('channel', 'Sports Recruits')
    .eq('direction', 'Inbound')
    .or('summary.ilike.%CLIENT-SPECIFIC%,summary.ilike.%@media screen%')

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('No polluted rows found.')
    return
  }

  console.log(`Found ${rows.length} polluted row(s)`)
  console.log('')

  for (const row of rows) {
    // Use raw_source if available, fall back to summary
    const sourceText = row.raw_source || row.summary || ''
    const cleaned = cleanSRBody(sourceText)

    console.log(`Row ${row.id} (${row.date}, ${row.coach_name}):`)
    console.log(`  Old summary length: ${(row.summary || '').length}`)
    console.log(`  New summary length: ${cleaned.length}`)
    console.log(`  Preview: ${cleaned.slice(0, 120).replace(/\n/g, ' ')}...`)
    console.log('')

    if (dryRun) continue

    // Update summary
    const { error: updateErr } = await admin
      .from('contact_log')
      .update({ summary: cleaned })
      .eq('id', row.id)

    if (updateErr) {
      console.error(`  Update failed for ${row.id}:`, updateErr.message)
      continue
    }
    console.log(`  Summary updated.`)

    // Fetch school name for reclassification
    let schoolName: string | null = null
    if (row.school_id) {
      const { data: school } = await admin
        .from('schools')
        .select('name')
        .eq('id', row.school_id)
        .single()
      schoolName = school?.name ?? null
    }

    // Re-classify with cleaned summary
    const classInput: ClassificationInput = {
      summary: cleaned,
      coach_name: row.coach_name,
      school_name: schoolName,
      raw_source: row.raw_source,
      channel: row.channel,
    }

    console.log(`  Re-classifying...`)
    const result = await classifyInbound(classInput)
    const { error: classErr } = await admin
      .from('contact_log')
      .update({
        authored_by: result.authored_by,
        intent: result.intent,
        classification_confidence: result.confidence,
        classification_notes: result.notes,
        classified_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (classErr) {
      console.error(`  Classification update failed:`, classErr.message)
    } else {
      console.log(`  Reclassified: authored_by=${result.authored_by}, intent=${result.intent}, confidence=${result.confidence}`)
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('')
  console.log('Done.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
