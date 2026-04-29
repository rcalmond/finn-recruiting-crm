'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { School, ContactLogEntry, ActionItem, Asset, Question, Coach } from '@/lib/types'

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

  const insertSchool = useCallback(async (school: Omit<School, 'id' | 'created_at' | 'updated_at' | 'sort_order'>) => {
    const { data: maxData } = await supabase
      .from('schools')
      .select('sort_order')
      .order('sort_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()
    const nextOrder = ((maxData as School | null)?.sort_order ?? 0) + 1
    const { data, error } = await supabase.from('schools').insert({ ...school, sort_order: nextOrder }).select().single()
    if (!error && data) setSchools(prev => [...prev, data as School].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
    return error
  }, [supabase])

  const deleteSchool = useCallback(async (id: string) => {
    const { error } = await supabase.from('schools').delete().eq('id', id)
    if (!error) setSchools(prev => prev.filter(s => s.id !== id))
    return error
  }, [supabase])

  const reorderSchools = useCallback(async (orderedIds: string[]) => {
    setSchools(prev => {
      const byId = Object.fromEntries(prev.map(s => [s.id, s]))
      const reordered = orderedIds
        .filter(id => byId[id])
        .map((id, idx) => ({ ...byId[id], sort_order: idx + 1 }))
      const untouched = prev.filter(s => !orderedIds.includes(s.id))
      return [...reordered, ...untouched]
    })
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('schools').update({ sort_order: idx + 1 }).eq('id', id)
      )
    )
  }, [supabase])

  return { schools, loading, updateSchool, insertSchool, deleteSchool, reorderSchools, refetch: fetchSchools }
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
      .order('sent_at', { ascending: false })
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

  const updateEntry = useCallback(async (id: string, updates: Partial<ContactLogEntry>) => {
    const { error } = await supabase.from('contact_log').update(updates).eq('id', id)
    if (!error) setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
    return error
  }, [supabase])

  const snoozeEntry = useCallback(async (id: string, days = 7) => {
    const until = new Date()
    until.setDate(until.getDate() + days)
    const snoozeUntil = until.toISOString()
    const { error } = await supabase.from('contact_log')
      .update({ snoozed_until: snoozeUntil, dismissed_at: null })
      .eq('id', id)
    if (!error) setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, snoozed_until: snoozeUntil, dismissed_at: null } : e
    ))
    return error
  }, [supabase])

  const markHandled = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('contact_log')
      .update({ handled_at: now })
      .eq('id', id)
    if (!error) setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, handled_at: now } : e
    ))
    return error
  }, [supabase])

  const markUnhandled = useCallback(async (id: string) => {
    const { error } = await supabase.from('contact_log')
      .update({ handled_at: null })
      .eq('id', id)
    if (!error) setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, handled_at: null } : e
    ))
    return error
  }, [supabase])

  const dismissEntry = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('contact_log')
      .update({ dismissed_at: now, snoozed_until: null })
      .eq('id', id)
    if (!error) setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, dismissed_at: now, snoozed_until: null } : e
    ))
    return error
  }, [supabase])

  const undoEntry = useCallback(async (id: string) => {
    const { error } = await supabase.from('contact_log')
      .update({ snoozed_until: null, dismissed_at: null })
      .eq('id', id)
    if (!error) setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, snoozed_until: null, dismissed_at: null } : e
    ))
    return error
  }, [supabase])

  return { entries, loading, insertContact, insertContacts, updateEntry, deleteEntry, markHandled, markUnhandled, snoozeEntry, dismissEntry, undoEntry, refetch: fetchEntries }
}

// ─── Action Items ─────────────────────────────────────────────────────────────

