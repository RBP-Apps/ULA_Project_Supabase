'use client'

// Binary files (photos, PDFs) live in IndexedDB; records keep only a FileRef.

import type { FileRef } from './types'
import { newId } from './storage'

const DB_NAME = 'surya-setu-ula-files'
const STORE = 'files'
export const MAX_FILE_MB = 10

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support IndexedDB, so files cannot be stored.'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Could not open file storage.'))
  })
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      })
  )
}

export interface SaveOptions {
  accept?: string[] // mime prefixes or extensions, e.g. ['image/', '.pdf']
  maxMb?: number
  capturedVia?: 'camera' | 'upload'
  geo?: { lat: number; lng: number }
}

export function validateFile(file: File, opts: SaveOptions = {}): string | null {
  const max = opts.maxMb ?? MAX_FILE_MB
  if (file.size > max * 1024 * 1024) return `${file.name} is larger than ${max} MB.`
  if (opts.accept && opts.accept.length) {
    const name = file.name.toLowerCase()
    const ok = opts.accept.some((a) =>
      a.startsWith('.') ? name.endsWith(a) : file.type.startsWith(a)
    )
    if (!ok) return `${file.name} is not an allowed file type (${opts.accept.join(', ')}).`
  }
  return null
}

/** Store a file and return its reference. Throws with a readable message on failure. */
export async function saveFile(file: File, opts: SaveOptions = {}): Promise<FileRef> {
  const err = validateFile(file, opts)
  if (err) throw new Error(err)
  const id = newId('FILE')
  try {
    await tx('readwrite', (s) => s.put(file, id))
  } catch (e) {
    throw new Error(
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Browser file storage is full.'
        : `Could not save ${file.name}.`
    )
  }
  return {
    id,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
    capturedVia: opts.capturedVia || 'upload',
    ...(opts.geo ? { lat: opts.geo.lat, lng: opts.geo.lng } : {}),
  }
}

export async function getFileBlob(id: string): Promise<Blob | undefined> {
  try {
    return await tx<Blob | undefined>('readonly', (s) => s.get(id))
  } catch {
    return undefined
  }
}

export async function deleteFile(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch (e) {
    console.error('Could not delete file', e)
  }
}

export async function clearAllFiles(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear())
  } catch (e) {
    console.error('Could not clear files', e)
  }
}

/** Open a stored file in a new tab. Returns false if it no longer exists. */
export async function openFile(ref: FileRef): Promise<boolean> {
  const blob = await getFileBlob(ref.id)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** Current GPS position, or null if unavailable / denied (5 s timeout). */
export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 }
    )
  })
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
