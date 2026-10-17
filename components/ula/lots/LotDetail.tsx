'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, Plus, Lock, Pencil, Trash2, Eye, Search, Download, Users } from 'lucide-react'
import { MiniStat, EmptyBlock, DaysChip, Chip, ProgressBar, FileChip, usePaged, Pager, confirmAction, reportSave, useUserName, NoteBanner } from '../ui'
import { StatusPill } from '@/components/contracts/StatusPill'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { BeneficiaryImport } from './BeneficiaryImport'
import { BeneficiaryFormModal } from './BeneficiaryFormModal'
import { LotFormModal } from './LotFormModal'
import { useBeneficiaries, useContracts, useIpMap, usePurchaseOrders, useDispatches, useWorkOrders } from '@/lib/ula/data'
import { patch, remove, logActivity } from '@/lib/ula/storage'
import {
  summarizeLot,
  useSettings,
  stageOf,
  STAGES,
  STAGE_TONE,
  completeness,
  completenessPct,
  fmtDate,
  fmtInr,
  fmtInrShort,
  nowIso,
  downloadCsv,
  type Stage,
} from '@/lib/ula/workflow'
import type { Beneficiary, Lot } from '@/lib/ula/types'

const STAGE_COLORS: Partial<Record<Stage, string>> = {
  Survey: '#d6a03a',
  'CSPDCL Review': '#c66d2f',
  Design: '#8a78d1',
  'Awaiting Dispatch': '#b2bec3',
  'In Transit': '#5b8bd8',
  Installation: '#3d74c9',
  QC: '#2d97b5',
  'Portal Update': '#2aa59a',
  Inspection: '#239485',
  Commissioning: '#1b8573',
  Commissioned: '#127a5f',
  Dropped: '#d6575b',
}

