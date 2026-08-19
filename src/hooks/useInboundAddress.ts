'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * useInboundAddress — the family's active inbound (forwarding) address.
 *
 * Amendment 1: the CC address shown on outreach drafts MUST be the SENDING
 * family's own address. It used to be the literal finn@in.finnsoccer.com —
 * Almond's address — so a second family CC-ing it would route by envelope to
 * Almond and file THEIR outbound into ALMOND's thread: a well-formed, invisible,
 * cross-family mis-file.
 *
 * A family with no registered address gets NULL, and callers render no CC line
 * at all rather than a wrong one.
 *
 * Read on the user client — family RLS scopes it.
 */
export function useInboundAddress() {
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('family_inbound_addresses')
      .select('address, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!error) setAddress(((data?.address as string | null) ?? null))
    setLoading(false)
  }, [supabase])

  useEffect(() => { refetch() }, [refetch])

  return { address, loading, refetch }
}
