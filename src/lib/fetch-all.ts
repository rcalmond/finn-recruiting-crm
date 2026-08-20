/**
 * fetch-all.ts — a read that is allowed to believe it got everything.
 *
 * PostgREST caps a response at 1000 rows. It does not error, does not warn, and
 * the JS client surfaces nothing: you get 1000 rows and a success. Measured on
 * 2026-08-19, when a .limit(1200) against discovery_schools (1066 rows) returned
 * exactly 1000 and every conclusion drawn from it was quietly wrong.
 *
 * The dangerous shape is not a truncated list — it is a truncated list that
 * LOOKS complete. An unattended nightly cron with a truncated scan set does not
 * fail; it silently does less work than it reported, in a log nobody reads.
 *
 * So the assertion lives HERE, inside one implementation, rather than at each
 * call site. Per-call-site pagination is pagination that is correct until
 * somebody adds the next call site.
 *
 * Throws rather than returning short. A caller that wanted everything and got
 * some of it has no safe way to continue, and the cron's error path is a much
 * better outcome than an undercount presented as a full run.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 500

/* eslint-disable @typescript-eslint/no-explicit-any */
type Refine = (q: any) => any

export interface FetchAllOptions {
  /** Applied identically to the count probe and to every page. */
  refine?: Refine
  /** Stable sort key for paging. Must be unique or pages can overlap/skip. */
  orderBy?: string
  pageSize?: number
}

export async function fetchAll<T = Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  columns: string,
  opts: FetchAllOptions = {},
): Promise<T[]> {
  const { refine, orderBy = 'id', pageSize = PAGE_SIZE } = opts

  // The count and the pages MUST carry the same filters, or the assertion below
  // compares two different questions and passes while the data is wrong.
  let countQuery: any = client.from(table).select('*', { count: 'exact', head: true })
  if (refine) countQuery = refine(countQuery)
  const { count, error: countErr } = await countQuery
  if (countErr) {
    throw new Error(`fetchAll(${table}): count failed — ${countErr.message}`)
  }

  const total = count ?? 0
  if (total === 0) return []

  const rows: T[] = []
  for (let offset = 0; offset < total; offset += pageSize) {
    let pageQuery: any = client.from(table).select(columns).order(orderBy)
    if (refine) pageQuery = refine(pageQuery)
    const { data, error } = await pageQuery.range(offset, offset + pageSize - 1)
    if (error) {
      throw new Error(`fetchAll(${table}): page at ${offset} failed — ${error.message}`)
    }
    rows.push(...((data ?? []) as T[]))
  }

  if (rows.length !== total) {
    throw new Error(
      `fetchAll(${table}): expected ${total} rows, assembled ${rows.length}. ` +
      `Refusing to return a partial set — a short read here is a silent undercount.`
    )
  }

  return rows
}