export function LotDetail({ lot }: { lot: Lot }) {
  const all = useBeneficiaries()
  const contracts = useContracts()
  const ips = useIpMap()
  const pos = usePurchaseOrders()
  const dispatches = useDispatches()
  const wos = useWorkOrders()
  const settings = useSettings()
  const user = useUserName()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<Stage | ''>('')
  const [view, setView] = useState<string | null>(null)
  const [editBen, setEditBen] = useState<Beneficiary | null | 'new'>(null)
  const [importing, setImporting] = useState(false)
  const [editLot, setEditLot] = useState(false)

  const list = useMemo(() => all.filter((b) => b.lotId === lot.id), [all, lot.id])
  const summary = summarizeLot(lot, all, settings)
  const contract = contracts.find((c) => c.id === lot.contractId)
  const lotPos = pos.filter((p) => p.lotId === lot.id && p.status === 'Received')

  const rows = useMemo(
    () =>
      list.map((b) => {
        const items = completeness(b, { lotPos, dispatch: dispatches.find((d) => d.id === b.dispatchId) }, settings)
        return { b, stage: stageOf(b), pct: completenessPct(items) }
      }),
    [list, lotPos, dispatches, settings]
  )
  const avgPct = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase()
    return (!t || [r.b.appNo, r.b.name, r.b.consumerNo, r.b.mobile, r.b.subDivision].some((x) => x?.toLowerCase().includes(t))) && (!stage || r.stage === stage)
  })
  const paged = usePaged(filtered, 25)

  const lockList = () => {
    if (!list.length) return
    if (!confirmAction(`Lock the beneficiary list of ${lot.lotNo}? ${list.length} beneficiaries will be frozen — no additions, deletions or identity changes (Sec-1 cl. 2.4).`)) return
    if (reportSave(patch<Lot>('lots', lot.id, (l) => ({ ...l, listLocked: true, lockedAt: nowIso() })), `Beneficiary list of ${lot.lotNo} locked`))
      logActivity(user, 'Lot', lot.id, `Beneficiary list locked (${list.length} records)`)
  }

  const deleteBen = (b: Beneficiary) => {
    if (lot.listLocked) return
    if (!confirmAction(`Remove ${b.name} (${b.appNo}) from ${lot.lotNo}?`)) return
    if (reportSave(remove('beneficiaries', b.id), `${b.name} removed`)) logActivity(user, 'Lot', lot.id, `Removed beneficiary ${b.appNo}`)
  }

  const exportCsv = () =>
    downloadCsv(`${lot.lotNo}-beneficiaries.csv`, [
      ['Application No', 'Name', 'Mobile', 'Consumer No', 'kW', 'District', 'Division', 'Sub-division', 'AE', 'IP', 'Stage', 'Checklist %'],
      ...rows.map((r) => [r.b.appNo, r.b.name, r.b.mobile, r.b.consumerNo, r.b.sanctionedKw, r.b.district, r.b.division, r.b.subDivision, r.b.aeName, r.b.ipId ? ips.get(r.b.ipId)?.name : '', r.stage, r.pct]),
    ])

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <Link href="/lots" className="back-link">
            <ArrowLeft className="w-4 h-4" /> Back to lot register
          </Link>
          <h1 className="mt-2">Lot {lot.lotNo}</h1>
          <p>
            {contract ? `${contract.packageCode} · ${contract.contractName}` : 'Package not found'} · Letter {lot.allotmentLetterNo} · {lot.district}
            {lot.circle ? ` · ${lot.circle}` : ''}
            {lot.division ? ` · ${lot.division}` : ''}
          </p>
        </div>
        <div className="heading-actions">
          <StatusPill value={summary.status === 'Commissioned' ? 'Completed' : summary.status === 'Overdue' ? 'Overdue' : summary.status === 'In Execution' ? 'In Progress' : 'Pending'} />
          <button type="button" className="outline-btn" onClick={() => setEditLot(true)}>
            <Pencil className="w-3.5 h-3.5" /> Edit lot
          </button>
          {!lot.listLocked && (
            <>
              <button type="button" className="outline-btn" onClick={() => setImporting(true)}>
                <Upload className="w-3.5 h-3.5" /> Import list
              </button>
              <button type="button" className="primary-btn" onClick={lockList} disabled={!list.length} title={list.length ? '' : 'Import the beneficiary list first'}>
                <Lock className="w-3.5 h-3.5" /> Lock list
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mini-stats">
        <MiniStat label="D0 allotment" value={fmtDate(lot.allotmentDate)} />
        <MiniStat
          label="D5 feasibility report"
          value={lot.feasibilityReportDate ? fmtDate(lot.feasibilityReportDate) : fmtDate(summary.d5)}
          hint={lot.feasibilityReportDate ? 'Sent to CSPDCL' : `${summary.surveyPending} survey(s) pending`}
          tone={lot.feasibilityReportDate ? 'good' : undefined}
        />
        <MiniStat label="Commissioning due" value={fmtDate(summary.dueDate)} hint={lot.feasibilityReportDate ? 'Report date + 25 days' : 'Provisional: D0 + 30'} tone={summary.overdue ? 'bad' : summary.daysLeft <= 5 ? 'warn' : undefined} />
        <MiniStat label="Sites / kW" value={`${summary.activeSites} / ${summary.kw}`} hint={summary.stageCounts.Dropped ? `${summary.stageCounts.Dropped} dropped` : undefined} />
        <MiniStat label="Lot value (excl. GST)" value={fmtInrShort(summary.value)} hint={`${fmtInrShort(summary.unfinishedValue)} unfinished`} />
        <MiniStat label="LD exposure" value={summary.ldAmount ? fmtInr(summary.ldAmount) : '—'} tone={summary.ldAmount ? 'bad' : 'good'} hint={summary.ldWeeks ? `${summary.ldWeeks} week(s) late` : 'Not late'} />
      </div>

      <section className="card section-card">
        <div className="section-title">
          <div>
            <h3>Stage distribution</h3>
            <p>
              {summary.commissioned} of {summary.activeSites} sites commissioned · average billing checklist {avgPct}% · <DaysChip days={summary.daysLeft} doneText={summary.allCommissioned ? 'All commissioned' : undefined} />
            </p>
          </div>
          {lot.allotmentLetter && <FileChip file={lot.allotmentLetter} />}
        </div>
        {list.length > 0 && (
          <>
            <div className="stage-bar">
              {STAGES.filter((s) => summary.stageCounts[s]).map((s) => (
                <span key={s} title={`${s}: ${summary.stageCounts[s]}`} style={{ width: `${(summary.stageCounts[s] / list.length) * 100}%`, background: STAGE_COLORS[s] }} />
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              {STAGES.filter((s) => summary.stageCounts[s]).map((s) => (
                <button key={s} type="button" className={`chip ${stage === s ? 'info' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setStage(stage === s ? '' : s)}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: STAGE_COLORS[s], display: 'inline-block' }} /> {s}: {summary.stageCounts[s]}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {!lot.listLocked && list.length > 0 && (
        <div style={{ margin: '14px 0' }}>
          <NoteBanner>The list is not locked yet. Check it against the CSPDCL allotment letter, then lock it — field teams work only on locked lists.</NoteBanner>
        </div>
      )}

      <section className="card table-card" style={{ marginTop: 14 }}>
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder="Search application no., name, consumer no., mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="row">
            <select className="filter-select" value={stage} onChange={(e) => setStage(e.target.value as Stage)} aria-label="Stage">
              <option value="">All stages</option>
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" className="outline-btn" onClick={exportCsv} disabled={!list.length}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            {!lot.listLocked && (
              <button type="button" className="outline-btn" onClick={() => setEditBen('new')}>
                <Plus className="w-3.5 h-3.5" /> Add one
              </button>
            )}
          </div>
        </div>
        {list.length === 0 ? (
          <EmptyBlock
            icon={Users}
            title="No beneficiaries in this lot"
            text="Import the list received from CSPDCL / district administration."
            action={
              <button type="button" className="primary-btn" onClick={() => setImporting(true)}>
                <Upload className="w-4 h-4" /> Import beneficiary list
              </button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Application / Name</th>
                    <th>Consumer no.</th>
                    <th>kW</th>
                    <th>Sub-division / AE</th>
                    <th>IP / Work order</th>
                    <th>Stage</th>
                    <th>Billing checklist</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map(({ b, stage: st, pct }) => {
                    const wo = wos.find((w) => w.id === b.workOrderId)
                    return (
                      <tr key={b.id}>
                        <td>
                          <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                            <strong>{b.name}</strong>
                            <small>
                              {b.appNo} · {b.mobile}
                            </small>
                          </button>
                        </td>
                        <td>{b.consumerNo}</td>
                        <td>{b.sanctionedKw}</td>
                        <td>
                          {b.subDivision || '—'}
                          <br />
                          <small className="muted">{b.aeName || 'AE not set'}</small>
                        </td>
                        <td>{b.ipId ? `${ips.get(b.ipId)?.name || 'Unknown IP'}${wo ? ` · ${wo.woNo}` : ''}` : <Chip>Unassigned</Chip>}</td>
                        <td>
                          <StatusPill value={STAGE_TONE[st]} /> <small>{st}</small>
                        </td>
                        <td>
                          <ProgressBar pct={pct} />
                        </td>
                        <td className="text-right">
                          <div className="row-actions">
                            <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="action-icon-btn" title={lot.listLocked ? 'Edit mapping' : 'Edit'} onClick={() => setEditBen(b)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {!lot.listLocked && (
                              <button type="button" className="action-icon-btn danger" title="Remove" onClick={() => deleteBen(b)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyBlock title="No beneficiaries match" />}
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>

      {importing && <BeneficiaryImport lot={lot} onClose={() => setImporting(false)} />}
      {editBen && <BeneficiaryFormModal lot={lot} initial={editBen === 'new' ? undefined : editBen} onClose={() => setEditBen(null)} />}
      {editLot && <LotFormModal initial={lot} onClose={() => setEditLot(false)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </div>
  )
}
