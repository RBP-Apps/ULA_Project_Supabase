'use client'

// Shared building blocks for the ULA modules. Styling comes from globals.css + app/ula.css.

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  X,
  Upload,
  Camera,
  Eye,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Info,
  MapPin,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LucideIcon,
} from 'lucide-react'
import type { FileRef } from '@/lib/ula/types'
import { saveFile, deleteFile, openFile, getFileBlob, getPosition, formatSize, validateFile } from '@/lib/ula/files'
import { getSettings, fmtDateTime } from '@/lib/ula/workflow'
import { useAuth } from '@/lib/auth-context'

// ---------------- toasts ----------------

type ToastKind = 'success' | 'error' | 'info'
interface ToastMsg {
  id: number
  kind: ToastKind
  text: string
}
let toasts: ToastMsg[] = []
const toastListeners = new Set<() => void>()
let toastSeq = 0

export function toast(text: string, kind: ToastKind = 'success') {
  const id = ++toastSeq
  toasts = [...toasts, { id, kind, text }]
  toastListeners.forEach((l) => l())
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    toastListeners.forEach((l) => l())
  }, kind === 'error' ? 6000 : 3500)
}

const EMPTY_TOASTS: ToastMsg[] = []

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => {
        toastListeners.delete(l)
      }
    },
    () => toasts,
    () => EMPTY_TOASTS
  )
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

/** Report the result of a storage write honestly. */
export function reportSave(ok: boolean, successText: string) {
  if (ok) toast(successText, 'success')
  else toast('Save failed: browser storage is full or blocked. Nothing was changed.', 'error')
  return ok
}

export function confirmAction(message: string) {
  return typeof window !== 'undefined' && window.confirm(message)
}

export function useUserName() {
  const { user } = useAuth()
  return user?.name || 'Unknown user'
}

// ---------------- layout ----------------

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">
          <span className="live-dot" />
          {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  )
}

export function MiniStat({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'good' | 'warn' | 'bad'
  active?: boolean
  onClick?: () => void
}) {
  const cls = `mini-stat ${tone || ''} ${active ? 'active' : ''}`
  const body = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </>
  )
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  counts,
}: {
  tabs: readonly T[]
  value: T
  onChange: (t: T) => void
  counts?: Partial<Record<T, number>>
}) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={value === t} className={value === t ? 'active' : ''} onClick={() => onChange(t)}>
          {t}
          {counts && counts[t] !== undefined && <b>{counts[t]}</b>}
        </button>
      ))}
    </div>
  )
}

export function EmptyBlock({
  icon: Icon = Inbox,
  title,
  text,
  action,
}: {
  icon?: LucideIcon
  title: string
  text?: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-block">
      <Icon className="w-9 h-9 mx-auto text-slate-300" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function GateBox({ missing, okText, title }: { missing: string[]; okText: string; title?: string }) {
  if (!missing.length)
    return (
      <div className="gate-box ok">
        <strong>
          <CheckCircle2 className="w-4 h-4" /> {okText}
        </strong>
      </div>
    )
  return (
    <div className="gate-box">
      <strong>
        <AlertTriangle className="w-4 h-4" /> {title || `Gate closed — ${missing.length} item(s) missing`}
      </strong>
      <ul>
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  )
}

export function NoteBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="note-banner">
      <Info className="w-4 h-4 shrink-0 mt-px" />
      <div>{children}</div>
    </div>
  )
}

// ---------------- modal / drawer ----------------

export function Modal({
  title,
  eyebrow,
  subtitle,
  onClose,
  children,
  footer,
  size = 'normal',
  drawer = false,
  onSubmit,
}: {
  title: string
  eyebrow?: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'narrow' | 'normal' | 'wide'
  drawer?: boolean
  onSubmit?: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const panelCls = `drawer-panel ${drawer ? 'ula-drawer' : `ula-modal ${size === 'normal' ? '' : size}`}`
  const inner = (
    <>
      <div className="drawer-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="form-scroll">{children}</div>
      {footer && <div className="drawer-footer">{footer}</div>}
    </>
  )
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      {onSubmit ? (
        <form
          className={panelCls}
          onMouseDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          noValidate
        >
          {inner}
        </form>
      ) : (
        <div className={panelCls} onMouseDown={(e) => e.stopPropagation()}>
          {inner}
        </div>
      )}
    </div>
  )
}

