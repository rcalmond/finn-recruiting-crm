/**
 * /api/admin/inbound-address — mint a family's inbound address.
 *
 * Admin-gated (env allowlist), deliberately NOT a family-facing onboarding
 * flow: that flow hasn't been designed, and inventing one here would be scope
 * creep in a routing build. Together with the T1 create-family script this is
 * the onboarding core — family row, user row, seeded questions, minted inbound
 * address — and /admin/inbound is where standing up a family happens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-gate'
import { mintInboundAddress } from '@/lib/mint-inbound-address'

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    familyId?: string
    allowAdditional?: boolean
    label?: string
  }
  if (!body.familyId) {
    return NextResponse.json({ error: 'familyId is required' }, { status: 400 })
  }

  const result = await mintInboundAddress(
    body.familyId,
    { userId: admin.userId, email: admin.email },
    {
      allowAdditional: body.allowAdditional === true,
      label: body.label,
    },
  )

  if (result.ok) {
    return NextResponse.json({ ok: true, address: result.address, attempts: result.attempts })
  }

  const status =
    result.reason === 'family_not_found' ? 404 :
    result.reason === 'already_has_active' ? 409 : 500

  return NextResponse.json({ ...result }, { status })
}
