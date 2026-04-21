/**
 * test-parser.ts
 *
 * Quick local smoke-test for the SR paste parser.
 * Reads paste text from stdin (or a file path as first arg) and prints a
 * structured summary of what the parser found.
 *
 * Usage:
 *   # pipe from clipboard
 *   pbpaste | npx tsx scripts/test-parser.ts
 *
 *   # or from a saved paste file
 *   npx tsx scripts/test-parser.ts paste.txt
 *
 *   # verbose block-level debug output
 *   npx tsx scripts/test-parser.ts --debug paste.txt
 *   pbpaste | npx tsx scripts/test-parser.ts --debug
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseSRPaste } from '../src/lib/sr-paste-parser'

const args = process.argv.slice(2)
const debug = args.includes('--debug')
const filePath = args.find(a => !a.startsWith('--'))

let text: string
if (filePath) {
  text = fs.readFileSync(path.resolve(filePath), 'utf8')
} else {
  // Read from stdin
  text = fs.readFileSync('/dev/stdin', 'utf8')
}

console.log('═'.repeat(60))
console.log('SR PASTE PARSER TEST')
console.log('═'.repeat(60))
console.log()

const messages = parseSRPaste(text, debug)

const outbound = messages.filter(m => m.isOutbound)
const inbound  = messages.filter(m => !m.isOutbound)

console.log(`Total messages: ${messages.length}`)
console.log(`  Outbound: ${outbound.length}`)
console.log(`  Inbound:  ${inbound.length}`)
console.log()

if (messages.length === 0) {
  console.log('No messages found. Run with --debug to see block-level traces.')
  process.exit(0)
}

messages.forEach((msg, idx) => {
  const dir = msg.isOutbound ? '→ OUT' : '← IN '
  console.log(`[${idx + 1}] ${dir} | ${msg.isoDate ?? 'no date'}`)
  if (msg.isOutbound) {
    const rcpts = msg.recipients.map(r => `${r.name} (${r.school})`).join(', ')
    console.log(`     To:      ${rcpts || '(none)'}`)
  } else {
    console.log(`     From:    ${msg.senderName ?? '?'} (${msg.senderSchool ?? '?'})`)
  }
  console.log(`     Subject: ${msg.subject ?? '(none)'}`)
  console.log(`     Body:    ${msg.body.slice(0, 80).replace(/\n/g, '↵')}${msg.body.length > 80 ? '…' : ''}`)
  console.log()
})
