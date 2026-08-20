import { redirect } from 'next/navigation'
import { catalogAdmin } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-gate'
import { fetchAll } from '@/lib/fetch-all'
import { matchCatalog, type CatalogCandidateRow } from '@/lib/school-match'
import CatalogProposalsClient, { type ProposalRow } from './CatalogProposalsClient'

// Families propose schools the catalog does not hold. This is where a human
// decides whether the catalog gains a row — or, far more often, whether the
// school was already there under another name.
//
// THE MATCHER RUNS AGAIN HERE, live, not just at proposal time. The catalog
// moves between proposal and review, and the reviewer is better at this than the
// family was. It errs toward false negatives by design, so "University of
// Wisconsin Madison" never saw "Wisconsin" offered — this screen is where that
// is caught. Live candidates lead; the frozen ones are shown underneath as a
// record of what the family actually declined.
export default async function CatalogProposalsPage() {
  const admin = await requireAdmin()
  if (!admin.ok) redirect('/get-recruited')

  const db = catalogAdmin()

  const [{ data: proposals }, { data: families }] = await Promise.all([
    db.from('catalog_proposals')
      .select('id, proposed_name, proposed_by_family_id, origin_school_id, candidates, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    db.from('families').select('id, name'),
  ])

  const famName = new Map(((families ?? []) as Array<{ id: string; name: string | null }>).map(f => [f.id, f.name]))

  // One complete catalog read, asserted — a review screen matching against a
  // truncated catalog would recommend "create" for schools that already exist.
  let catalog: CatalogCandidateRow[] = []
  let catalogError: string | null = null
  try {
    catalog = await fetchAll<CatalogCandidateRow>(db, 'discovery_schools', 'id, name, short_name, division, state, city', { orderBy: 'id' })
  } catch (err) {
    catalogError = err instanceof Error ? err.message : 'catalog read failed'
  }

  const rows: ProposalRow[] = ((proposals ?? []) as Array<Record<string, unknown>>).map(p => {
    const live = catalog.length > 0 ? matchCatalog(p.proposed_name as string, catalog) : null
    return {
      id: p.id as string,
      proposedName: p.proposed_name as string,
      familyName: famName.get(p.proposed_by_family_id as string) ?? (p.proposed_by_family_id as string).slice(0, 8),
      originSchoolId: (p.origin_school_id as string | null) ?? null,
      createdAt: p.created_at as string,
      frozen: (p.candidates ?? {}) as ProposalRow['frozen'],
      liveCandidates: (live?.candidates ?? []).map(c => ({
        id: c.id, name: c.name, division: c.division, state: c.state, via: c.via,
      })),
      liveTier: live?.tier ?? 'none',
    }
  })

  return <CatalogProposalsClient rows={rows} catalogError={catalogError} catalogSize={catalog.length} />
}
