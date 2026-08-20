import { redirect } from 'next/navigation'
import { rawService } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-gate'
import AdminInboundClient, { type QuarantineRow, type FamilyOption, type AddressRow } from './AdminInboundClient'

// The first real piece of the admin console — sized to that, not to a product.
// Quarantine = we don't know WHICH FAMILY (this page). An orphan = we know the
// family but not the school, and lives on the family's own /unmatched surface.
export default async function AdminInboundPage() {
  const admin = await requireAdmin()
  if (!admin.ok) redirect('/get-recruited')

  const db = rawService()
  const [{ data: rows }, { data: families }, { data: addresses }] = await Promise.all([
    db.from('inbound_quarantine')
      .select('id, received_at, envelope_to, envelope_from, header_from, header_to, subject, reason, matched_family_ids, status, resolved_at, resolver_note, resolved_by_email')
      .order('received_at', { ascending: false })
      .limit(100),
    db.from('families').select('id, name').order('name'),
    db.from('family_inbound_addresses')
      .select('id, family_id, address, status, label, created_at, minted_by_email')
      .order('created_at', { ascending: true }),
  ])

  return (
    <AdminInboundClient
      rows={(rows ?? []) as QuarantineRow[]}
      families={(families ?? []) as FamilyOption[]}
      addresses={(addresses ?? []) as AddressRow[]}
    />
  )
}
