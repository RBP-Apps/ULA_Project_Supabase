'use client'

import React, { useMemo, useState } from 'react'
import { Save, ClipboardList } from 'lucide-react'
import { Modal, TextField, DateField, SelectField, TextArea, FormSection, NoteBanner, Chip, reportSave, toast, useUserName } from '../ui'
import { useLots, useBeneficiaries, useIps, useWorkOrders, updateBeneficiaries } from '@/lib/ula/data'
import { upsert, newId, nextNumber, logActivity } from '@/lib/ula/storage'
import { summarizeLot, useSettings, stageOf, nowIso, fmtDate } from '@/lib/ula/workflow'
import type { WorkOrder, Beneficiary } from '@/lib/ula/types'

/** Create a work order (split a locked lot to an IP) or edit its sites while they are not dispatched. */
export function WorkOrderFormModal({ initial, onClose }: { initial?: WorkOrder; onClose: () => void }) {
  const lots = useLots()
  const bens = useBeneficiaries()
  const ips = useIps()
  const wos = useWorkOrders()
  const settings = useSettings()
  const user = useUserName()
  const lockedLots = lots.filter((l) => l.listLocked)

  const [wo, setWo] = useState<WorkOrder>(
    initial || {
      id: '',
      woNo: '',
      lotId: lockedLots.length === 1 ? lockedLots[0].id : '',
      ipId: '',
      beneficiaryIds: [],
      cluster: '',
      issuedAt: '',
      dueDate: lockedLots.length === 1 ? summarizeLot(lockedLots[0], bens, settings).dueDate : '',
      status: 'Issued',
      remarks: '',
    }
  )
  const [sub, setSub] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const lot = lots.find((l) => l.id === wo.lotId)
  const isEdit = !!initial

  // Candidate sites: in this lot, not dropped, and either unassigned or already in this WO.
  const candidates = useMemo(
    () =>
      bens.filter(
        (b) => b.lotId === wo.lotId && stageOf(b) !== 'Dropped' && (!b.workOrderId || b.workOrderId === wo.id && !!wo.id)
      ),
    [bens, wo.lotId, wo.id]
  )
  const subs = useMemo(() => Array.from(new Set(candidates.map((b) => b.subDivision || b.division || '').filter(Boolean))).sort(), [candidates])
  const visible = candidates.filter((b) => !sub || (b.subDivision || b.division) === sub)
  const selected = new Set(wo.beneficiaryIds)
  const lockedIn = (b: Beneficiary) => !!b.dispatchId // dispatched sites cannot leave the WO

  const toggle = (b: Beneficiary, on: boolean) => {
    if (!on && lockedIn(b)) return toast(`${b.name} is already dispatched and cannot be removed`, 'error')
    setWo((w) => ({ ...w, beneficiaryIds: on ? [...w.beneficiaryIds, b.id] : w.beneficiaryIds.filter((x) => x !== b.id) }))
  }
  const allVisibleOn = visible.length > 0 && visible.every((b) => selected.has(b.id))
  const toggleAll = () => {
    if (allVisibleOn) {
      const keep = new Set(visible.filter(lockedIn).map((b) => b.id))
      const vis = new Set(visible.map((b) => b.id))
      setWo((w) => ({ ...w, beneficiaryIds: w.beneficiaryIds.filter((id) => !vis.has(id) || keep.has(id)) }))
    } else {
      setWo((w) => ({ ...w, beneficiaryIds: Array.from(new Set([...w.beneficiaryIds, ...visible.map((b) => b.id)])) }))
    }
  }

  const selKw = bens.filter((b) => selected.has(b.id)).reduce((a, b) => a + (b.sanctionedKw || 0), 0)
  const activeIps = ips.filter((i) => i.active || i.id === wo.ipId)

  const submit = () => {
    const e: Record<string, string> = {}
    if (!wo.lotId) e.lotId = 'Select a locked lot'
    if (!wo.ipId) e.ipId = 'Select an installation partner'
    if (!wo.dueDate) e.dueDate = 'Due date is required'
    if (!wo.beneficiaryIds.length) e.sites = 'Select at least one site'
    setErrors(e)
    if (Object.keys(e).length) {
      if (e.sites) toast(e.sites, 'error')
      return
    }
    const saved: WorkOrder = {
      ...wo,
      id: wo.id || newId('WO'),
      woNo: wo.woNo || nextNumber(wos.map((w) => w.woNo), 'WO'),
      issuedAt: wo.issuedAt || nowIso(),
      cluster: wo.cluster.trim(),
    }
    const before = new Set(initial?.beneficiaryIds || [])
    const removed = (initial?.beneficiaryIds || []).filter((id) => !selected.has(id))
    const added = saved.beneficiaryIds.filter((id) => !before.has(id))
    let ok = upsert('workOrders', saved)
    if (ok) ok = updateBeneficiaries(saved.beneficiaryIds, (b) => ({ ...b, workOrderId: saved.id, ipId: saved.ipId }), user)
    if (ok && removed.length) ok = updateBeneficiaries(removed, (b) => ({ ...b, workOrderId: undefined, ipId: undefined }), user, `Removed from work order ${saved.woNo}`)
    if (reportSave(ok, isEdit ? `${saved.woNo} updated` : `${saved.woNo} issued to ${ips.find((i) => i.id === saved.ipId)?.name}`)) {
      logActivity(user, 'WorkOrder', saved.id, isEdit ? `Sites edited (+${added.length} / -${removed.length})` : `Issued with ${saved.beneficiaryIds.length} sites`)
      added.forEach((id) => logActivity(user, 'Beneficiary', id, `Assigned to work order ${saved.woNo}`))
      onClose()
    }
  }

  return (
    <Modal
      size="wide"
      eyebrow="Work order"
      title={isEdit ? `Edit ${initial?.woNo}` : 'Issue work order to IP'}
      subtitle="Split a locked lot into IP work orders by district or cluster. The IP sees only the sites in its work order."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <span className="muted" style={{ fontSize: 11, marginRight: 'auto' }}>
            {wo.beneficiaryIds.length} site(s) · {selKw} kW selected
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> {isEdit ? 'Save changes' : 'Issue work order'}
          </button>
        </>
      }
    >
      {lockedLots.length === 0 && <NoteBanner>No lot has a locked beneficiary list yet. Lock a lot&apos;s list in Lots &amp; Beneficiaries before issuing work orders.</NoteBanner>}
      {ips.filter((i) => i.active).length === 0 && <NoteBanner>No active installation partner. Onboard one in Settings → Installation Partners.</NoteBanner>}
      <FormSection title="Work order details" icon={ClipboardList}>
        <div className="form-grid">
          <SelectField
            label="Lot (locked lists only)"
            required
            disabled={isEdit}
            value={wo.lotId}
            error={errors.lotId}
            onChange={(v) => {
              const l = lots.find((x) => x.id === v)
              setWo((w) => ({ ...w, lotId: v, beneficiaryIds: [], dueDate: l ? summarizeLot(l, bens, settings).dueDate : '' }))
              setSub('')
            }}
            options={lockedLots.map((l) => ({ value: l.id, label: `${l.lotNo} · ${l.district}` }))}
          />
          <SelectField
            label="Installation partner"
            required
            disabled={isEdit && wo.status !== 'Issued'}
            value={wo.ipId}
            error={errors.ipId}
            onChange={(v) => setWo((w) => ({ ...w, ipId: v }))}
            options={activeIps.map((i) => ({ value: i.id, label: `${i.name}${i.districts.length ? ` (${i.districts.join(', ')})` : ''}` }))}
          />
          <TextField label="Cluster / route" value={wo.cluster} onChange={(v) => setWo((w) => ({ ...w, cluster: v }))} placeholder="e.g. Abhanpur cluster" />
          <DateField label="Due date" required value={wo.dueDate} error={errors.dueDate} onChange={(v) => setWo((w) => ({ ...w, dueDate: v }))} hint={lot ? `Lot due ${fmtDate(summarizeLot(lot, bens, settings).dueDate)}` : undefined} />
          <TextArea label="Remarks" span2 value={wo.remarks} onChange={(v) => setWo((w) => ({ ...w, remarks: v }))} />
        </div>
      </FormSection>

      {lot && (
        <FormSection
          title={`Sites (${candidates.length} available)`}
          aside={
            <select className="filter-select" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Sub-division">
              <option value="">All sub-divisions / divisions</option>
              {subs.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          }
        >
          {candidates.length === 0 ? (
            <span className="muted" style={{ fontSize: 11 }}>Every site in this lot is already assigned to a work order.</span>
          ) : (
            <div className="table-wrap card">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allVisibleOn} onChange={toggleAll} aria-label="Select all visible" />
                    </th>
                    <th>Application / Name</th>
                    <th>kW</th>
                    <th>Sub-division</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <input type="checkbox" checked={selected.has(b.id)} onChange={(e) => toggle(b, e.target.checked)} aria-label={`Select ${b.name}`} />
                      </td>
                      <td>
                        <div className="cell-title">
                          <strong>{b.name}</strong>
                          <small>{b.appNo}</small>
                        </div>
                      </td>
                      <td>{b.sanctionedKw}</td>
                      <td>{b.subDivision || b.division || '—'}</td>
                      <td>{lockedIn(b) ? <Chip tone="info">Dispatched</Chip> : <small>{stageOf(b)}</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormSection>
      )}
    </Modal>
  )
}
