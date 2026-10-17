'use client'

import React, { useState, useEffect, FormEvent } from 'react'
import Link from 'next/link'
import {
  BriefcaseBusiness,
  ClipboardList,
  ClipboardCheck,
  BarChart3,
  ShoppingCart,
  Truck,
  HardHat,
  ShieldCheck,
  FileText,
  PackageCheck,
  WalletCards,
  Gauge,
  Settings2,
  Users,
  Layers,
  ArrowRight,
  Plus,
  Download,
  CheckCircle2,
  LucideIcon,
  X,
  Trash2,
  Calendar,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  lots: BriefcaseBusiness,
  'work-orders': ClipboardList,
  survey: ClipboardCheck,
  design: BarChart3,
  'material-purchase': ShoppingCart,
  dispatch: Truck,
  installation: HardHat,
  qc: ShieldCheck,
  'portal-update': FileText,
  'jcr-status': ClipboardCheck,
  commissioning: PackageCheck,
  invoicing: WalletCards,
  'payment-tracker': WalletCards,
  'ip-payment': WalletCards,
  cmc: Gauge,
  'system-info': Settings2,
  reports: FileText,
  settings: Settings2,
  'users-roles': Users,
}

export interface ModuleRecord {
  id: string
  code: string
  title: string
  date: string
  status: 'Completed' | 'In Progress' | 'Pending'
  remarks: string
}

interface ModulePlaceholderProps {
  title: string
  group: string
  description: string
  iconName?: string
  icon?: LucideIcon
  storageKey?: string
  stats?: { label: string; value: string | number; change?: string }[]
}

