// Dumps all contact_log rows to a local JSON file before wiping.
// Run: npx tsx scripts/backup-contact-log.ts

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('Fetching all contact_log rows...')

  const { data, error } = await supabase
    .from('contact_log')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  const rows = data ?? []
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `contact_log_backup_${timestamp}.json`
  const outPath = resolve(process.cwd(), filename)

  writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8')

  console.log(`✅  ${rows.length} rows written to ${outPath}`)
  console.log('Keep this file somewhere safe before running the wipe.')
}

main()
