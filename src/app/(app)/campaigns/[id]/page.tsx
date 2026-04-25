import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import CampaignDetailClient from '@/components/campaigns/CampaignDetailClient'
import type { Campaign, CampaignSchool } from '@/lib/types'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const db = makeAdmin()

  const { data: campaign } = await db
    .from('campaigns')
    .select('*, template:campaign_templates(id, name, body, created_at, updated_at)')
    .eq('id', id)
    .single()

  if (!campaign) redirect('/campaigns')

  const { data: schools } = await db
    .from('campaign_schools')
    .select(`
      id, campaign_id, school_id, coach_id, status,
      sent_at, contact_log_id, dismissed_at, created_at,
      school:schools(id, name, short_name, category),
      coach:coaches(id, name, role, email)
    `)
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  const schoolIds = (schools ?? []).map(s => s.school_id)

  // Fetch last inbound contact_log per school for channel recommendation.
  // Ordered desc so we can dedup cheaply in JS: first row seen per school_id wins.
  const { data: inboundLogs } = schoolIds.length > 0
    ? await db
        .from('contact_log')
        .select('school_id, authored_by, channel, created_at')
        .eq('direction', 'Inbound')
        .in('school_id', schoolIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastInboundBySchool: Record<string, { authored_by: string | null; channel: string }> = {}
  for (const log of inboundLogs ?? []) {
    if (!lastInboundBySchool[log.school_id]) {
      lastInboundBySchool[log.school_id] = {
        authored_by: log.authored_by ?? null,
        channel: log.channel,
      }
    }
  }

  // All non-Nope schools for the Add School modal (excludes schools already in campaign client-side)
  const { data: allSchools } = await db
    .from('schools')
    .select('id, name, short_name, category')
    .neq('category', 'Nope')
    .order('name')

  return (
    <CampaignDetailClient
      campaign={campaign as Campaign}
      schools={(schools ?? []) as unknown as CampaignSchool[]}
      lastInboundBySchool={lastInboundBySchool}
      allSchools={(allSchools ?? []) as unknown as import('@/lib/types').School[]}
    />
  )
}