export function ModulePlaceholder({
  title,
  group,
  description,
  iconName,
  icon: PropIcon,
  storageKey: customKey,
  stats: customStats,
}: ModulePlaceholderProps) {
  const effectiveKey =
    customKey || `surya-setu-${(iconName || title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  const [records, setRecords] = useState<ModuleRecord[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    code: '',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    status: 'In Progress' as 'Completed' | 'In Progress' | 'Pending',
    remarks: '',
  })

  // Load records from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(effectiveKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setRecords(parsed)
        }
      }
    } catch (e) {
      console.error(`Error loading ${effectiveKey} from localStorage`, e)
    }
  }, [effectiveKey])

  // Save records to localStorage
  const persistRecords = (updated: ModuleRecord[]) => {
    setRecords(updated)
    try {
      localStorage.setItem(effectiveKey, JSON.stringify(updated))
    } catch (e) {
      console.error(`Error saving ${effectiveKey} to localStorage`, e)
    }
  }

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      alert('Please enter a title or description for the record.')
      return
    }

    const newRecord: ModuleRecord = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      code: form.code.trim() || `ID-${Date.now().toString().slice(-4)}`,
      title: form.title.trim(),
      date: form.date || new Date().toISOString().slice(0, 10),
      status: form.status,
      remarks: form.remarks.trim(),
    }

    const updated = [newRecord, ...records]
    persistRecords(updated)
    setForm({
      code: '',
      title: '',
      date: new Date().toISOString().slice(0, 10),
      status: 'In Progress',
      remarks: '',
    })
    setModalOpen(false)
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete record "${name}"?`)) {
      const updated = records.filter((r) => r.id !== id)
      persistRecords(updated)
    }
  }

  const handleClearAll = () => {
    if (confirm(`Are you sure you want to clear all records for "${title}" from local storage?`)) {
      persistRecords([])
    }
  }

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(records, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `${effectiveKey}-export.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  // Resolve icon safely on client
  const Icon: LucideIcon =
    PropIcon ||
    (iconName && ICON_MAP[iconName.toLowerCase()]) ||
    ICON_MAP[title.toLowerCase().replace(/\s+/g, '-')] ||
    Layers

  // Compute metrics from records
  const completedCount = records.filter((r) => r.status === 'Completed').length
  const inProgressCount = records.filter((r) => r.status === 'In Progress').length
  const pendingCount = records.filter((r) => r.status === 'Pending').length
  const completedPct = records.length > 0 ? Math.round((completedCount / records.length) * 100) : 0

  const displayStats = customStats || [
    {
      label: 'Total Records',
      value: records.length,
      change: records.length > 0 ? `${records.length} stored locally` : 'No records in storage',
    },
    {
      label: 'Completed / Verified',
      value: completedCount,
      change: records.length > 0 ? `${completedPct}% of total` : '0%',
    },
    {
      label: 'In Progress',
      value: inProgressCount,
      change: records.length > 0 ? `${inProgressCount} active` : '0 active',
    },
    {
      label: 'Attention Required',
      value: pendingCount,
      change: pendingCount > 0 ? `${pendingCount} pending` : 'None',
    },
  ]

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            {group} · Module
          </span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div className="heading-actions">
          {records.length > 0 && (
            <>
              <button type="button" className="outline-btn text-rose-600 hover:bg-rose-50" onClick={handleClearAll}>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Data</span>
              </button>
              <button type="button" className="outline-btn" onClick={handleExport}>
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="primary-btn"
            onClick={() => setModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Entry</span>
          </button>
        </div>
      </div>

      {/* Module Metrics */}
      <div className="stat-grid">
        {displayStats.map((stat, idx) => (
          <div className="stat-card" key={idx}>
            <div className="stat-top">
              <span className="stat-label">{stat.label}</span>
              <div className="stat-icon teal">
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <strong className="stat-value">{stat.value}</strong>
            {stat.change && (
              <div className="stat-foot">
                <span>{stat.change}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Records Table Card */}
      <section className="card p-0 overflow-hidden">
        <div className="card-head border-b border-slate-100 p-4">
          <div>
            <h2>{title} Records</h2>
            <p className="text-xs text-slate-500">
              Live records persisted in browser local storage key: <code className="text-xs text-teal-700 bg-teal-50 px-1 py-0.5 rounded">{effectiveKey}</code>
            </p>
          </div>
          {records.length > 0 && (
            <span className="text-xs text-slate-500 font-medium">
              Showing {records.length} record{records.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {records.length === 0 ? (
          <div className="flex flex-col items-center text-center max-w-md mx-auto py-16 px-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4 border border-teal-100">
              <Icon className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">
              No {title} Records Found
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              All dummy data has been removed. You can create your first entry using the button below or import records.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="primary-btn"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Entry</span>
              </button>
              <Link href="/contract-compliance" className="outline-btn">
                <span>View Contracts</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code / Ref</th>
                  <th>Description / Title</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong className="text-slate-800">{r.code}</strong>
                    </td>
                    <td>
                      <span className="font-medium text-slate-700">{r.title}</span>
                    </td>
                    <td>
                      <span className="text-slate-500 text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {r.date}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          r.status === 'Completed'
                            ? 'good'
                            : r.status === 'In Progress'
                            ? 'active'
                            : 'pending'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-500">{r.remarks || '—'}</span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="action-icon-btn danger"
                        title="Delete record"
                        onClick={() => handleDelete(r.id, r.title)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add Entry Modal */}
      {modalOpen && (
        <div className="drawer-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="drawer-panel contract-modal-panel max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">{group}</span>
                <h2>Add {title} Entry</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Persists record directly to browser local storage.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div className="drawer-body p-6 flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reference / Record Code
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                    placeholder={`e.g. ${(iconName || 'REC').toUpperCase().slice(0, 4)}-001`}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Title / Description *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                    placeholder={`Enter ${title} record summary`}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Status
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                      value={form.status}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          status: e.target.value as 'Completed' | 'In Progress' | 'Pending',
                        })
                      }
                    >
                      <option value="Completed">Completed</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Remarks / Field Notes
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                    placeholder="Enter any additional remarks or notes..."
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  />
                </div>
              </div>

              <div className="drawer-footer p-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save to Local Storage</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
