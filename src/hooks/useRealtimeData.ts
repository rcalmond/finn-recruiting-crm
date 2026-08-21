'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { School, ContactLogEntry, ActionItem, Asset, Question, Coach, Camp, CampFamilyStatus, CampFamilyStatusValue, CampSchoolAttendee, CampCoachAttendee, CampWithRelations, Message, CallPrepDoc, SchoolStatusUpdate, ShareWithCoach, SchoolMilestone, MilestoneType, CalendarEvent } from '@/lib/types'
import { composeCampsWithRelations, createCamp as createCampMutation, updateCamp as updateCampMutation, updateFamilyStatus as updateFamilyStatusMutation, deleteCamp as deleteCampMutation, addSchoolAttendee as addSchoolAttendeeMutation, removeSchoolAttendee as removeSchoolAttendeeMutation } from '@/lib/camps'
import type { CurrentResearchRow } from '@/lib/school-research'
import { campHostFilterIds } from '@/lib/camp-host'

// ─── Fail-closed on absence (binding project rule) ───────────────────────────
//
// A failed READ and an empty result are DIFFERENT STATES and must never render
// the same. On 2026-08-19 a hard PostgREST 300 (ambiguous embed) was discarded
// by `if (!error && data)` and rendered as "Send the first email to get
// started" — the entire conversation history looked deleted while every row sat
// intact in the database. It cost a day, and it was the FOURTH appearance of
// this pattern in the project.
//
// Every fetch below now reports its failure loudly and exposes it on the hook
// as `error`, so a consumer can distinguish "nothing here" from "we could not
// look". Consumers that still render a bare empty state are no longer BLIND —
// the failure is in the console and on the hook.
function reportFetchError(source: string, error: { message?: string; code?: string } | null): void {
  if (!error) return
  console.error(
    `[read-failed] ${source}: ${error.message ?? 'unknown error'}` +
    (error.code ? ` (code ${error.code})` : '') +
    ' — this is a FAILED READ, not an empty result; the UI may be rendering absence.'
  )
}

// ─── Schools ─────────────────────────────────────────────────────────────────

