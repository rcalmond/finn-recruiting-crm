import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, startOfDay } from 'date-fns'
import type { Status, Category, AdmitLikelihood } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy')
  } catch {
    return dateStr
  }
}

export function daysBetween(dateStr: string): number {
  try {
    const then = startOfDay(parseISO(dateStr))
    const now = startOfDay(new Date())
    return Math.floor((now.getTime() - then.getTime()) / 86400000)
  } catch {
    return 0
  }
}

export function isOverdue(dueDateStr: string | null): boolean {
  if (!dueDateStr) return false
  return dueDateStr < todayStr()
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Color maps ──────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<Status, { bg: string; text: string; dot: string }> = {
  'Not Contacted':       { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
  'Intro Sent':          { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Ongoing Conversation':{ bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  'Visit Scheduled':     { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
  'Offer':               { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },
  'Inactive':            { bg: '#f1f5f9', text: '#94a3b8', dot: '#cbd5e1' },
}

export const ADMIT_COLORS: Record<string, string> = {
  'Likely':    '#10b981',
  'Target':    '#3b82f6',
  'Reach':     '#f59e0b',
  'Far Reach': '#ef4444',
}

export const CATEGORY_COLORS: Record<Category, string> = {
  A:    '#059669',
  B:    '#2563eb',
  C:    '#9333ea',
  Nope: '#94a3b8',
}

export function categoryLabel(cat: Category): string {
  return cat === 'Nope' ? 'Nope' : `Tier ${cat}`
}