export function FormSection({ title, icon: Icon, children, aside }: { title: string; icon?: LucideIcon; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="form-section">
      <div className="form-section-title" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {Icon && <Icon className="w-4 h-4 text-teal-600" />}
          <h3>{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </div>
  )
}

// ---------------- form fields ----------------

interface BaseFieldProps {
  label: string
  required?: boolean
  hint?: string
  error?: string
  span2?: boolean
  disabled?: boolean
}

function FieldWrap({ label, required, hint, error, span2, children }: BaseFieldProps & { children: React.ReactNode }) {
  return (
    <label className={`field ${span2 ? 'span-2' : ''}`}>
      <span>
        {label}
        {required && ' *'}
      </span>
      {children}
      {error ? <small className="err">{error}</small> : hint ? <small className="hint">{hint}</small> : null}
    </label>
  )
}

export function TextField(p: BaseFieldProps & { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number }) {
  return (
    <FieldWrap {...p}>
      <input type={p.type || 'text'} value={p.value ?? ''} placeholder={p.placeholder} maxLength={p.maxLength} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)} />
    </FieldWrap>
  )
}

export function NumberField(p: BaseFieldProps & { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return (
    <FieldWrap {...p}>
      <input
        type="number"
        value={p.value === 0 || p.value ? String(p.value) : ''}
        min={p.min}
        max={p.max}
        step={p.step ?? 'any'}
        placeholder={p.placeholder}
        disabled={p.disabled}
        onChange={(e) => p.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </FieldWrap>
  )
}

export function DateField(p: BaseFieldProps & { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <FieldWrap {...p}>
      <input type="date" value={p.value || ''} min={p.min} max={p.max} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)} />
    </FieldWrap>
  )
}

export function SelectField(
  p: BaseFieldProps & {
    value: string
    onChange: (v: string) => void
    options: (string | { value: string; label: string })[]
    placeholder?: string
  }
) {
  return (
    <FieldWrap {...p}>
      <select value={p.value ?? ''} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)}>
        <option value="">{p.placeholder || 'Select…'}</option>
        {p.options.map((o) => {
          const v = typeof o === 'string' ? o : o.value
          const l = typeof o === 'string' ? o : o.label
          return (
            <option key={v} value={v}>
              {l}
            </option>
          )
        })}
      </select>
    </FieldWrap>
  )
}

export function TextArea(p: BaseFieldProps & { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <FieldWrap {...p}>
      <textarea value={p.value ?? ''} rows={p.rows || 3} placeholder={p.placeholder} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)} />
    </FieldWrap>
  )
}

