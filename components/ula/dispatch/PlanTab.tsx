'use client'

import React, { useMemo, useState } from 'react'
import { Plus, Save, CheckCircle2, Trash2, Pencil, Truck, Search } from 'lucide-react'
import { Modal, TextField, DateField, SelectField, TextArea, FormSection, EmptyBlock, Chip, GateBox, NoteBanner, usePaged, Pager, confirmAction, reportSave, toast, useUserName } from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { useDispatches, useLots, useBeneficiaries, useIps, useWarehouses, useContracts, updateBeneficiaries } from '@/lib/ula/data'
import { upsert, remove, newId, nextNumber, logActivity } from '@/lib/ula/storage'
import { stageOf, today, fmtDate, fmtDateTime, nowIso } from '@/lib/ula/workflow'
import type { Dispatch, Lot } from '@/lib/ula/types'
import { contractDispatchGate } from '../material/stock'

export function useDispatchGate() {
  const contracts = useContracts()
  return (lot?: Lot) => {
    if (!lot) return ['Lot not found']
    const g = contractDispatchGate(contracts.find((c) => c.id === lot.contractId), today())
    if (!lot.materialReadyAt) g.unshift('Material Ready not sent for this lot')
    return g
  }
}

export function PlanTab() {
  const dispatches = useDispatches()
  const lots = useLots()
  const ips = useIps()
  const whs = useWarehouses()
  const user = useUserName()
  const gate = useDispatchGate()
  const [status, setStatus] = useState<'open' | 'all'>('open')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Dispatch | null>(null)

  const list = dispatches.filter((d) => {
    const lot = lots.find((l) => l.id === d.lotId)
    const s = q.toLowerCase()
    return (status === 'all' || d.status === 'Planned' || d.status === 'Approved') && (!s || [d.dispatchNo, d.cluster, d.route, lot?.lotNo].some((x) => x?.toLowerCase().includes(s)))
  })
  const paged = usePaged(list, 20)

  const blank = (): Dispatch => ({
    id: '',
    dispatchNo: '',
    lotId: '',
    ipId: '',
    warehouseId: whs.length === 1 ? whs[0].id : '',
    cluster: '',
    route: '',
    beneficiaryIds: [],
    plannedDate: today(),
    status: 'Planned',
    vehicleNo: '',
    driverMobile: '',
    challanNo: '',
    invoiceNo: '',
    ewayBillNo: '',
    remarks: '',
  })

  const approve = (d: Dispatch) => {
    const g = gate(lots.find((l) => l.id === d.lotId))
    if (g.length) return toast(`Cannot approve: ${g.join('; ')}`, 'error')
    if (!confirmAction(`Approve dispatch plan ${d.dispatchNo} (${d.beneficiaryIds.length} sites)? IP readiness must be confirmed.`)) return
    if (reportSave(upsert('dispatches', { ...d, status: 'Approved', approvedBy: user, approvedAt: nowIso() }), `${d.dispatchNo} approved`)) logActivity(user, 'Dispatch', d.id, 'Plan approved by Project')
  }

  const del = (d: Dispatch) => {
    if (!confirmAction(`Delete dispatch plan ${d.dispatchNo}? Its sites return to the planning queue.`)) return
    const ok = updateBeneficiaries(d.beneficiaryIds, (b) => (b.dispatchedAt ? b : { ...b, dispatchId: undefined }), user, `Removed from plan ${d.dispatchNo}`) && remove('dispatches', d.id)
    if (reportSave(ok, `${d.dispatchNo} deleted`)) logActivity(user, 'Dispatch', d.id, 'Plan deleted')
  }

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <div className="search-box table-search grow">
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search plan no., lot, cluster, route…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row">
          <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value as 'open' | 'all')} aria-label="Status">
            <option value="open">Planned &amp; approved</option>
            <option value="all">All plans</option>
          </select>
          <button type="button" className="primary-btn" onClick={() => setEdit(blank())}>
            <Plus className="w-4 h-4" /> New dispatch plan
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyBlock icon={Truck} title="No dispatch plans" text="Plan vehicles once Material Ready is sent and sites have survey and design approved." />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Lot</th>
                  <th>IP</th>
                  <th>Warehouse</th>
                  <th>Cluster / route</th>
                  <th>Sites</th>
                  <th>Planned</th>
                  <th>Gate</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((d) => {
                  const lot = lots.find((l) => l.id === d.lotId)
                  const g = gate(lot)
                  return (
                    <tr key={d.id}>
                      <td className="strong-cell">{d.dispatchNo}</td>
                      <td>{lot?.lotNo || '—'}</td>
                      <td>{ips.find((i) => i.id === d.ipId)?.name || '—'}</td>
                      <td>{whs.find((w) => w.id === d.warehouseId)?.name || '—'}</td>
                      <td>
                        {d.cluster || '—'}
                        <br />
                        <small className="muted">{d.route}</small>
                      </td>
                      <td>{d.beneficiaryIds.length}</td>
                      <td>{fmtDate(d.plannedDate)}</td>
                      <td>{g.length ? <Chip tone="bad">{g[0]}</Chip> : <Chip tone="good">Clear</Chip>}</td>
                      <td>
                        <Chip tone={d.status === 'Planned' ? 'warn' : d.status === 'Received' ? 'good' : 'info'}>{d.status}</Chip>
                        {d.approvedAt && (
                          <>
                            <br />
                            <small className="muted">
                              {d.approvedBy} · {fmtDateTime(d.approvedAt)}
                            </small>
                          </>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="row-actions">
                          {d.status === 'Planned' && (
                            <>
                              <button type="button" className="action-icon-btn" title="Edit" onClick={() => setEdit(d)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" className="primary-btn btn-sm" onClick={() => approve(d)} disabled={g.length > 0}>
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                            </>
                          )}
                          {(d.status === 'Planned' || d.status === 'Approved') && (
                            <button type="button" className="action-icon-btn danger" title="Delete plan" onClick={() => del(d)}>
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
          </div>
          <Pager {...paged} />
        </>
      )}
      {edit && <PlanModal initial={edit} onClose={() => setEdit(null)} />}
    </section>
  )
}

function PlanModal({ initial, onClose }: { initial: Dispatch; onClose: () => void }) {
  const dispatches = useDispatches()
  const lots = useLots()
  const bens = useBeneficiaries()
  const ips = useIps()
  const whs = useWarehouses()
  const user = useUserName()
  const gate = useDispatchGate()
  const [d, setD] = useState<Dispatch>(initial)
  const [view, setView] = useState<string | null>(null)

  const lot = lots.find((l) => l.id === d.lotId)
  const eligible = useMemo(
    () => bens.filter((b) => b.lotId === d.lotId && stageOf(b) === 'Awaiting Dispatch' && (!b.dispatchId || b.dispatchId === d.id) && (!d.ipId || b.ipId === d.ipId)),
    [bens, d.lotId, d.ipId, d.id]
  )
  const ipOptions = useMemo(() => {
    const ids = new Set(bens.filter((b) => b.lotId === d.lotId && b.ipId).map((b) => b.ipId as string))
    return ips.filter((i) => ids.has(i.id))
  }, [bens, ips, d.lotId])
  const g = gate(lot)

  const save = () => {
    const miss: string[] = []
    if (!d.lotId) miss.push('lot')
    if (!lot?.materialReadyAt) miss.push('Material Ready for the lot')
    if (!d.ipId) miss.push('IP')
    if (!d.warehouseId) miss.push('warehouse')
    if (!d.cluster.trim()) miss.push('cluster')
    if (!d.route.trim()) miss.push('route')
    if (!d.plannedDate) miss.push('planned date')
    const ids = d.beneficiaryIds.filter((id) => eligible.some((b) => b.id === id))
    if (!ids.length) miss.push('at least one site')
    if (miss.length) return toast(`Required: ${miss.join(', ')}`, 'error')
    const isNew = !d.id
    const saved: Dispatch = { ...d, beneficiaryIds: ids, id: d.id || newId('DSP'), dispatchNo: d.dispatchNo || nextNumber(dispatches.map((x) => x.dispatchNo), 'DSP') }
    const removed = initial.beneficiaryIds.filter((id) => !ids.includes(id))
    const ok =
      upsert('dispatches', saved) &&
      updateBeneficiaries(ids, (b) => ({ ...b, dispatchId: saved.id }), user, `Planned on ${saved.dispatchNo}`) &&
      (removed.length ? updateBeneficiaries(removed, (b) => ({ ...b, dispatchId: undefined }), user, `Removed from ${saved.dispatchNo}`) : true)
    if (reportSave(ok, `${saved.dispatchNo} ${isNew ? 'created' : 'updated'} — awaiting Project approval`)) {
      logActivity(user, 'Dispatch', saved.id, isNew ? `Plan created (${ids.length} sites)` : 'Plan edited')
      onClose()
    }
  }

  const toggle = (id: string, on: boolean) => setD({ ...d, beneficiaryIds: on ? [...d.beneficiaryIds, id] : d.beneficiaryIds.filter((x) => x !== id) })

  return (
    <Modal
      size="wide"
      eyebrow="Dispatch planning"
      title={d.dispatchNo || 'New dispatch plan'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="muted" style={{ fontSize: 11, marginRight: 'auto' }}>
            {d.beneficiaryIds.length} site(s) selected
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> Save plan
          </button>
        </>
      }
    >
      <div className="form-grid">
        <SelectField
          label="Lot"
          required
          value={d.lotId}
          disabled={!!initial.id}
          onChange={(v) => setD({ ...d, lotId: v, ipId: '', beneficiaryIds: [] })}
          options={lots.map((l) => ({ value: l.id, label: `${l.lotNo} · ${l.district}${l.materialReadyAt ? '' : ' (Material Ready not sent)'}` }))}
        />
        <SelectField label="Installation partner" required value={d.ipId} onChange={(v) => setD({ ...d, ipId: v, beneficiaryIds: [] })} options={ipOptions.map((i) => ({ value: i.id, label: i.name }))} hint={d.lotId && !ipOptions.length ? 'No sites of this lot are assigned to an IP yet (Work Orders)' : undefined} />
        <SelectField label="Dispatch from warehouse" required value={d.warehouseId} onChange={(v) => setD({ ...d, warehouseId: v })} options={whs.map((w) => ({ value: w.id, label: `${w.name} (${w.kind})` }))} />
        <DateField label="Planned date" required value={d.plannedDate} onChange={(v) => setD({ ...d, plannedDate: v })} />
        <TextField label="Cluster" required value={d.cluster} onChange={(v) => setD({ ...d, cluster: v })} placeholder="e.g. Abhanpur block" />
        <TextField label="Route" required value={d.route} onChange={(v) => setD({ ...d, route: v })} placeholder="e.g. Raipur WH → Abhanpur → Gobra Nayapara" />
        <TextArea label="Remarks" span2 rows={2} value={d.remarks} onChange={(v) => setD({ ...d, remarks: v })} />
      </div>
      {d.lotId && <GateBox missing={g} okText="Contract & Compliance gate clear: GTP approved, insurance valid, Material Ready sent" title="Dispatch gate closed — the plan can be saved but not approved" />}
      {lot?.materialReadyPartial && <NoteBanner>Material Ready was sent for part of this lot only (design-approved sites).</NoteBanner>}
      <FormSection
        title={`Sites ready for dispatch (${eligible.length})`}
        aside={
          eligible.length > 0 && (
            <button type="button" className="outline-btn btn-sm" onClick={() => setD({ ...d, beneficiaryIds: d.beneficiaryIds.length === eligible.length ? [] : eligible.map((b) => b.id) })}>
              {d.beneficiaryIds.length === eligible.length ? 'Clear all' : 'Select all'}
            </button>
          )
        }
      >
        {!d.lotId || !d.ipId ? (
          <span className="muted" style={{ fontSize: 11 }}>Choose a lot and IP to list sites.</span>
        ) : eligible.length === 0 ? (
          <span className="muted" style={{ fontSize: 11 }}>No sites of this IP are at &quot;Awaiting Dispatch&quot; (survey accepted + design approved) and unplanned.</span>
        ) : (
          <div className="table-wrap card">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Beneficiary</th>
                  <th>kW</th>
                  <th>Sub-division</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <input type="checkbox" checked={d.beneficiaryIds.includes(b.id)} onChange={(e) => toggle(b.id, e.target.checked)} aria-label={`Select ${b.name}`} />
                    </td>
                    <td>
                      <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                        <strong>{b.name}</strong>
                        <small>{b.appNo}</small>
                      </button>
                    </td>
                    <td>{b.sanctionedKw}</td>
                    <td>{b.subDivision || '—'}</td>
                    <td>{b.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </Modal>
  )
}
