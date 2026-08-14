import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // T1 tenancy fence: tenant-db.ts is the ONLY legal source of a service-role
  // client in src/. A raw @supabase/supabase-js createClient outside it is a
  // build error, not a convention. (The browser/server anon clients live in
  // src/lib/supabase/*, which are also allowlisted.)
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/tenant-db.ts',
      'src/lib/supabase/client.ts',
      'src/lib/supabase/server.ts',
      'src/proxy.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@supabase/supabase-js',
          importNames: ['createClient'],
          message: 'T1 tenancy: construct clients via familyAdmin/catalogAdmin/rawService from @/lib/tenant-db (service role) or @/lib/supabase/* (user).',
        }],
      }],
    },
  },
]

export default eslintConfig
