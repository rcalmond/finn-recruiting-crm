// T1 tenancy fence — runs in prebuild, FAILS the build (exit 1) if any file in
// src/ other than the allowlist references the service-role key or constructs a
// raw @supabase/supabase-js client. The runtime refusal lives in tenant-db's
// wrapper; this is the build-time layer (the repo's eslint is non-functional,
// so the no-restricted-imports rule in eslint.config.mjs is aspirational and
// THIS script is the enforced gate).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ALLOW = new Set([
  'src/lib/tenant-db.ts',
  'src/lib/supabase/client.ts',
  'src/lib/supabase/server.ts',
  'src/proxy.ts',
])

const violations = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { walk(p); continue }
    if (!/\.(ts|tsx)$/.test(name)) continue
    if (ALLOW.has(p)) continue
    const text = readFileSync(p, 'utf8')
    if (text.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      violations.push(`${p}: references SUPABASE_SERVICE_ROLE_KEY`)
    }
    if (/import\s*\{[^}]*\bcreateClient\b[^}]*\}\s*from\s*['"]@supabase\/supabase-js['"]/.test(text)) {
      violations.push(`${p}: imports createClient from @supabase/supabase-js`)
    }
  }
}
walk('src')

if (violations.length) {
  console.error('✗ TENANCY FENCE: service-role construction outside tenant-db:')
  for (const v of violations) console.error('  - ' + v)
  console.error('Use familyAdmin/catalogAdmin/rawService from @/lib/tenant-db.')
  process.exit(1)
}
console.log('✓ tenancy fence: tenant-db is the only service-role source in src/')
