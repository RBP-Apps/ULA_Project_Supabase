'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Eye, Pencil, Trash2, BriefcaseBusiness, Lock, Download } from 'lucide-react'
import { PageHeader, MiniStat, EmptyBlock, DaysChip, ProgressBar, Chip, usePaged, Pager, useSort, confirmAction, reportSave, useUserName } from '../ui'
import { LotFormModal } from './LotFormModal'
import { useContracts, useLotSummaries, useBeneficiaries, useWorkOrders } from '@/lib/ula/data'
import { removeWhere, remove, logActivity } from '@/lib/ula/storage'
import { fmtDate, fmtInrShort, downloadCsv, useSettings, ldRefundTracker, LD_REFUND_DEADLINE } from '@/lib/ula/workflow'
import { deleteFile } from '@/lib/ula/files'
import type { Lot, Beneficiary, WorkOrder } from '@/lib/ula/types'

const STATUS_FILTERS = ['All', 'Allotted', 'In Execution', 'Overdue', 'Commissioned'] as const

export function LotRegister() {
  const summaries = useLotSummaries()
  const contracts = useContracts()
  const bens = useBeneficiaries()
  const wos = useWorkOrders()
  const settings = useSettings()
  const user = useUserName()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('All')
  const [pkg, setPkg] = useState('')
  const [district, setDistrict] = useState('')
  const [editing, setEditing] = useState<Lot | null | 'new'>(null)

  const districts = useMemo(() => Array.from(new Set(summaries.map((s) => s.lot.district).filter(Boolean))).sort(), [summaries])

  const filtered = summaries.filter((s) => {
    const t = q.toLowerCase()
    const hit = !t || [s.lot.lotNo, s.lot.allotmentLetterNo, s.lot.district, s.lot.division, s.lot.circle].some((x) => x?.toLowerCase().includes(t))
    return hit && (status === 'All' || s.status === status) && (!pkg || s.lot.contractId === pkg) && (!district || s.lot.district === district)
  })
  const { sorted, header } = useSort(filtered, { key: 'due', dir: 1 }, (s, k) =>
    k === 'lot' ? s.lot.lotNo : k === 'd0' ? s.lot.allotmentDate : k === 'kw' ? s.kw : k === 'ld' ? s.ldAmount : s.dueDate
  )
  const paged = usePaged(sorted, 20)

  const totals = {
    lots: summaries.length,
    sites: summaries.reduce((a, s) => a + s.activeSites, 0),
    kw: summaries.reduce((a, s) => a + s.kw, 0),
    overdue: summaries.filter((s) => s.overdue).length,
    ld: summaries.reduce((a, s) => a + s.ldAmount, 0),
    commissioned: summaries.reduce((a, s) => a + s.commissioned, 0),
  }

  const deleteLot = (lot: Lot) => {
    const list = bens.filter((b) => b.lotId === lot.id)
    const progressed = list.filter((b) => b.survey.status !== 'Pending' || b.dispatchId)
    if (progressed.length) {
      alert(`Lot ${lot.lotNo} cannot be deleted: ${progressed.length} beneficiary record(s) already have survey or dispatch data.`)
      return
    }
    if (!confirmAction(`Delete lot ${lot.lotNo} and its ${list.length} beneficiary record(s)? This cannot be undone.`)) return
    const ok =
      removeWhere<Beneficiary>('beneficiaries', (b) => b.lotId === lot.id) &&
      removeWhere<WorkOrder>('workOrders', (w) => w.lotId === lot.id) &&
      remove('lots', lot.id)
    if (lot.allotmentLetter) deleteFile(lot.allotmentLetter.id)
    if (reportSave(ok, `Lot ${lot.lotNo} deleted`)) logActivity(user, 'Lot', lot.id, `Lot ${lot.lotNo} deleted`)
  }

  const exportCsv = () => {
    downloadCsv('lot-register.csv', [
      ['Lot', 'Package', 'Letter no.', 'D0', 'D5', 'Due', 'District', 'Circle', 'Division', 'Sites', 'kW', 'Value', 'Commissioned', 'Status', 'LD'],
      ...sorted.map((s) => [
        s.lot.lotNo,
        contracts.find((c) => c.id === s.lot.contractId)?.packageCode || '',
        s.lot.allotmentLetterNo,
        s.lot.allotmentDate,
        s.d5,
        s.dueDate,
        s.lot.district,
        s.lot.circle,
        s.lot.division,
        s.activeSites,
        s.kw,
        Math.round(s.value),
        s.commissioned,
        s.status,
        Math.round(s.ldAmount),
      ]),
    ])
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Project Setup · Stage 1"
        title="Lots & Beneficiaries"
        description="Lot register by package, circle and division. Each lot carries its own 30-day clock; the CSPDCL beneficiary list is imported and locked."
        actions={
          <>
            <button type="button" className="outline-btn" onClick={exportCsv} disabled={!summaries.length}>
              <Download className="w-4 h-4" /> Export
            </button>
            <button type="button" className="primary-btn" onClick={() => setEditing('new')}>
              <Plus className="w-4 h-4" /> Register lot
            </button>
          </>
        }
      />

      <div className="mini-stats">
        <MiniStat label="Lots" value={totals.lots} onClick={() => setStatus('All')} active={status === 'All'} />
        <MiniStat label="Active sites" value={totals.sites} hint={`${totals.kw.toLocaleString('en-IN')} kW`} />
        <MiniStat label="Commissioned sites" value={totals.commissioned} tone="good" onClick={() => setStatus('Commissioned')} active={status === 'Commissioned'} />
        <MiniStat label="Lots past due" value={totals.overdue} tone={totals.overdue ? 'bad' : undefined} onClick={() => setStatus('Overdue')} active={status === 'Overdue'} />
        <MiniStat label="LD exposure (live)" value={fmtInrShort(totals.ld)} tone={totals.ld ? 'bad' : undefined} hint={`${settings.sla.ldPercentPerWeek}% of unfinished value / week`} />
      </div>

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder="Search lot no., letter no., district, division…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="row">
            <select className="filter-select" value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Package">
              <option value="">All packages</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.packageCode || c.contractName}
                </option>
              ))}
            </select>
            <select className="filter-select" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
              <option value="">All districts</option>
              {districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
              {STATUS_FILTERS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {summaries.length === 0 ? (
          <EmptyBlock
            icon={BriefcaseBusiness}
            title="No lots registered"
            text="When CSPDCL issues an allotment letter, register the lot here and import its beneficiary list."
            action={
              <button type="button" className="primary-btn" onClick={() => setEditing('new')}>
                <Plus className="w-4 h-4" /> Register first lot
              </button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {header('lot', 'Lot')}
                    <th>Package / Area</th>
                    {header('d0', 'D0')}
                    <th>D5 report</th>
                    {header('due', 'Due date')}
                    {header('kw', 'Sites / kW')}
                    <th>Value</th>
                    <th>Commissioned</th>
                    {header('ld', 'LD')}
                    <th>List</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((s) => {
                    const c = contracts.find((x) => x.id === s.lot.contractId)
                    const pct = s.activeSites ? Math.round((s.commissioned / s.activeSites) * 100) : 0
                    const woCount = wos.filter((w) => w.lotId === s.lot.id).length
                    return (
                      <tr key={s.lot.id}>
                        <td>
                          <Link href={`/lots/${s.lot.id}`} className="cell-title">
                            <strong>{s.lot.lotNo}</strong>
                            <small>{s.lot.allotmentLetterNo}</small>
                          </Link>
                        </td>
                        <td>
                          <div className="cell-title">
                            <strong>{c?.packageCode || <span className="muted">Package missing</span>}</strong>
                            <small>
                              {s.lot.district} · {s.lot.circle || '—'} · {s.lot.division || '—'}
                            </small>
                          </div>
                        </td>
                        <td>{fmtDate(s.lot.allotmentDate)}</td>
                        <td>
                          {s.lot.feasibilityReportDate ? (
                            <Chip tone="good">Sent {fmtDate(s.lot.feasibilityReportDate)}</Chip>
                          ) : (
                            <span>{fmtDate(s.d5)}</span>
                          )}
                        </td>
                        <td>
                          <div className="cell-title">
                            <strong>{fmtDate(s.dueDate)}</strong>
                            <DaysChip days={s.daysLeft} doneText={s.allCommissioned ? 'Completed' : undefined} />
                          </div>
                        </td>
                        <td>
                          {s.activeSites} / {s.kw} kW
                          {s.stageCounts.Dropped > 0 && <small className="muted"> (+{s.stageCounts.Dropped} dropped)</small>}
                        </td>
                        <td>{fmtInrShort(s.value)}</td>
                        <td>
                          <ProgressBar pct={pct} />
                        </td>
                        <td>{s.ldAmount > 0 ? <Chip tone="bad">{fmtInrShort(s.ldAmount)}</Chip> : '—'}</td>
                        <td>
                          {s.lot.listLocked ? (
                            <Chip tone="good">
                              <Lock className="w-3 h-3" /> Locked
                            </Chip>
                          ) : (
                            <Chip tone="warn">{s.sites ? 'Not locked' : 'No list'}</Chip>
                          )}
                          {woCount > 0 && <small className="muted"> · {woCount} WO</small>}
                        </td>
                        <td className="text-right">
                          <div className="row-actions">
                            <Link href={`/lots/${s.lot.id}`} className="action-icon-btn" title="Open lot">
                              <Eye className="w-3.5 h-3.5" />
                            </Link>
                            <button type="button" className="action-icon-btn" title="Edit lot" onClick={() => setEditing(s.lot)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="action-icon-btn danger" title="Delete lot" onClick={() => deleteLot(s.lot)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyBlock title="No lots match these filters" />}
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>

      <LdRefundSection />

      {editing && <LotFormModal initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Sec-4 cl. 8.1: LD on a delayed lot is refunded if it and the next lot both finish on time (till 30.04.2027). */
function LdRefundSection() {
  const summaries = useLotSummaries()
  const bens = useBeneficiaries()
  const settings = useSettings()
  const rows = ldRefundTracker(summaries, bens, settings)
  if (!rows.length) return null
  return (
    <section className="card table-card" style={{ marginTop: 16 }}>
      <div className="toolbar-row">
        <div>
          <strong style={{ fontSize: 13 }}>LD catch-up tracker</strong>
          <p className="muted" style={{ fontSize: 10, margin: '3px 0 0' }}>
            LD on a delayed lot is refundable when the next lot of the same package finishes on time (until {fmtDate(LD_REFUND_DEADLINE)}).
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Delayed lot</th>
              <th>LD accrued</th>
              <th>Completed</th>
              <th>Next lot</th>
              <th>Refund status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lot.lot.id}>
                <td className="strong-cell">{r.lot.lot.lotNo}</td>
                <td>{fmtInrShort(r.lot.ldAmount)}</td>
                <td>{r.completedOn ? fmtDate(r.completedOn) : '—'}</td>
                <td>{r.nextLot ? `${r.nextLot.lot.lotNo} (due ${fmtDate(r.nextLot.dueDate)})` : '—'}</td>
                <td>
                  <Chip tone={r.status === 'Refund eligible' ? 'good' : r.status === 'Not eligible' ? 'bad' : 'warn'}>{r.status}</Chip>
                  <br />
                  <small className="muted">{r.reason}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
