'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Player } from '@/lib/types'

/**
 * usePlayer — the family's player, on the user client (RLS scopes the read).
 *
 * TODO(multi-player): reads the family's FIRST player by created_at; the schema
 * supports several per family, the alpha UI holds one.
 *
 * Zero-rows lesson (T2): loading resolves UNCONDITIONALLY — a family with no
 * player row gets { player: null, loading: false }, never loading-forever.
 */
export function usePlayer() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!error) setPlayer((data as Player | null) ?? null)
    setLoading(false)
  }, [supabase])

  useEffect(() => { refetch() }, [refetch])

  return { player, loading, refetch }
}
