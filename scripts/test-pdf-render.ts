import { generateCallPrepPdf } from '../src/lib/call-prep-pdf'
import type { CallPrepOutput } from '../src/lib/call-prep-prompt'
import fs from 'fs'

const data: CallPrepOutput = JSON.parse(
  fs.readFileSync('./scripts/fixtures/colby-real.json', 'utf-8')
)

async function main() {
  console.log('Rendering PDF with real Colby data...')
  try {
    const buf = await generateCallPrepPdf(data)
    fs.writeFileSync('/tmp/test-colby-prep.pdf', buf)
    console.log(`SUCCESS: wrote ${buf.length} bytes to /tmp/test-colby-prep.pdf`)
  } catch (err) {
    console.error('RENDER FAILED:', err)
    process.exit(1)
  }
}

main()