export function useActionItems(schoolId?: string) {
  const [items, setItems] = useState<ActionItem[]>([])
  const [completedItems, setCompletedItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchItems = useCallback(async () => {
    // Active items (completed_at is null)
    let query = supabase
      .from('action_items')
      .select('*, school:schools(id, name, short_name, category, status)')
      .is('completed_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (schoolId) query = query.eq('school_id', schoolId)
    const { data, error } = await query
    if (!error && data) setItems(data as ActionItem[])

    // Last 5 completed items (per school if scoped)
    let cQuery = supabase
      .from('action_items')
      .select('*, school:schools(id, name, short_name, category, status)')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(5)
    if (schoolId) cQuery = cQuery.eq('school_id', schoolId)
    const { data: cData } = await cQuery
    if (cData) setCompletedItems(cData as ActionItem[])

    setLoading(false)
  }, [supabase, schoolId])

  useEffect(() => {
    fetchItems()
    const channel = supabase
      .channel(`action-items-${schoolId ?? 'all'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items' }, fetchItems)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchItems, supabase, schoolId])

  const insertItem = useCallback(async (item: Omit<ActionItem, 'id' | 'created_at' | 'school' | 'sort_order' | 'completed_at' | 'selected_for_today_at'>) => {
    // Place new items at the end by fetching the current max sort_order for active items
    const { data: maxData } = await supabase
      .from('action_items')
      .select('sort_order')
      .is('completed_at', null)
      .order('sort_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()
    const nextOrder = ((maxData as ActionItem | null)?.sort_order ?? 0) + 1

    const { data, error } = await supabase
      .from('action_items')
      .insert({ ...item, sort_order: nextOrder })
      .select('*, school:schools(id, name, short_name, category, status)')
      .single()
    if (!error && data) setItems(prev => [...prev, data as ActionItem])
    return error
  }, [supabase])

  const updateItem = useCallback(async (id: string, updates: Partial<Omit<ActionItem, 'id' | 'school_id' | 'created_at' | 'school'>>) => {
    const { error } = await supabase.from('action_items').update(updates).eq('id', id)
    if (!error) setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
    return error
  }, [supabase])

  const completeItem = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('action_items').update({ completed_at: now }).eq('id', id)
    if (error) {
      console.error('[action-items] completeItem failed:', error.message)
    } else {
      // Move from active to completed in local state (only on success — no drift)
      setItems(prev => {
        const completed = prev.find(i => i.id === id)
        if (completed) {
          setCompletedItems(cp => [{ ...completed, completed_at: now }, ...cp].slice(0, 5))
        }
        return prev.filter(i => i.id !== id)
      })
    }
    return error
  }, [supabase])

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('action_items').delete().eq('id', id)
    if (!error) {
      setItems(prev => prev.filter(i => i.id !== id))
      setCompletedItems(prev => prev.filter(i => i.id !== id))
    }
    return error
  }, [supabase])

  // Reorder items by updating sort_order for all items in the new sequence.
  // orderedIds should contain every item id in the desired order.
  const reorderItems = useCallback(async (orderedIds: string[]) => {
    // Optimistic update
    setItems(prev => {
      const byId = Object.fromEntries(prev.map(i => [i.id, i]))
      const reordered = orderedIds
        .filter(id => byId[id])
        .map((id, idx) => ({ ...byId[id], sort_order: idx + 1 }))
      const untouched = prev.filter(i => !orderedIds.includes(i.id))
      return [...reordered, ...untouched]
    })
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('action_items').update({ sort_order: idx + 1 }).eq('id', id)
      )
    )
  }, [supabase])

  return { items, completedItems, loading, insertItem, updateItem, completeItem, deleteItem, reorderItems, refetch: fetchItems }
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchAssets = useCallback(async () => {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setAssets(data as Asset[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAssets()
    const channel = supabase
      .channel(`assets-changes-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, fetchAssets)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAssets, supabase])

  const insertLink = useCallback(async (link: Pick<Asset, 'name' | 'type' | 'url' | 'description'> & { userId: string }) => {
    const { data, error } = await supabase
      .from('assets')
      .insert({
        name: link.name,
        type: link.type,
        category: 'link',
        url: link.url,
        description: link.description,
        is_current: true,
        version: 1,
        uploaded_by: link.userId,
      })
      .select()
      .single()
    if (!error && data) setAssets(prev => [data as Asset, ...prev])
    return error
  }, [supabase])

  const updateAsset = useCallback(async (id: string, updates: Partial<Asset>) => {
    const { error } = await supabase.from('assets').update(updates).eq('id', id)
    if (!error) setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
    return error
  }, [supabase])

  // Mark old version inactive and point to new asset id
  const archiveAsset = useCallback(async (oldId: string, newId: string) => {
    const { error } = await supabase
      .from('assets')
      .update({ is_current: false, replaced_by: newId })
      .eq('id', oldId)
    if (!error) setAssets(prev => prev.map(a => a.id === oldId ? { ...a, is_current: false, replaced_by: newId } : a))
    return error
  }, [supabase])

  // Called after API delete completes — remove from local state
  const removeAsset = useCallback((id: string) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, is_current: false } : a))
  }, [])

  // Generate a signed URL for a file asset (1 hour expiry)
  const getSignedUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('assets')
      .createSignedUrl(storagePath, 3600)
    if (error || !data) return null
    return data.signedUrl
  }, [supabase])

  return { assets, loading, insertLink, updateAsset, archiveAsset, removeAsset, getSignedUrl, refetch: fetchAssets }
}

