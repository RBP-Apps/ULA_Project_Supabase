'use client'

// Single localStorage access layer for the ULA modules.
// Every collection is a JSON array of records with a unique `id`.
// Components subscribe through useCollection(), so a write on one page
// is reflected on every mounted page (and in other tabs via the storage event).

import { useSyncExternalStore } from 'react'

const PREFIX = 'surya-setu-ula-'

export const COLLECTIONS = {
  lots: 'lots',
  beneficiaries: 'beneficiaries',
  workOrders: 'work-orders',
  ips: 'ips',
  warehouses: 'warehouses',
  items: 'items',
  bomTemplates: 'bom-templates',
  purchaseOrders: 'purchase-orders',
  stockMoves: 'stock-moves',
  dispatches: 'dispatches',
  dockets: 'dockets',
  payments: 'payments',
  ipBills: 'ip-bills',
  cmcVisits: 'cmc-visits',
  tickets: 'tickets',
  cmcBills: 'cmc-bills',
  monitoring: 'monitoring',
  handovers: 'handovers',
  roles: 'roles',
  activity: 'activity',
} as const

export type CollectionName = keyof typeof COLLECTIONS

type Listener = () => void
const listeners = new Set<Listener>()
const cache = new Map<string, { raw: string | null; value: unknown }>()
let lastError: string | null = null

function storageKey(name: string) {
  return PREFIX + name
}

function emit() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(PREFIX)) emit()
  })
}

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Read a JSON value; returns `fallback` for missing or corrupted data. Snapshot is cached per raw string. */
export function readKey<T>(name: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  let raw: string | null = null
  try {
    raw = localStorage.getItem(storageKey(name))
  } catch {
    return fallback
  }
  const hit = cache.get(name)
  if (hit && hit.raw === raw) return hit.value as T
  let value: unknown = fallback
  if (raw) {
    try {
      value = JSON.parse(raw)
      if (Array.isArray(fallback) && !Array.isArray(value)) value = fallback
    } catch {
      console.error(`Corrupted localStorage value for ${name}; using defaults.`)
      value = fallback
    }
  }
  cache.set(name, { raw, value })
  return value as T
}

/** Write a JSON value. Returns false (and records the error) when storage is full or blocked. */
export function writeKey(name: string, value: unknown): boolean {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(value))
    lastError = null
    emit()
    return true
  } catch (e) {
    lastError =
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Browser storage is full. Remove old files or records and try again.'
        : 'Could not save to browser storage.'
    console.error(lastError, e)
    return false
  }
}

export function getStorageError() {
  return lastError
}

const EMPTY: never[] = []

export function getAll<T extends { id: string }>(c: CollectionName): T[] {
  return readKey<T[]>(COLLECTIONS[c], EMPTY as T[])
}

export function getById<T extends { id: string }>(c: CollectionName, id: string): T | undefined {
  return getAll<T>(c).find((r) => r.id === id)
}

/** Insert or update by id. */
export function upsert<T extends { id: string }>(c: CollectionName, record: T): boolean {
  const all = getAll<T>(c)
  const exists = all.some((r) => r.id === record.id)
  const next = exists ? all.map((r) => (r.id === record.id ? record : r)) : [record, ...all]
  return writeKey(COLLECTIONS[c], next)
}

export function upsertMany<T extends { id: string }>(c: CollectionName, records: T[]): boolean {
  const byId = new Map(getAll<T>(c).map((r) => [r.id, r]))
  const fresh: T[] = []
  for (const r of records) {
    if (byId.has(r.id)) byId.set(r.id, r)
    else fresh.push(r)
  }
  return writeKey(COLLECTIONS[c], [...fresh, ...Array.from(byId.values())])
}

/** Apply `fn` to the record with this id and save it. */
export function patch<T extends { id: string }>(c: CollectionName, id: string, fn: (r: T) => T): boolean {
  const all = getAll<T>(c)
  let found = false
  const next = all.map((r) => {
    if (r.id !== id) return r
    found = true
    return fn(r)
  })
  return found ? writeKey(COLLECTIONS[c], next) : false
}

/** Apply `fn` to every record whose id is in `ids`, in a single write. */
export function patchMany<T extends { id: string }>(c: CollectionName, ids: string[], fn: (r: T) => T): boolean {
  const set = new Set(ids)
  return writeKey(
    COLLECTIONS[c],
    getAll<T>(c).map((r) => (set.has(r.id) ? fn(r) : r))
  )
}

export function remove(c: CollectionName, id: string): boolean {
  return writeKey(
    COLLECTIONS[c],
    getAll<{ id: string }>(c).filter((r) => r.id !== id)
  )
}

export function removeWhere<T extends { id: string }>(c: CollectionName, pred: (r: T) => boolean): boolean {
  return writeKey(
    COLLECTIONS[c],
    getAll<T>(c).filter((r) => !pred(r))
  )
}

/** Unique id: prefix + time + random suffix (never array positions). */
export function newId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${rand}`
}

/** Human-readable running number, e.g. WO-0007, based on existing records. */
export function nextNumber(existing: string[], prefix: string, width = 4) {
  let max = 0
  for (const s of existing) {
    const m = s?.match(/(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`
}

/** Subscribe a component to a collection. Server render returns []. */
export function useCollection<T extends { id: string }>(c: CollectionName): T[] {
  return useSyncExternalStore(
    subscribe,
    () => getAll<T>(c),
    () => EMPTY as T[]
  )
}

/** Subscribe to an arbitrary key (used for settings). */
export function useKey<T>(name: string, fallback: T): T {
  return useSyncExternalStore(
    subscribe,
    () => readKey<T>(name, fallback),
    () => fallback
  )
}

/** True after hydration; use to avoid flashing empty states during SSR. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}

/** Notify subscribers about changes made outside writeKey (e.g. the legacy contracts store). */
export function notifyChange() {
  emit()
}

export function logActivity(by: string, entity: string, entityId: string, action: string) {
  const all = getAll<{ id: string }>('activity')
  const entry = { id: newId('ACT'), at: new Date().toISOString(), by, entity, entityId, action }
  // keep the log bounded so it never fills storage
  writeKey(COLLECTIONS.activity, [entry, ...all].slice(0, 2000))
}

/** Remove every ULA key (used by Settings > reset). Files in IndexedDB are cleared separately. */
export function clearAllUlaData() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
    cache.clear()
    emit()
  } catch (e) {
    console.error('Error clearing ULA data', e)
  }
}

export function exportAllUlaData(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) out[k] = JSON.parse(localStorage.getItem(k) || 'null')
    }
  } catch (e) {
    console.error('Export failed', e)
  }
  return out
}

export function storageUsageKb(): number {
  let total = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      total += k.length + (localStorage.getItem(k) || '').length
    }
  } catch {
    /* ignore */
  }
  return Math.round((total * 2) / 1024)
}