export function useSchools() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  // Distinguishes a FAILED read from an empty one (see reportFetchError).
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const fetchSchools = useCallback(async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
    reportFetchError('schools', error)
    setError(error?.message ?? null)
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
    if (!error) {
      setSchools(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
      // Auto-decline interested camps when school moves to Nope
      if (updates.category === 'Nope') {
        // Both id forms — see camp-host.ts. After E1.5 an .eq() here matches
        // nothing, so deleting a school would silently leave its camps behind.
        const { data: school } = await supabase
          .from('schools').select('id, discovery_school_id').eq('id', id).maybeSingle()
        const { data: campIds } = await supabase
          .from('camps')
          .select('id')
          .in('host_school_id', campHostFilterIds(school ?? { id }))
        if (campIds && campIds.length > 0) {
          await supabase
            .from('camp_family_status')
            .update({
              status: 'declined',
              declined_at: new Date().toISOString(),
              declined_reason: 'School moved to Nope tier',
            })
            .in('camp_id', campIds.map(c => c.id))
            .eq('status', 'interested')
        }
      }
    }
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

  return { schools, loading, error, updateSchool, insertSchool, deleteSchool, reorderSchools, refetch: fetchSchools }
}

// ─── Contact Log ──────────────────────────────────────────────────────────────

// contact_log ↔ schools has TWO foreign keys — contact_log.school_id (the
// message's school) and schools.origin_contact_log_id (auto-add provenance) —
// so a bare `school:schools(...)` embed is AMBIGUOUS and PostgREST refuses it
// with PGRST201. Every embed below names its constraint explicitly. Do not
// "simplify" these back to the bare form: the failure is a silent empty list,
// not an error anyone sees.
export function useContactLog(schoolId?: string) {
  const [entries, setEntries] = useState<ContactLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  // Distinguishes a FAILED read from an empty one (see reportFetchError).
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const fetchEntries = useCallback(async () => {
    let query = supabase
      .from('contact_log')
      .select('*, school:schools!contact_log_school_id_fkey(id, name, short_name)')
      .order('sent_at', { ascending: false })
    if (schoolId) query = query.eq('school_id', schoolId)
    const { data, error } = await query
    reportFetchError('contact_log', error)
    setError(error?.message ?? null)
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
    const { data, error } = await supabase.from('contact_log').insert(entry).select('*, school:schools!contact_log_school_id_fkey(id, name, short_name)').single()
    if (!error && data) setEntries(prev => [data as ContactLogEntry, ...prev])
    return error
  }, [supabase])

  const insertContacts = useCallback(async (entries: Omit<ContactLogEntry, 'id' | 'created_at' | 'school'>[]) => {
    const { data, error } = await supabase.from('contact_log').insert(entries).select('*, school:schools!contact_log_school_id_fkey(id, name, short_name)')
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

  return { entries, loading, error, insertContact, insertContacts, updateEntry, deleteEntry, markHandled, markUnhandled, snoozeEntry, dismissEntry, undoEntry, refetch: fetchEntries }
}

// ─── Action Items ─────────────────────────────────────────────────────────────

export function useActionItems(schoolId?: string) {
  const [items, setItems] = useState<ActionItem[]>([])
  const [completedItems, setCompletedItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  // Distinguishes a FAILED read from an empty one (see reportFetchError).
  const [error, setError] = useState<string | null>(null)
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
    reportFetchError('action_items', error)
    setError(error?.message ?? null)
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

  return { items, completedItems, loading, error, insertItem, updateItem, completeItem, deleteItem, reorderItems, refetch: fetchItems }
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  // Distinguishes a FAILED read from an empty one (see reportFetchError).
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const fetchAssets = useCallback(async () => {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .order('created_at', { ascending: false })
    reportFetchError('assets', error)
    setError(error?.message ?? null)
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

  return { assets, loading, error, insertLink, updateAsset, archiveAsset, removeAsset, getSignedUrl, refetch: fetchAssets }
}

// ─── Questions ────────────────────────────────────────────────────────────────

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  // Distinguishes a FAILED read from an empty one (see reportFetchError).
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const fetchQuestions = useCallback(async () => {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    reportFetchError('questions', error)
    setError(error?.message ?? null)
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

  return { questions, loading, error, insertQuestion, updateQuestion, deleteQuestion }
}

// ─── Coaches ──────────────────────────────────────────────────────────────────

export function useCoaches(schoolId?: string) {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [archivedCoaches, setArchivedCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  // Distinguishes a FAILED read from an empty one (see reportFetchError).
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const fetchCoaches = useCallback(async () => {
    if (!schoolId) {
      setCoaches([])
      setArchivedCoaches([])
      setLoading(false)
      return
    }
    // Fetch active coaches
    const { data, error } = await supabase
      .from('coaches')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    reportFetchError('coaches', error)
    setError(error?.message ?? null)
    if (!error && data) setCoaches(data as Coach[])
    // Fetch archived coaches
    const { data: archived } = await supabase
      .from('coaches')
      .select('*')
      .eq('school_id', schoolId)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
    if (archived) setArchivedCoaches(archived as Coach[])
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

  const archiveCoach = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('coaches').update({ archived_at: now, is_active: false }).eq('id', id)
    if (!error) {
      setCoaches(prev => {
        const coach = prev.find(c => c.id === id)
        if (coach) setArchivedCoaches(ap => [{ ...coach, archived_at: now, is_active: false }, ...ap])
        return prev.filter(c => c.id !== id)
      })
    }
    return error
  }, [supabase])

  const unarchiveCoach = useCallback(async (id: string) => {
    const { error } = await supabase.from('coaches').update({ archived_at: null, is_active: true }).eq('id', id)
    if (!error) {
      setArchivedCoaches(prev => {
        const coach = prev.find(c => c.id === id)
        if (coach) setCoaches(cp => [...cp, { ...coach, archived_at: null, is_active: true }].sort((a, b) => a.sort_order - b.sort_order))
        return prev.filter(c => c.id !== id)
      })
    }
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

  return { coaches, archivedCoaches, loading, error, insertCoach, updateCoach, archiveCoach, unarchiveCoach, setPrimary, refetch: fetchCoaches }
}

// ─── Camps ───────────────────────────────────────────────────────────────────

export function useCamps(schools: School[], schoolsLoading?: boolean) {
  const [camps, setCamps] = useState<CampWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  // Use a ref for schools to avoid re-creating fetchCamps (and tearing down
  // the realtime channel) every time the schools array reference changes.
  const schoolsRef = useRef(schools)
  schoolsRef.current = schools

  const fetchCamps = useCallback(async () => {
    // camp_coach_attendees was DROPPED in E1.5 chunk C — it never held a row,
    // so it was dropped rather than migrated. Reading it now would 404.
    const [campsRes, statusRes, attendeesRes] = await Promise.all([
      supabase.from('camps').select('*').order('start_date', { ascending: true }),
      supabase.from('camp_family_status').select('*'),
      // NO schools embed — camp_school_attendees.school_id re-targets
      // discovery_schools at E1.5. Attendee schools are resolved against the
      // family's own list in buildCampsWithRelations (see camp-host.ts).
      supabase.from('camp_school_attendees').select('*'),
    ])

    if (campsRes.error || !campsRes.data) {
      reportFetchError('camps', campsRes.error)
      setLoading(false); return
    }

    const composed = composeCampsWithRelations(
      campsRes.data as Camp[],
      schoolsRef.current,
      (statusRes.data ?? []) as CampFamilyStatus[],
      (attendeesRes.data ?? []) as Array<CampSchoolAttendee & { school: Pick<School, 'id' | 'name' | 'short_name' | 'category'> }>,
      [],   // camp_coach_attendees dropped (chunk C); the shape stays for now
    )
    setCamps(composed)
    setLoading(false)
  }, [supabase])

  // Stable channel subscription — mounts once, never tears down on schools changes
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel(`camps-all-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camps' }, fetchCamps)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camp_family_status' }, fetchCamps)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'camp_school_attendees' }, fetchCamps)

      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  // Fetch camps once the schools source has SETTLED — resolved-empty counts.
  // Gating on rows>0 hung every camps consumer at "Loading..." for a
  // zero-school family (the first zero-school viewer in the app's history).
  // Callers that pass schoolsLoading get the settled signal; callers that
  // don't keep the legacy first-rows trigger (they never render zero-state).
  const schoolsSettled = schoolsLoading === undefined ? schools.length > 0 : !schoolsLoading
  useEffect(() => {
    if (schoolsSettled) fetchCamps()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolsSettled])

  const createCamp = useCallback(async (data: Omit<Camp, 'id' | 'created_at' | 'updated_at'>): Promise<{ id: string | null; error: string | null }> => {
    const result = await createCampMutation(supabase, data)
    if (!result.error) await fetchCamps()
    return { id: result.camp?.id ?? null, error: result.error }
  }, [supabase, fetchCamps])

  const updateCamp = useCallback(async (id: string, data: Partial<Omit<Camp, 'id' | 'created_at' | 'updated_at'>>) => {
    const error = await updateCampMutation(supabase, id, data)
    if (!error) await fetchCamps()
    return error
  }, [supabase, fetchCamps])

  const updateFamilyStatus = useCallback(async (campId: string, status: CampFamilyStatusValue, opts?: { declined_reason?: string; notes?: string }) => {
    const error = await updateFamilyStatusMutation(supabase, campId, status, opts)
    if (!error) await fetchCamps()
    return error
  }, [supabase, fetchCamps])

  const deleteCamp = useCallback(async (id: string) => {
    const error = await deleteCampMutation(supabase, id)
    if (!error) await fetchCamps()
    return error
  }, [supabase, fetchCamps])

  const addSchoolAttendee = useCallback(async (campId: string, schoolId: string, source?: string) => {
    const error = await addSchoolAttendeeMutation(supabase, campId, schoolId, source)
    if (!error) await fetchCamps()
    return error
  }, [supabase, fetchCamps])

  const removeSchoolAttendee = useCallback(async (campId: string, schoolId: string) => {
    const error = await removeSchoolAttendeeMutation(supabase, campId, schoolId)
    if (!error) await fetchCamps()
    return error
  }, [supabase, fetchCamps])

  return { camps, loading, createCamp, updateCamp, updateFamilyStatus, deleteCamp, addSchoolAttendee, removeSchoolAttendee }
}

// ─── Messages ───────────────────────────────────────────────────────────────

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
    reportFetchError('messages', error)
    if (!error && data) setMessages(data as Message[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchMessages()
    const channel = supabase
      .channel(`messages-changes-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchMessages)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchMessages, supabase])

  const insertMessage = useCallback(async (msg: Pick<Message, 'title' | 'type' | 'notes' | 'expires_at'>) => {
    const { data, error } = await supabase.from('messages').insert(msg).select('*').single()
    if (!error && data) setMessages(prev => [data as Message, ...prev])
    return error
  }, [supabase])

  const updateMessage = useCallback(async (id: string, updates: Partial<Pick<Message, 'title' | 'type' | 'notes' | 'expires_at' | 'status'>>) => {
    const { error } = await supabase.from('messages').update(updates).eq('id', id)
    if (!error) setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } as Message : m))
    return error
  }, [supabase])

  const archiveMessage = useCallback(async (id: string) => {
    return updateMessage(id, { status: 'archived' })
  }, [updateMessage])

  const unarchiveMessage = useCallback(async (id: string) => {
    return updateMessage(id, { status: 'active' })
  }, [updateMessage])

  const deleteMessage = useCallback(async (id: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (!error) setMessages(prev => prev.filter(m => m.id !== id))
    return error
  }, [supabase])

  return { messages, loading, insertMessage, updateMessage, archiveMessage, unarchiveMessage, deleteMessage }
}

// ─── School Message Log (coverage tracking) ─────────────────────────────────

export interface SchoolMessageLogEntry {
  id: string
  message_id: string
  school_id: string
  contact_log_id: string | null
  detected_at: string
  detection_source: 'auto' | 'manual'
  notes: string | null
  created_at: string
  school: { name: string; short_name: string | null; category: string } | null
}

export function useSchoolMessageLog(messageId: string | null) {
  const [entries, setEntries] = useState<SchoolMessageLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchEntries = useCallback(async () => {
    if (!messageId) { setEntries([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('school_message_log')
      .select('*, school:schools(name, short_name, category)')
      .eq('message_id', messageId)
      .order('detected_at', { ascending: false })
    if (!error && data) setEntries(data as SchoolMessageLogEntry[])
    setLoading(false)
  }, [supabase, messageId])

  useEffect(() => {
    setLoading(true)
    fetchEntries()
    if (!messageId) return
    const channel = supabase
      .channel(`school-message-log-${messageId}-${Date.now()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'school_message_log',
        filter: `message_id=eq.${messageId}`,
      }, fetchEntries)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchEntries, supabase, messageId])

  return { entries, loading }
}

// ─── Call Prep Docs ─────────────────────────────────────────────────────────

export function useCallPrepDocs(schoolId?: string) {
  const [docs, setDocs] = useState<CallPrepDoc[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchDocs = useCallback(async () => {
    if (!schoolId) {
      setDocs([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('prep_docs')
      .select('*')
      .eq('school_id', schoolId)
      .eq('doc_type', 'call')          // camp docs live on the camp detail page, not here
      .order('generated_at', { ascending: false })
    if (error) {
      console.error('[useCallPrepDocs] fetch error:', error)
    } else if (data) {
      setDocs(data as CallPrepDoc[])
    }
    setLoading(false)
  }, [supabase, schoolId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  return { docs, loading, refetch: fetchDocs }
}

// ─── Camp prep doc (one per camp; drafts have null content/storage_path) ─────

export function useCampPrepDoc(campId?: string) {
  const [doc, setDoc] = useState<CallPrepDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchDoc = useCallback(async () => {
    if (!campId) { setDoc(null); setLoading(false); return }
    const { data, error } = await supabase
      .from('prep_docs')
      .select('*')
      .eq('camp_id', campId)
      .eq('doc_type', 'camp')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) console.error('[useCampPrepDoc] fetch error:', error)
    setDoc((data as CallPrepDoc | null) ?? null)
    setLoading(false)
  }, [supabase, campId])

  useEffect(() => { fetchDoc() }, [fetchDoc])

  return { doc, loading, refetch: fetchDoc }
}

// ─── School research (the shared per-school research asset) ──────────────────

export function useSchoolResearch(schoolId?: string) {
  const [research, setResearch] = useState<CurrentResearchRow | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchResearch = useCallback(async () => {
    if (!schoolId) { setResearch(null); setLoading(false); return }
    const { data, error } = await supabase
      .from('school_research')
      .select('id, school_id, generated_at, status, model, tool_call_count, error, is_current, snapshot, sources, fetched_urls')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) console.error('[useSchoolResearch] fetch error:', error)
    setResearch((data as CurrentResearchRow | null) ?? null)
    setLoading(false)
  }, [supabase, schoolId])

  useEffect(() => { fetchResearch() }, [fetchResearch])

  return { research, loading, refetch: fetchResearch }
}

// ─── School Status Updates ────────────────────────────────────────────────────

export function useStatusUpdates(schoolId?: string) {
  const [updates, setUpdates] = useState<SchoolStatusUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchUpdates = useCallback(async () => {
    if (!schoolId) {
      setUpdates([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('school_status_updates')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
    reportFetchError('school_status_updates', error)
    if (!error && data) setUpdates(data as SchoolStatusUpdate[])
    setLoading(false)
  }, [supabase, schoolId])

  useEffect(() => {
    fetchUpdates()
    const channel = supabase
      .channel(`status-updates-${schoolId ?? 'none'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_status_updates' }, fetchUpdates)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchUpdates, supabase, schoolId])

  const insertUpdate = useCallback(async (update: { school_id: string; body: string; share_with_coach: ShareWithCoach }) => {
    const { data, error } = await supabase.from('school_status_updates').insert(update).select().single()
    if (!error && data) setUpdates(prev => [data as SchoolStatusUpdate, ...prev])
    return { data, error }
  }, [supabase])

  const updateUpdate = useCallback(async (id: string, fields: { body?: string; share_with_coach?: ShareWithCoach }) => {
    const { error } = await supabase.from('school_status_updates').update(fields).eq('id', id)
    if (!error) setUpdates(prev => prev.map(u => u.id === id ? { ...u, ...fields } : u))
    return error
  }, [supabase])

  const deleteUpdate = useCallback(async (id: string) => {
    const { error } = await supabase.from('school_status_updates').delete().eq('id', id)
    if (!error) setUpdates(prev => prev.filter(u => u.id !== id))
    return error
  }, [supabase])

  return { updates, loading, insertUpdate, updateUpdate, deleteUpdate, refetch: fetchUpdates }
}

// ─── School Milestones ──────────────────────────────────────────────────────

export function useMilestones(schoolId?: string) {
  const [milestones, setMilestones] = useState<SchoolMilestone[]>([])
  const supabase = useMemo(() => createClient(), [])

  const fetchMilestones = useCallback(async () => {
    if (!schoolId) { setMilestones([]); return }
    const { data, error } = await supabase
      .from('school_milestones')
      .select('*')
      .eq('school_id', schoolId)
      .order('occurred_on', { ascending: true })
    reportFetchError('school_milestones', error)
    if (!error && data) setMilestones(data as SchoolMilestone[])
  }, [supabase, schoolId])

  useEffect(() => {
    fetchMilestones()
    const channel = supabase
      .channel(`milestones-${schoolId ?? 'none'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_milestones' }, fetchMilestones)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchMilestones, supabase, schoolId])

  const upsertMilestone = useCallback(async (ms: { school_id: string; milestone: MilestoneType; occurred_on?: string | null; note?: string | null }) => {
    const { data, error } = await supabase
      .from('school_milestones')
      .upsert(ms, { onConflict: 'school_id,milestone' })
      .select()
      .single()
    if (!error && data) {
      setMilestones(prev => {
        const existing = prev.find(m => m.milestone === ms.milestone)
        if (existing) return prev.map(m => m.milestone === ms.milestone ? data as SchoolMilestone : m)
        return [...prev, data as SchoolMilestone]
      })
    }
    return { data, error }
  }, [supabase])

  const removeMilestone = useCallback(async (id: string) => {
    const { error } = await supabase.from('school_milestones').delete().eq('id', id)
    if (!error) setMilestones(prev => prev.filter(m => m.id !== id))
    return error
  }, [supabase])

  return { milestones, upsertMilestone, removeMilestone }
}

// ─── Calendar Events (migration 061) ───────────────────────────────────────────

type CalendarEventInput = Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at' | 'school_ids'>

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchEvents = useCallback(async () => {
    const [evRes, linkRes] = await Promise.all([
      supabase.from('calendar_events').select('*').order('start_date', { ascending: true }),
      supabase.from('calendar_event_schools').select('event_id, school_id'),
    ])
    if (evRes.error || !evRes.data) { setLoading(false); return }
    const linksByEvent = new Map<string, string[]>()
    for (const l of (linkRes.data ?? []) as { event_id: string; school_id: string }[]) {
      const arr = linksByEvent.get(l.event_id) ?? []
      arr.push(l.school_id)
      linksByEvent.set(l.event_id, arr)
    }
    setEvents((evRes.data as CalendarEvent[]).map(e => ({ ...e, school_ids: linksByEvent.get(e.id) ?? [] })))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchEvents()
    const channel = supabase
      .channel(`calendar-events-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, fetchEvents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_event_schools' }, fetchEvents)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchEvents, supabase])

  // Replace the school linkage rows for an event to match `schoolIds`.
  const syncSchoolLinks = useCallback(async (eventId: string, schoolIds: string[]) => {
    await supabase.from('calendar_event_schools').delete().eq('event_id', eventId)
    if (schoolIds.length > 0) {
      await supabase.from('calendar_event_schools')
        .insert(schoolIds.map(school_id => ({ event_id: eventId, school_id })))
    }
  }, [supabase])

  const insertEvent = useCallback(async (input: CalendarEventInput, schoolIds: string[]) => {
    const { data, error } = await supabase.from('calendar_events').insert(input).select().single()
    if (error || !data) return error
    if (schoolIds.length > 0) await syncSchoolLinks((data as CalendarEvent).id, schoolIds)
    await fetchEvents()
    return null
  }, [supabase, syncSchoolLinks, fetchEvents])

  const updateEvent = useCallback(async (id: string, input: Partial<CalendarEventInput>, schoolIds?: string[]) => {
    const { error } = await supabase.from('calendar_events').update(input).eq('id', id)
    if (error) return error
    if (schoolIds) await syncSchoolLinks(id, schoolIds)
    await fetchEvents()
    return null
  }, [supabase, syncSchoolLinks, fetchEvents])

  const deleteEvent = useCallback(async (id: string) => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (!error) await fetchEvents()
    return error
  }, [supabase, fetchEvents])

  return { events, loading, insertEvent, updateEvent, deleteEvent, refetch: fetchEvents }
}
