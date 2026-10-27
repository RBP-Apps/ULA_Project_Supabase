'use client'

// Files (photos, PDFs, documents) are stored directly in Supabase Storage ('ula-files' bucket).
// IndexedDB is retained as a local offline cache and fallback.

import type { FileRef } from './types'
import { newId } from './storage'
import { supabase } from '../supabase/client'

export const STORAGE_BUCKET = 'ula-files'
const DB_NAME = 'surya-setu-ula-files'
const STORE = 'files'
export const MAX_FILE_MB = 15

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support IndexedDB, so files cannot be cached locally.'))
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
  folder?: string
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

/** Store a file in Supabase Storage and return its reference with public URL. */
export async function saveFile(file: File, opts: SaveOptions = {}): Promise<FileRef> {
  const err = validateFile(file, opts)
  if (err) throw new Error(err)

  // Clean filename and create unique storage path
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const folder = opts.folder ? `${opts.folder}/` : ''
  const storagePath = `${folder}${Date.now()}_${sanitizedName}`
  let publicUrl = ''

  // 1. Upload to Supabase Storage Bucket
  try {
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      })

    if (uploadErr) {
      console.warn('Supabase storage upload error, saving to local cache:', uploadErr.message)
    } else if (uploadData?.path) {
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(uploadData.path)
      publicUrl = urlData?.publicUrl || ''
    }
  } catch (supabaseEx) {
    console.warn('Supabase upload exception:', supabaseEx)
  }

  // 2. Cache in local IndexedDB for instant preview & offline fallback
  try {
    await tx('readwrite', (s) => s.put(file, storagePath))
  } catch {
    // Non-fatal if IndexedDB quota is reached, as file is in Supabase
  }

  return {
    id: storagePath,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
    url: publicUrl || undefined,
    capturedVia: opts.capturedVia || 'upload',
    ...(opts.geo ? { lat: opts.geo.lat, lng: opts.geo.lng } : {}),
  }
}

export async function getFileBlob(id: string): Promise<Blob | undefined> {
  // 1. Try local cache
  try {
    const local = await tx<Blob | undefined>('readonly', (s) => s.get(id))
    if (local) return local
  } catch {
    /* ignore and try supabase */
  }

  // 2. Try Supabase Storage download
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(id)
    if (!error && data) return data
  } catch {
    /* ignore */
  }

  return undefined
}

export async function deleteFile(id: string): Promise<void> {
  // 1. Remove from Supabase Storage
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove([id])
  } catch (e) {
    console.error('Could not delete file from Supabase storage', e)
  }

  // 2. Remove from local IndexedDB
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch (e) {
    console.error('Could not delete file from local storage', e)
  }
}

export async function clearAllFiles(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear())
  } catch (e) {
    console.error('Could not clear local files', e)
  }
}

/** Open a stored file in a new tab. Works with Supabase Storage public URLs and local blobs. */
export async function openFile(ref: FileRef): Promise<boolean> {
  // If we already have a public URL from Supabase Storage, open it directly
  if (ref.url) {
    window.open(ref.url, '_blank', 'noopener')
    return true
  }

  // Try to generate a URL from Supabase
  if (ref.id) {
    try {
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(ref.id)
      if (data?.publicUrl) {
        window.open(data.publicUrl, '_blank', 'noopener')
        return true
      }
    } catch {
      /* fallback to blob */
    }
  }

  // Fallback: try blob from IndexedDB or Supabase download
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
