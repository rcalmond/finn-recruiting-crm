'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { School, ContactLogEntry } from '@/lib/types'

// ─── Schools ─────────────────────────────────────────────────────────────────

export function useSchools() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchSchools = useCallback(async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
    if (!error && data) setSchools(data as School[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchSchools()
    const channel = supabase
      .channel(`schools-changes-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schools' }, fetchSchools)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchSchools, supabase])

  const updateSchool = useCallback(async (id: string, updates: Partial<School>) => {
    const { error } = await supabase
      .from('schools')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) setSchools(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    return error
  }, [supabase])

  const insertSchool = useCallback(async (school: Omit<School, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase.from('schools').insert(school).select().single()
    if (!error && data) setSchools(prev => [...prev, data as School].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
    return error
  }, [supabase])

  const deleteSchool = useCallback(async (id: string) => {
    const { error } = await supabase.from('schools').delete().eq('id', id)
    if (!error) setSchools(prev => prev.filter(s => s.id !== id))
    return error
  }, [supabase])

  return { schools, loading, updateSchool, insertSchool, deleteSchool, refetch: fetchSchools }
}

// ─── Contact Log ──────────────────────────────────────────────────────────────

export function useContactLog(schoolId?: string) {
  const [entries, setEntries] = useState<ContactLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchEntries = useCallback(async () => {
    let query = supabase
      .from('contact_log')
      .select('*, school:schools(id, name, short_name)')
      .order('date', { ascending: false })
    if (schoolId) query = query.eq('school_id', schoolId)
    const { data, error } = await query
    if (!error && data) setEntries(data as ContactLogEntry[])
    setLoading(false)
  }, [supabase, schoolId])

  useEffect(() => {
    fetchEntries()
    const channel = supabase
      .channel(`contact-log-${schoolId ?? 'all'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_log' }, fetchEntries)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchEntries, supabase, schoolId])

  const insertContact = useCallback(async (entry: Omit<ContactLogEntry, 'id' | 'created_at' | 'school'>) => {
    const { data, error } = await supabase.from('contact_log').insert(entry).select('*, school:schools(id, name, short_name)').single()
    if (!error && data) setEntries(prev => [data as ContactLogEntry, ...prev])
    return error
  }, [supabase])

  const insertContacts = useCallback(async (entries: Omit<ContactLogEntry, 'id' | 'created_at' | 'school'>[]) => {
    const { data, error } = await supabase.from('contact_log').insert(entries).select('*, school:schools(id, name, short_name)')
    if (!error && data) setEntries(prev => [...(data as ContactLogEntry[]), ...prev])
    return error
  }, [supabase])

  const deleteEntry = useCallback(async (id: string) => {
    const { error } = await supabase.from('contact_log').delete().eq('id', id)
    if (!error) setEntries(prev => prev.filter(e => e.id !== id))
    return error
  }, [supabase])

  return { entries, loading, insertContact, insertContacts, deleteEntry, refetch: fetchEntries }
}
