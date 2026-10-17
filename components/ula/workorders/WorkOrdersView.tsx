'use client'

import React, { useMemo, useState } from 'react'
import { Plus, Search, Eye, Pencil, CheckCircle2, XCircle, Lock, Trash2, ClipboardList, Download, AlertTriangle } from 'lucide-react'
import { PageHeader, MiniStat, EmptyBlock, Chip, DaysChip, ProgressBar, Modal, usePaged, Pager, confirmAction, reportSave, useUserName, toast } from '../ui'
import { StatusPill } from '@/components/contracts/StatusPill'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { WorkOrderFormModal } from './WorkOrderFormModal'
import { useWorkOrders, useBeneficiaries, useLotMap, useIpMap, updateBeneficiaries } from '@/lib/ula/data'
import { patch, remove, logActivity } from '@/lib/ula/storage'
import { useSettings, stageOf, STAGE_TONE, fmtDate, fmtDateTime, daysBetween, today, hoursSince, nowIso, downloadCsv } from '@/lib/ula/workflow'
import type { WorkOrder, Beneficiary } from '@/lib/ula/types'

const STATUS = ['All', 'Issued', 'Accepted', 'Declined', 'Closed'] as const

export function WorkOrdersView() {
  const wos = useWorkOrders()
  const bens = useBeneficiaries()
  const lots = useLotMap()
  const ips = useIpMap()
  const settings = useSettings()
  const user = useUserName()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<(typeof STATUS)[number]>('All')
  const [lotId, setLotId] = useState('')
  const [ipId, setIpId] = useState('')
  const [editing, setEditing] = useState<WorkOrder | 'new' | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [viewBen, setViewBen] = useState<string | null>(null)

  const benMap = useMemo(() => new Map(bens.map((b) => [b.id, b])), [bens])
  const siteList = (w: WorkOrder) => w.beneficiaryIds.map((id) => benMap.get(id)).filter(Boolean) as Beneficiary[]

  const rows = useMemo(
    () =>
      wos.map((w) => {
        const sites = siteList(w)
        const done = sites.filter((b) => ['Commissioned', 'Dropped'].includes(stageOf(b))).length
        const commissioned = sites.filter((b) => stageOf(b) === 'Commissioned').length
        const kw = sites.reduce((a, b) => a + (b.sanctionedKw || 0), 0)
        const lateAccept = w.status === 'Issued' && hoursSince(w.issuedAt) > settings.sla.workOrderAcceptHours
        return { w, sites, done, commissioned, kw, lateAccept }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wos, benMap, settings]
  )

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase()
    const lot = lots.get(r.w.lotId)
    return (
      (!t || [r.w.woNo, r.w.cluster, lot?.lotNo, ips.get(r.w.ipId)?.name].some((x) => x?.toLowerCase().includes(t))) &&
      (status === 'All' || r.w.status === status) &&
      (!lotId || r.w.lotId === lotId) &&
      (!ipId || r.w.ipId === ipId)
    )
  })
  const paged = usePaged(filtered, 20)
  const lotOptions = Array.from(new Set(wos.map((w) => w.lotId))).map((id) => lots.get(id)).filter(Boolean)
  const ipOptions = Array.from(new Set(wos.map((w) => w.ipId))).map((id) => ips.get(id)).filter(Boolean)

  const accept = (w: WorkOrder) => {
    if (reportSave(patch<WorkOrder>('workOrders', w.id, (x) => ({ ...x, status: 'Accepted', acceptedAt: nowIso() })), `${w.woNo} accepted`))
      logActivity(user, 'WorkOrder', w.id, 'Accepted by IP')
  }
  const decline = (w: WorkOrder) => {
    const sites = siteList(w)
    if (sites.some((b) => b.dispatchId)) return toast('Some sites are already dispatched — this work order cannot be declined.', 'error')
    const reason = window.prompt(`Reason ${w.woNo} is declined (sites will be unassigned):`)
    if (reason === null) return
    let ok = patch<WorkOrder>('workOrders', w.id, (x) => ({ ...x, status: 'Declined', remarks: [x.remarks, `Declined: ${reason}`].filter(Boolean).join('\n') }))
    if (ok) ok = updateBeneficiaries(w.beneficiaryIds, (b) => (b.workOrderId === w.id ? { ...b, workOrderId: undefined, ipId: undefined } : b), user, `Unassigned — ${w.woNo} declined`)
    if (reportSave(ok, `${w.woNo} declined; ${sites.length} site(s) are unassigned again`)) logActivity(user, 'WorkOrder', w.id, `Declined: ${reason}`)
  }
  const close = (w: WorkOrder, done: number, total: number) => {
    if (done < total) return toast(`${total - done} site(s) are not yet commissioned or dropped`, 'error')
    if (!confirmAction(`Close ${w.woNo}?`)) return
    if (reportSave(patch<WorkOrder>('workOrders', w.id, (x) => ({ ...x, status: 'Closed' })), `${w.woNo} closed`)) logActivity(user, 'WorkOrder', w.id, 'Closed')
  }
  const cancel = (w: WorkOrder) => {
    const sites = siteList(w)
    if (sites.some((b) => b.dispatchId || b.survey.status !== 'Pending')) return toast('Sites already have survey or dispatch data — decline or edit sites instead of deleting.', 'error')
    if (!confirmAction(`Delete ${w.woNo} and unassign its ${sites.length} site(s)?`)) return
    let ok = updateBeneficiaries(w.beneficiaryIds, (b) => (b.workOrderId === w.id ? { ...b, workOrderId: undefined, ipId: undefined } : b), user, `Unassigned — ${w.woNo} cancelled`)
    if (ok) ok = remove('workOrders', w.id)
    if (reportSave(ok, `${w.woNo} deleted`)) logActivity(user, 'WorkOrder', w.id, 'Cancelled and deleted')
  }

  const exportCsv = () =>
    downloadCsv('work-orders.csv', [
      ['WO', 'Lot', 'IP', 'Cluster', 'Issued', 'Due', 'Status', 'Accepted at', 'Sites', 'kW', 'Commissioned'],
      ...filtered.map((r) => [r.w.woNo, lots.get(r.w.lotId)?.lotNo, ips.get(r.w.ipId)?.name, r.w.cluster, r.w.issuedAt.slice(0, 10), r.w.dueDate, r.w.status, r.w.acceptedAt?.slice(0, 10), r.sites.length, r.kw, r.commissioned]),
    ])

  const detailRow = rows.find((r) => r.w.id === detail)
  const unassigned = bens.filter((b) => lots.get(b.lotId)?.listLocked && !b.workOrderId && stageOf(b) !== 'Dropped').length

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Project Setup · Work orders"
        title="Work Orders"
        description="Split each locked lot into installation-partner work orders by district or cluster, with site count, kW and due dates."
        actions={
          <>
            <button type="button" className="outline-btn" onClick={exportCsv} disabled={!wos.length}>
              <Download className="w-4 h-4" /> Export
            </button>
            <button type="button" className="primary-btn" onClick={() => setEditing('new')}>
              <Plus className="w-4 h-4" /> Issue work order
            </button>
          </>
        }
      />

      <div className="mini-stats">
        <MiniStat label="Work orders" value={wos.length} active={status === 'All'} onClick={() => setStatus('All')} />
        <MiniStat label="Awaiting IP acceptance" value={rows.filter((r) => r.w.status === 'Issued').length} tone={rows.some((r) => r.lateAccept) ? 'bad' : 'warn'} hint={`${rows.filter((r) => r.lateAccept).length} over ${settings.sla.workOrderAcceptHours} h`} active={status === 'Issued'} onClick={() => setStatus('Issued')} />
        <MiniStat label="Accepted" value={rows.filter((r) => r.w.status === 'Accepted').length} tone="good" active={status === 'Accepted'} onClick={() => setStatus('Accepted')} />
        <MiniStat label="Sites in work orders" value={rows.filter((r) => r.w.status !== 'Declined').reduce((a, r) => a + r.sites.length, 0)} hint={`${rows.filter((r) => r.w.status !== 'Declined').reduce((a, r) => a + r.kw, 0)} kW`} />
        <MiniStat label="Unassigned sites (locked lots)" value={unassigned} tone={unassigned ? 'warn' : undefined} />
      </div>

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder="Search WO no., cluster, lot, IP…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="row">
            <select className="filter-select" value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lot">
              <option value="">All lots</option>
              {lotOptions.map((l) => (
                <option key={l!.id} value={l!.id}>
                  {l!.lotNo}
                </option>
              ))}
            </select>
            <select className="filter-select" value={ipId} onChange={(e) => setIpId(e.target.value)} aria-label="IP">
              <option value="">All IPs</option>
              {ipOptions.map((i) => (
                <option key={i!.id} value={i!.id}>
                  {i!.name}
                </option>
              ))}
            </select>
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
              {STATUS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {wos.length === 0 ? (
          <EmptyBlock
            icon={ClipboardList}
            title="No work orders yet"
            text="After a lot's beneficiary list is locked, split it among installation partners here."
            action={
              <button type="button" className="primary-btn" onClick={() => setEditing('new')}>
                <Plus className="w-4 h-4" /> Issue first work order
              </button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Work order</th>
                    <th>Lot</th>
                    <th>IP</th>
                    <th>Sites / kW</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map(({ w, sites, done, commissioned, kw, lateAccept }) => (
                    <tr key={w.id}>
                      <td>
                        <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setDetail(w.id)}>
                          <strong>{w.woNo}</strong>
                          <small>{w.cluster || 'No cluster'}</small>
                        </button>
                      </td>
                      <td>{lots.get(w.lotId)?.lotNo || '—'}</td>
                      <td>{ips.get(w.ipId)?.name || 'Unknown IP'}</td>
                      <td>
                        {sites.length} / {kw} kW
                      </td>
                      <td>
                        {fmtDate(w.issuedAt)}
                        {lateAccept && (
                          <>
                            <br />
                            <Chip tone="bad">
                              <AlertTriangle className="w-3 h-3" /> Not accepted in {settings.sla.workOrderAcceptHours} h
                            </Chip>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="cell-title">
                          <strong>{fmtDate(w.dueDate)}</strong>
                          {w.status !== 'Closed' && w.status !== 'Declined' && <DaysChip days={daysBetween(today(), w.dueDate)} doneText={sites.length && done === sites.length ? 'Done' : undefined} />}
                        </div>
                      </td>
                      <td>
                        <ProgressBar pct={sites.length ? Math.round((commissioned / sites.length) * 100) : 0} />
                      </td>
                      <td>
                        <StatusPill value={w.status === 'Issued' ? 'Pending' : w.status === 'Accepted' ? 'Accepted' : w.status === 'Closed' ? 'Completed' : 'Rejected'} /> <small>{w.status}</small>
                      </td>
                      <td className="text-right">
                        <div className="row-actions">
                          <button type="button" className="action-icon-btn" title="View sites" onClick={() => setDetail(w.id)}>
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {(w.status === 'Issued' || w.status === 'Accepted') && (
                            <button type="button" className="action-icon-btn" title="Edit sites" onClick={() => setEditing(w)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {w.status === 'Issued' && (
                            <>
                              <button type="button" className="action-icon-btn" title="Mark accepted by IP" onClick={() => accept(w)}>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" className="action-icon-btn danger" title="Mark declined by IP" onClick={() => decline(w)}>
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {w.status === 'Accepted' && (
                            <button type="button" className="action-icon-btn" title="Close work order" onClick={() => close(w, done, sites.length)}>
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {w.status !== 'Closed' && (
                            <button type="button" className="action-icon-btn danger" title="Delete (only before survey starts)" onClick={() => cancel(w)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyBlock title="No work orders match these filters" />}
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>

      {editing && <WorkOrderFormModal initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}

      {detailRow && (
        <Modal
          size="wide"
          eyebrow={`${lots.get(detailRow.w.lotId)?.lotNo || ''} · ${ips.get(detailRow.w.ipId)?.name || ''}`}
          title={`Work order ${detailRow.w.woNo}`}
          subtitle={`${detailRow.sites.length} sites · ${detailRow.kw} kW · issued ${fmtDateTime(detailRow.w.issuedAt)}${detailRow.w.acceptedAt ? ` · accepted ${fmtDateTime(detailRow.w.acceptedAt)}` : ''} · due ${fmtDate(detailRow.w.dueDate)}`}
          onClose={() => setDetail(null)}
        >
          {detailRow.w.remarks && <p style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{detailRow.w.remarks}</p>}
          <div className="table-wrap card">
            <table>
              <thead>
                <tr>
                  <th>Application / Name</th>
                  <th>kW</th>
                  <th>Sub-division</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {detailRow.sites.map((b) => {
                  const st = stageOf(b)
                  return (
                    <tr key={b.id}>
                      <td>
                        <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setViewBen(b.id)}>
                          <strong>{b.name}</strong>
                          <small>{b.appNo}</small>
                        </button>
                      </td>
                      <td>{b.sanctionedKw}</td>
                      <td>{b.subDivision || '—'}</td>
                      <td>
                        <StatusPill value={STAGE_TONE[st]} /> <small>{st}</small>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {viewBen && <BeneficiaryDrawer id={viewBen} onClose={() => setViewBen(null)} />}
    </div>
  )
}
