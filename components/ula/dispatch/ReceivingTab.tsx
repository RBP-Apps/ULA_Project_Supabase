'use client'

import React, { useMemo, useState } from 'react'
import { PackageCheck, Save } from 'lucide-react'
import { Modal, TextField, CheckField, PhotoList, EmptyBlock, Chip, NoteBanner, usePaged, Pager, reportSave, toast, useUserName } from '../ui'
import { useDispatches, useLots, useBeneficiaries, useIps, updateBeneficiary } from '@/lib/ula/data'
import { patch, logActivity } from '@/lib/ula/storage'
import { fmtDateTime, hoursSince, nowIso, useSettings } from '@/lib/ula/workflow'
import type { Beneficiary, Dispatch, FileRef } from '@/lib/ula/types'

export function ReceivingTab() {
  const dispatches = useDispatches()
  const lots = useLots()
  const bens = useBeneficiaries()
  const ips = useIps()
  const settings = useSettings()
  const [show, setShow] = useState<'transit' | 'received'>('transit')
  const [open, setOpen] = useState<Dispatch | null>(null)

  const list = dispatches.filter((d) => (show === 'transit' ? d.status === 'Dispatched' : d.status === 'Received'))
  const paged = usePaged(list, 20)

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <strong style={{ fontSize: 13 }}>Material receipt by IP / district store</strong>
        <select className="filter-select" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
          <option value="transit">In transit</option>
          <option value="received">Fully received</option>
        </select>
      </div>
      {list.length === 0 ? (
        <EmptyBlock icon={PackageCheck} title={show === 'transit' ? 'No vehicles in transit' : 'No completed receipts'} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle / plan</th>
                  <th>Lot / IP</th>
                  <th>Dispatched</th>
                  <th>Received sites</th>
                  <th>Issues</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((d) => {
                  const sites = d.beneficiaryIds.map((id) => bens.find((b) => b.id === id)).filter(Boolean) as Beneficiary[]
                  const rec = sites.filter((b) => b.received)
                  const issues = rec.filter((b) => b.received?.shortage || b.received?.damage).length
                  const hrs = d.dispatchedAt ? hoursSince(d.dispatchedAt) : 0
                  const late = d.status === 'Dispatched' && hrs > settings.sla.vehicleReceiveHours
                  return (
                    <tr key={d.id}>
                      <td className="strong-cell">
                        {d.vehicleNo}
                        <br />
                        <small className="muted">
                          {d.dispatchNo} · challan {d.challanNo}
                        </small>
                      </td>
                      <td>
                        {lots.find((l) => l.id === d.lotId)?.lotNo}
                        <br />
                        <small className="muted">{ips.find((i) => i.id === d.ipId)?.name}</small>
                      </td>
                      <td>
                        {fmtDateTime(d.dispatchedAt)}
                        {late && (
                          <>
                            <br />
                            <Chip tone="bad">Not received in {Math.floor(hrs)} h</Chip>
                          </>
                        )}
                      </td>
                      <td>
                        {rec.length} / {sites.length}
                      </td>
                      <td>{issues ? <Chip tone="warn">{issues} with shortage / damage</Chip> : '—'}</td>
                      <td>
                        <Chip tone={d.status === 'Received' ? 'good' : 'info'}>{d.status === 'Received' ? `Received ${fmtDateTime(d.receivedAt)}` : 'In transit'}</Chip>
                      </td>
                      <td className="text-right">
                        <button type="button" className={d.status === 'Dispatched' ? 'primary-btn btn-sm' : 'outline-btn btn-sm'} onClick={() => setOpen(d)}>
                          {d.status === 'Dispatched' ? 'Acknowledge receipt' : 'View'}
                        </button>
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
      {open && <ReceiveModal dispatch={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

interface Draft {
  ack: boolean
  shortage: string
  damage: string
  photos: FileRef[]
}

function ReceiveModal({ dispatch, onClose }: { dispatch: Dispatch; onClose: () => void }) {
  const bens = useBeneficiaries()
  const user = useUserName()
  const sites = useMemo(() => dispatch.beneficiaryIds.map((id) => bens.find((b) => b.id === id)).filter(Boolean) as Beneficiary[], [dispatch.beneficiaryIds, bens])
  const pending = sites.filter((b) => !b.received)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(pending.map((b) => [b.id, { ack: false, shortage: '', damage: '', photos: [] }])))
  const set = (id: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }))

  const save = () => {
    const chosen = pending.filter((b) => drafts[b.id]?.ack)
    if (!chosen.length) return toast('Tick at least one site to acknowledge', 'error')
    const bad = chosen.find((b) => drafts[b.id].damage.trim() && !drafts[b.id].photos.length)
    if (bad) return toast(`${bad.appNo}: damage reported — add damage photos`, 'error')
    const at = nowIso()
    let ok = true
    for (const b of chosen) {
      const d = drafts[b.id]
      const issues = [d.shortage && `shortage: ${d.shortage}`, d.damage && `damage: ${d.damage}`].filter(Boolean).join('; ')
      ok =
        ok &&
        updateBeneficiary(
          b.id,
          (x) => ({ ...x, received: { at, by: user, shortage: d.shortage.trim(), damage: d.damage.trim(), photos: d.photos } }),
          user,
          `Material received from ${dispatch.dispatchNo}${issues ? ` (${issues})` : ''}`
        )
    }
    const allDone = pending.length === chosen.length
    if (ok && allDone) ok = patch<Dispatch>('dispatches', dispatch.id, (x) => ({ ...x, status: 'Received', receivedAt: at }))
    if (reportSave(ok, allDone ? `${dispatch.dispatchNo} fully received` : `${chosen.length} site(s) acknowledged`)) {
      logActivity(user, 'Dispatch', dispatch.id, `Receipt acknowledged for ${chosen.length} site(s)${allDone ? ' — vehicle fully received' : ''}`)
      onClose()
    }
  }

  return (
    <Modal
      size="wide"
      eyebrow={`${dispatch.dispatchNo} · vehicle ${dispatch.vehicleNo}`}
      title="Material receipt"
      subtitle="Acknowledge each site's material. Log any shortage or damage with photos — they are deducted from the IP bill if attributable."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
          {pending.length > 0 && (
            <button type="button" className="primary-btn" onClick={save}>
              <Save className="w-4 h-4" /> Save receipt
            </button>
          )}
        </>
      }
    >
      {pending.length === 0 && <NoteBanner>All sites on this vehicle have been received.</NoteBanner>}
      <div className="stack">
        {sites.map((b) => {
          const d = drafts[b.id]
          return (
            <div key={b.id} className="card section-card">
              <div className="section-title">
                <div>
                  <h3>
                    {b.name} <small className="muted">· {b.appNo} · {b.sanctionedKw} kW</small>
                  </h3>
                  <p>
                    Modules: {b.moduleSerials.join(', ') || '—'} · Inverter: {b.inverterSerial || '—'}
                  </p>
                </div>
                {b.received ? <Chip tone={b.received.shortage || b.received.damage ? 'warn' : 'good'}>Received {fmtDateTime(b.received.at)}</Chip> : <Chip>Pending</Chip>}
              </div>
              {b.received ? (
                <div className="kv-grid">
                  <div className="kv">
                    <span>Received by</span>
                    <strong>{b.received.by}</strong>
                  </div>
                  <div className="kv">
                    <span>Shortage</span>
                    <strong>{b.received.shortage || 'None'}</strong>
                  </div>
                  <div className="kv">
                    <span>Damage</span>
                    <strong>{b.received.damage || 'None'}</strong>
                  </div>
                  {b.received.photos.length > 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <PhotoList value={b.received.photos} onChange={() => undefined} disabled />
                    </div>
                  )}
                </div>
              ) : (
                d && (
                  <div className="stack">
                    <CheckField label="Material received at site / store" checked={d.ack} onChange={(c) => set(b.id, { ack: c })} />
                    <div className="form-grid">
                      <TextField label="Shortage (if any)" value={d.shortage} onChange={(x) => set(b.id, { shortage: x })} placeholder="e.g. 1 DC cable roll short" />
                      <TextField label="Damage (if any)" value={d.damage} onChange={(x) => set(b.id, { damage: x })} placeholder="e.g. module glass cracked" />
                    </div>
                    {(d.damage || d.shortage) && <PhotoList value={d.photos} onChange={(p) => set(b.id, { photos: p })} />}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
