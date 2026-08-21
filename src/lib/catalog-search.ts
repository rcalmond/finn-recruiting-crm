/**
 * catalog-search.ts — free-text catalog lookup for a human.
 *
 * DELIBERATELY NOT THE MATCHER. school-match.ts is strict on purpose, and its
 * descriptor guard refuses colloquial and place-name forms ("Berkeley" for
 * California, "DU" for Denver) so they reach a person instead of being guessed.
 * That refusal is only half a design: the other half is giving the person a way
 * to find the row the matcher would not name. This is that half.
 *
 * No cleverness by design — a person is reading the results, precision is their
 * job, and the discriminators they need come back with every row.
 */
import { catalogAdmin } from '@/lib/tenant-db'

export const CATALOG_SEARCH_LIMIT = 20

export interface CatalogSearchRow {
  id: string
  name: string
  short_name: string | null
  division: string | null
  state: string | null
  city: string | null
}

export async function searchCatalog(q: string): Promise<{ rows: CatalogSearchRow[]; truncated: boolean }> {
  const raw = (q ?? '').trim()
  if (raw.length < 2) return { rows: [], truncated: false }

  // Escape PostgREST's or() delimiters so a stray comma or paren cannot break
  // out of the filter expression.
  const safe = raw.replace(/[,()*]/g, ' ').trim()
  if (!safe) return { rows: [], truncated: false }

  const { data, error } = await catalogAdmin()
    .from('discovery_schools')
    .select('id, name, short_name, division, state, city')
    .or(`name.ilike.%${safe}%,short_name.ilike.%${safe}%`)
    .order('name')
    .limit(CATALOG_SEARCH_LIMIT)

  if (error) {
    console.error('[catalog-search]', error.message)
    throw new Error(error.message)
  }

  const rows = (data ?? []) as CatalogSearchRow[]
  return { rows, truncated: rows.length === CATALOG_SEARCH_LIMIT }
}