export function CheckField({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`check-field ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

// ---------------- files ----------------

export function FileChip({ file, onRemove, disabled }: { file: FileRef; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span className="file-chip" title={`${file.name} · ${formatSize(file.size)} · ${fmtDateTime(file.uploadedAt)}`}>
      <span className="name">{file.name}</span>
      <span className="muted">{formatSize(file.size)}</span>
      {file.lat !== undefined && <MapPin className="w-3 h-3 text-teal-600" aria-label="Geotagged" />}
      <button
        type="button"
        title="View"
        onClick={async () => {
          const ok = await openFile(file)
          if (!ok) toast('This file is no longer in browser storage.', 'error')
        }}
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      {onRemove && !disabled && (
        <button type="button" title="Remove" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  )
}

/** Single document upload with view / replace / remove. Files go to IndexedDB. */
export function FileField({
  label,
  value,
  onChange,
  accept = ['.pdf', 'image/'],
  required,
  hint,
  disabled,
  span2,
}: {
  label: string
  value?: FileRef
  onChange: (f: FileRef | undefined) => void
  accept?: string[]
  required?: boolean
  hint?: string
  disabled?: boolean
  span2?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const acceptAttr = accept.map((a) => (a.endsWith('/') ? `${a}*` : a)).join(',')
  const pick = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const ref = await saveFile(file, { accept })
      if (value) await deleteFile(value.id)
      onChange(ref)
      toast(`${file.name} attached`, 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`field ${span2 ? 'span-2' : ''}`}>
      <span>
        {label}
        {required && ' *'}
      </span>
      {value ? (
        <div className="row">
          <FileChip
            file={value}
            disabled={disabled}
            onRemove={() => {
              if (!confirmAction(`Remove ${value.name}?`)) return
              deleteFile(value.id)
              onChange(undefined)
            }}
          />
          {!disabled && (
            <label className="outline-btn btn-sm" style={{ position: 'relative' }}>
              <RefreshCw className="w-3 h-3" /> Replace
              <input type="file" accept={acceptAttr} style={{ position: 'absolute', inset: 0, opacity: 0 }} onChange={(e) => pick(e.target.files?.[0])} />
            </label>
          )}
        </div>
      ) : (
        <div className="upload-box" aria-disabled={disabled}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-slate-400" />}
          <span>{busy ? 'Saving…' : disabled ? 'Not uploaded' : 'Choose file…'}</span>
          {!disabled && <input type="file" accept={acceptAttr} onChange={(e) => pick(e.target.files?.[0])} />}
        </div>
      )}
      {hint && <small className="hint">{hint}</small>}
    </div>
  )
}

function useObjectUrl(id?: string) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let u: string | null = null
    if (id)
      getFileBlob(id).then((b) => {
        if (!alive || !b) return
        u = URL.createObjectURL(b)
        setUrl(u)
      })
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
      setUrl(null)
    }
  }, [id])
  return url
}

export function Thumb({ file }: { file: FileRef }) {
  const url = useObjectUrl(file.type.startsWith('image/') ? file.id : undefined)
  return url ? <img src={url} alt={file.name} /> : <div style={{ height: 90, borderRadius: 5, background: '#eef3f4', display: 'grid', placeItems: 'center' }}>{file.name.split('.').pop()?.toUpperCase()}</div>
}

/**
 * Capture a field photo. Strict policy: the image must be a fresh camera capture
 * (taken within the last 15 minutes) and GPS must be available, so gallery uploads are refused.
 */
export async function captureFieldPhoto(file: File): Promise<FileRef> {
  const err = validateFile(file, { accept: ['image/'] })
  if (err) throw new Error(err)
  const strict = getSettings().photoPolicy === 'strict'
  const ageMin = (Date.now() - file.lastModified) / 60000
  if (strict && ageMin > 15)
    throw new Error('This photo was not taken just now. Field photos must be captured live with the app camera (gallery uploads are not allowed).')
  const geo = await getPosition()
  if (strict && !geo) throw new Error('Location is unavailable. Allow location access so the photo can be geotagged.')
  return saveFile(file, { accept: ['image/'], capturedVia: ageMin <= 15 ? 'camera' : 'upload', geo: geo || undefined })
}

function PhotoInput({ onPick, busy, label }: { onPick: (f: File) => void; busy: boolean; label: string }) {
  return (
    <label className="outline-btn btn-sm" style={{ position: 'relative', justifyContent: 'center' }}>
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />} {busy ? 'Saving…' : label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        style={{ position: 'absolute', inset: 0, opacity: 0 }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPick(f)
        }}
      />
    </label>
  )
}

function PhotoMeta({ file }: { file: FileRef }) {
  return (
    <span className="meta">
      {fmtDateTime(file.uploadedAt)}
      {file.lat !== undefined ? ` · ${file.lat.toFixed(5)}, ${file.lng?.toFixed(5)}` : ' · no GPS'}
    </span>
  )
}

/** Fixed photo list (one slot per required photo). */
export function PhotoSlots({
  slots,
  value,
  onChange,
  disabled,
}: {
  slots: string[]
  value: Record<string, FileRef | undefined>
  onChange: (next: Record<string, FileRef | undefined>) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const take = async (slot: string, f: File) => {
    setBusy(slot)
    try {
      const ref = await captureFieldPhoto(f)
      const old = value[slot]
      if (old) await deleteFile(old.id)
      onChange({ ...value, [slot]: ref })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="photo-grid">
      {slots.map((s) => {
        const f = value[s]
        return (
          <div key={s} className={`photo-slot ${f ? 'filled' : ''}`}>
            <span className="label">{s}</span>
            {f ? (
              <>
                <Thumb file={f} />
                <PhotoMeta file={f} />
                {!disabled && (
                  <div className="row">
                    <PhotoInput label="Retake" busy={busy === s} onPick={(file) => take(s, file)} />
                    <button
                      type="button"
                      className="outline-btn btn-sm"
                      onClick={() => {
                        if (!confirmAction(`Remove photo "${s}"?`)) return
                        deleteFile(f.id)
                        onChange({ ...value, [s]: undefined })
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </>
            ) : disabled ? (
              <span className="muted">Not captured</span>
            ) : (
              <PhotoInput label="Capture" busy={busy === s} onPick={(file) => take(s, file)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Open-ended photo list (e.g. survey photos, damage photos). */
export function PhotoList({
  value,
  onChange,
  disabled,
  min,
}: {
  value: FileRef[]
  onChange: (next: FileRef[]) => void
  disabled?: boolean
  min?: number
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="photo-grid">
        {value.map((f) => (
          <div key={f.id} className="photo-slot filled">
            <Thumb file={f} />
            <PhotoMeta file={f} />
            {!disabled && (
              <button
                type="button"
                className="outline-btn btn-sm"
                onClick={() => {
                  if (!confirmAction('Remove this photo?')) return
                  deleteFile(f.id)
                  onChange(value.filter((x) => x.id !== f.id))
                }}
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <div className="photo-slot" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <PhotoInput
              label="Capture photo"
              busy={busy}
              onPick={async (f) => {
                setBusy(true)
                try {
                  const ref = await captureFieldPhoto(f)
                  onChange([...value, ref])
                } catch (e) {
                  toast((e as Error).message, 'error')
                } finally {
                  setBusy(false)
                }
              }}
            />
          </div>
        )}
      </div>
      {min !== undefined && (
        <small className="muted">
          {value.length} of minimum {min} photos captured
        </small>
      )}
    </div>
  )
}

// ---------------- tables ----------------

export function usePaged<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const slice = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize])
  return { slice, page: current, pages, setPage, total: rows.length, pageSize }
}

export function Pager({ page, pages, setPage, total, pageSize }: { page: number; pages: number; setPage: (n: number) => void; total: number; pageSize: number }) {
  if (total <= pageSize) return total ? <div className="pager">{total} record(s)</div> : null
  return (
    <div className="pager">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="row">
        <button type="button" className="outline-btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-3 h-3" />
        </button>
        <span>
          Page {page} / {pages}
        </span>
        <button type="button" className="outline-btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

export function useSort<T>(rows: T[], initial: { key: string; dir: 1 | -1 }, get: (r: T, key: string) => string | number) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = get(a, sort.key)
      const vb = get(b, sort.key)
      if (va < vb) return -1 * sort.dir
      if (va > vb) return 1 * sort.dir
      return 0
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  const header = (key: string, label: string) => (
    <th className="sortable" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  )
  return { sorted, header }
}

export function Chip({ tone, children }: { tone?: 'good' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  return <span className={`chip ${tone || ''}`}>{children}</span>
}

/** Days-left chip: negative = overdue. */
export function DaysChip({ days, doneText }: { days: number; doneText?: string }) {
  if (doneText) return <Chip tone="good">{doneText}</Chip>
  if (days < 0) return <Chip tone="bad">{-days}d overdue</Chip>
  if (days === 0) return <Chip tone="warn">Due today</Chip>
  if (days <= 2) return <Chip tone="warn">{days}d left</Chip>
  return <Chip tone="info">{days}d left</Chip>
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="progress-cell">
      <div className="progress-track">
        <div className={`progress-fill ${pct >= 100 ? '' : pct < 50 ? 'bad' : 'risk'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  )
}