// ─── Questions ────────────────────────────────────────────────────────────────

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchQuestions = useCallback(async () => {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (!error && data) setQuestions(data as Question[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchQuestions()
    const channel = supabase
      .channel(`questions-changes-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, fetchQuestions)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchQuestions, supabase])

  const insertQuestion = useCallback(async (q: Omit<Question, 'id' | 'created_at'>) => {
    const { data, error } = await supabase.from('questions').insert(q).select().single()
    if (!error && data) setQuestions(prev => [...prev, data as Question])
    return error
  }, [supabase])

  const updateQuestion = useCallback(async (id: string, updates: Partial<Question>) => {
    const { error } = await supabase.from('questions').update(updates).eq('id', id)
    if (!error) setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q))
    return error
  }, [supabase])

  const deleteQuestion = useCallback(async (id: string) => {
    const { error } = await supabase.from('questions').delete().eq('id', id)
    if (!error) setQuestions(prev => prev.filter(q => q.id !== id))
    return error
  }, [supabase])

  return { questions, loading, insertQuestion, updateQuestion, deleteQuestion }
}

// ─── Coaches ──────────────────────────────────────────────────────────────────

export function useCoaches(schoolId?: string) {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchCoaches = useCallback(async () => {
    if (!schoolId) {
      setCoaches([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('coaches')
      .select('*')
      .eq('school_id', schoolId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (!error && data) setCoaches(data as Coach[])
    setLoading(false)
  }, [supabase, schoolId])

  useEffect(() => {
    fetchCoaches()
    const channel = supabase
      .channel(`coaches-${schoolId ?? 'none'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coaches' }, fetchCoaches)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchCoaches, supabase, schoolId])

  const insertCoach = useCallback(async (coach: Omit<Coach, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase.from('coaches').insert(coach).select().single()
    if (!error && data) {
      setCoaches(prev => [...prev, data as Coach].sort((a, b) => a.sort_order - b.sort_order))
    }
    return error
  }, [supabase])

  const updateCoach = useCallback(async (id: string, updates: Partial<Omit<Coach, 'id' | 'school_id' | 'created_at' | 'updated_at'>>) => {
    const { error } = await supabase.from('coaches').update(updates).eq('id', id)
    if (!error) setCoaches(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    return error
  }, [supabase])

  const deleteCoach = useCallback(async (id: string) => {
    const { error } = await supabase.from('coaches').delete().eq('id', id)
    if (!error) setCoaches(prev => prev.filter(c => c.id !== id))
    return error
  }, [supabase])

  // Flip is_primary to the given coach; clears all others for the same school first.
  // Optimistic: updates state immediately, reverts on error.
  const setPrimary = useCallback(async (coachId: string) => {
    const target = coaches.find(c => c.id === coachId)
    if (!target) return null

    // Optimistic update
    setCoaches(prev => prev.map(c => ({ ...c, is_primary: c.id === coachId })))

    // Clear all primaries for this school, then set the new one
    const { error: clearErr } = await supabase
      .from('coaches')
      .update({ is_primary: false })
      .eq('school_id', target.school_id)
    if (clearErr) {
      await fetchCoaches()   // revert
      return clearErr
    }

    const { error } = await supabase.from('coaches').update({ is_primary: true }).eq('id', coachId)
    if (error) await fetchCoaches()  // revert
    return error
  }, [supabase, coaches, fetchCoaches])

  return { coaches, loading, insertCoach, updateCoach, deleteCoach, setPrimary, refetch: fetchCoaches }
}
