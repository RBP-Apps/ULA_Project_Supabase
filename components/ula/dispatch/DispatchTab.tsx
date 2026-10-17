'use client'

import React, { useMemo, useState } from 'react'
import { Truck, Save, Send, Printer, Lock } from 'lucide-react'
import { Modal, TextField, NumberField, FormSection, EmptyBlock, Chip, GateBox, NoteBanner, usePaged, Pager, confirmAction, reportSave, toast, useUserName } from '../ui'
import { useDispatches, useLots, useBeneficiaries, useIps, useWarehouses, useBomTemplates, useItems, useStockMoves, usePurchaseOrders, updateBeneficiaries } from '@/lib/ula/data'
import { upsert, upsertMany, newId, logActivity } from '@/lib/ula/storage'
import { fmtDate, fmtDateTime, nowIso, today } from '@/lib/ula/workflow'
import type { Beneficiary, Dispatch, StockMove } from '@/lib/ula/types'
import { bomForSites, moduleQtyPerSite, stockBalance } from '../material/stock'
import { useDispatchGate } from './PlanTab'

export function DispatchTab() {
  const dispatches = useDispatches()
  const lots = useLots()
  const ips = useIps()
  const [open, setOpen] = useState<Dispatch | null>(null)
  const [show, setShow] = useState<'Approved' | 'Dispatched'>('Approved')
  const list = dispatches.filter((d) => (show === 'Approved' ? d.status === 'Approved' : d.status === 'Dispatched' || d.status === 'Received'))
  const paged = usePaged(list, 20)

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <strong style={{ fontSize: 13 }}>{show === 'Approved' ? 'Approved plans to load' : 'Dispatched vehicles'}</strong>
        <select className="filter-select" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
          <option value="Approved">To dispatch</option>
          <option value="Dispatched">Already dispatched</option>
        </select>
      </div>
      {list.length === 0 ? (
        <EmptyBlock icon={Truck} title={show === 'Approved' ? 'No approved plans' : 'No vehicles dispatched yet'} text={show === 'Approved' ? 'Plans appear here after Project approval.' : undefined} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Lot / IP</th>
                  <th>Sites</th>
                  <th>Vehicle</th>
                  <th>Challan / Invoice / E-way</th>
                  <th>Dispatched</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((d) => (
                  <tr key={d.id}>
                    <td className="strong-cell">
                      {d.dispatchNo}
                      <br />
                      <small className="muted">Planned {fmtDate(d.plannedDate)}</small>
                    </td>
                    <td>
                      {lots.find((l) => l.id === d.lotId)?.lotNo}
                      <br />
                      <small className="muted">{ips.find((i) => i.id === d.ipId)?.name}</small>
                    </td>
                    <td>{d.beneficiaryIds.length}</td>
                    <td>{d.vehicleNo || '—'}</td>
                    <td>{[d.challanNo, d.invoiceNo, d.ewayBillNo].filter(Boolean).join(' / ') || '—'}</td>
                    <td>{fmtDateTime(d.dispatchedAt)}</td>
                    <td>
                      <Chip tone={d.status === 'Received' ? 'good' : 'info'}>{d.status}</Chip>
                    </td>
                    <td className="text-right">
                      <button type="button" className={d.status === 'Approved' ? 'primary-btn btn-sm' : 'outline-btn btn-sm'} onClick={() => setOpen(d)}>
                        {d.status === 'Approved' ? (
                          <>
                            <Truck className="w-3 h-3" /> Load &amp; scan
                          </>
                        ) : (
                          'View'
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...paged} />
        </>
      )}
      {open && <DispatchModal dispatch={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

interface SerialDraft {
  serials: string
  moduleMake: string
  moduleWp: number
  almmModel: string
  inverterMake: string
  inverterSerial: string
}

const splitSerials = (s: string) =>
  s
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)

function DispatchModal({ dispatch, onClose }: { dispatch: Dispatch; onClose: () => void }) {
  const lots = useLots()
  const bens = useBeneficiaries()
  const ips = useIps()
  const whs = useWarehouses()
  const boms = useBomTemplates()
  const items = useItems()
  const moves = useStockMoves()
  const pos = usePurchaseOrders()
  const user = useUserName()
  const gate = useDispatchGate()
  const lot = lots.find((l) => l.id === dispatch.lotId)
  const locked = dispatch.status !== 'Approved'
  const sites = useMemo(() => dispatch.beneficiaryIds.map((id) => bens.find((b) => b.id === id)).filter(Boolean) as Beneficiary[], [dispatch.beneficiaryIds, bens])
  const lotAlmm = pos.find((p) => p.lotId === dispatch.lotId && p.grn?.almmModel)?.grn?.almmModel || ''

  const [v, setV] = useState({ vehicleNo: dispatch.vehicleNo, driverMobile: dispatch.driverMobile, challanNo: dispatch.challanNo, invoiceNo: dispatch.invoiceNo, ewayBillNo: dispatch.ewayBillNo })
  const [drafts, setDrafts] = useState<Record<string, SerialDraft>>(() =>
    Object.fromEntries(
      sites.map((b) => [
        b.id,
        { serials: b.moduleSerials.join('\n'), moduleMake: b.moduleMake, moduleWp: b.moduleWp, almmModel: b.almmModel || lotAlmm, inverterMake: b.inverterMake, inverterSerial: b.inverterSerial },
      ])
    )
  )
  const [all, setAll] = useState({ moduleMake: '', moduleWp: 0, almmModel: lotAlmm, inverterMake: '' })

  const setDraft = (id: string, p: Partial<SerialDraft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }))

  // validation
  const otherSerials = useMemo(() => {
    const ids = new Set(dispatch.beneficiaryIds)
    const set = new Map<string, string>()
    bens.forEach((b) => {
      if (ids.has(b.id)) return
      b.moduleSerials.forEach((s) => set.set(s.toUpperCase(), b.appNo))
      if (b.inverterSerial) set.set(b.inverterSerial.toUpperCase(), b.appNo)
    })
    return set
  }, [bens, dispatch.beneficiaryIds])

  const problems: string[] = []
  if (!v.vehicleNo.trim()) problems.push('Vehicle number')
  if (!/^\d{10}$/.test(v.driverMobile.replace(/\D/g, '').slice(-10))) problems.push('Driver mobile (10 digits)')
  if (!v.challanNo.trim()) problems.push('Delivery challan no.')
  if (!v.invoiceNo.trim()) problems.push('Tax invoice no.')
  if (!v.ewayBillNo.trim()) problems.push('E-way bill no.')
  const seen = new Map<string, string>()
  sites.forEach((b) => {
    const d = drafts[b.id]
    if (!d) return
    const need = moduleQtyPerSite(b.sanctionedKw, boms, items)
    const list = splitSerials(d.serials)
    if (!need) problems.push(`${b.appNo}: no module line in the ${b.sanctionedKw} kW BOM template`)
    else if (list.length !== need) problems.push(`${b.appNo}: ${list.length} of ${need} module serials`)
    if (!d.moduleMake.trim() || !(d.moduleWp > 0) || !d.almmModel.trim()) problems.push(`${b.appNo}: module make, Wp and ALMM model`)
    if (!d.inverterMake.trim() || !d.inverterSerial.trim()) problems.push(`${b.appNo}: inverter make and serial`)
    ;[...list, ...(d.inverterSerial ? [d.inverterSerial.trim().toUpperCase()] : [])].forEach((s) => {
      if (otherSerials.has(s)) problems.push(`${s} already belongs to ${otherSerials.get(s)}`)
      else if (seen.has(s)) problems.push(`${s} repeated (${seen.get(s)} and ${b.appNo})`)
      else seen.set(s, b.appNo)
    })
  })
  const bom = bomForSites(sites, boms)
  bom.missingKw.forEach((k) => problems.push(`No BOM template for ${k} kW`))
  bom.lines.forEach((l) => {
    const have = stockBalance(moves, l.itemCode, dispatch.warehouseId)
    if (have < l.qty) problems.push(`Stock: ${l.itemCode} needs ${l.qty}, warehouse has ${have}`)
  })
  const gateFail = gate(lot)

  const applyAll = () => {
    setDrafts((d) =>
      Object.fromEntries(
        Object.entries(d).map(([id, x]) => [
          id,
          {
            ...x,
            moduleMake: all.moduleMake || x.moduleMake,
            moduleWp: all.moduleWp || x.moduleWp,
            almmModel: all.almmModel || x.almmModel,
            inverterMake: all.inverterMake || x.inverterMake,
          },
        ])
      )
    )
  }

  const writeBens = (final: boolean, at: string) =>
    updateBeneficiaries(
      sites.map((b) => b.id),
      (b) => {
        const d = drafts[b.id]
        return {
          ...b,
          moduleSerials: splitSerials(d.serials),
          moduleMake: d.moduleMake.trim(),
          moduleWp: d.moduleWp,
          almmModel: d.almmModel.trim(),
          inverterMake: d.inverterMake.trim(),
          inverterSerial: d.inverterSerial.trim().toUpperCase(),
          dispatchId: dispatch.id,
          ...(final ? { dispatchedAt: at } : {}),
        }
      },
      user,
      final ? `Dispatched on ${dispatch.dispatchNo} (vehicle ${v.vehicleNo}); serials locked` : undefined
    )

  const saveDraft = () => {
    const ok = upsert('dispatches', { ...dispatch, ...v }) && writeBens(false, '')
    if (reportSave(ok, 'Draft saved — serials are not locked until the vehicle is dispatched')) logActivity(user, 'Dispatch', dispatch.id, 'Loading draft saved')
  }

  const markDispatched = () => {
    if (gateFail.length || problems.length) return toast('Resolve the listed items first', 'error')
    if (!confirmAction(`Dispatch ${dispatch.dispatchNo} with ${sites.length} sites? Serial numbers will be locked to each beneficiary.`)) return
    const at = nowIso()
    const stockOut: StockMove[] = bom.lines.map((l) => ({ id: newId('SM'), date: today(), itemCode: l.itemCode, warehouseId: dispatch.warehouseId, qty: -l.qty, refType: 'Dispatch', refId: dispatch.id, remarks: `${dispatch.dispatchNo} · challan ${v.challanNo}` }))
    const ok = upsertMany('stockMoves', stockOut) && writeBens(true, at) && upsert('dispatches', { ...dispatch, ...v, status: 'Dispatched', dispatchedAt: at })
    if (reportSave(ok, `${dispatch.dispatchNo} dispatched — receipt expected from the IP`)) {
      logActivity(user, 'Dispatch', dispatch.id, `Dispatched: vehicle ${v.vehicleNo}, challan ${v.challanNo}, invoice ${v.invoiceNo}, e-way ${v.ewayBillNo}`)
      onClose()
    }
  }

  const printChallan = () => {
    const w = window.open('', '_blank')
    if (!w) return toast('Allow pop-ups to print the challan', 'error')
    const ip = ips.find((i) => i.id === dispatch.ipId)
    const wh = whs.find((x) => x.id === dispatch.warehouseId)
    const esc = (s: string | number | undefined) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
    const rows = sites
      .map((b, i) => {
        const d = drafts[b.id]
        return `<tr><td>${i + 1}</td><td>${esc(b.appNo)}</td><td>${esc(b.name)}<br><small>${esc(b.address)}</small></td><td>${b.sanctionedKw}</td><td>${esc(splitSerials(d.serials).join(', '))}</td><td>${esc(d.inverterSerial)}</td></tr>`
      })
      .join('')
    const bomRows = bom.lines.map((l) => `<tr><td>${esc(l.itemCode)}</td><td>${esc(items.find((i) => i.code === l.itemCode)?.name)}</td><td>${l.qty}</td></tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Delivery challan ${esc(v.challanNo)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#111}h1{font-size:18px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:12px}td,th{border:1px solid #999;padding:5px;text-align:left;vertical-align:top}small{color:#555}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-top:10px}</style></head><body>
<h1>Delivery Challan</h1><div>RBP Energy (India) Pvt. Ltd. · CSPDCL ULA · Lot ${esc(lot?.lotNo)}</div>
<div class="grid"><div>Challan no.: <b>${esc(v.challanNo)}</b></div><div>Plan: ${esc(dispatch.dispatchNo)}</div><div>Tax invoice: ${esc(v.invoiceNo)}</div><div>E-way bill: ${esc(v.ewayBillNo)}</div><div>Vehicle: ${esc(v.vehicleNo)}</div><div>Driver mobile: ${esc(v.driverMobile)}</div><div>From: ${esc(wh?.name)}</div><div>To IP: ${esc(ip?.name)}</div><div>Cluster / route: ${esc(dispatch.cluster)} / ${esc(dispatch.route)}</div><div>Date: ${esc(fmtDate(dispatch.dispatchedAt || today()))}</div></div>
<table><thead><tr><th>#</th><th>Application</th><th>Beneficiary</th><th>kW</th><th>Module serials</th><th>Inverter serial</th></tr></thead><tbody>${rows}</tbody></table>
<table><thead><tr><th>Item</th><th>Description</th><th>Qty</th></tr></thead><tbody>${bomRows}</tbody></table>
<p style="margin-top:40px">Dispatched by ____________________ &nbsp;&nbsp;&nbsp; Received by (IP / store) ____________________</p></body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Modal
      size="wide"
      eyebrow={`${dispatch.dispatchNo} · Lot ${lot?.lotNo || ''}`}
      title={locked ? `Vehicle ${dispatch.vehicleNo}` : 'Load vehicle and scan serials'}
      subtitle={`${sites.length} site(s) · IP ${ips.find((i) => i.id === dispatch.ipId)?.name || '—'} · from ${whs.find((w) => w.id === dispatch.warehouseId)?.name || '—'}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="outline-btn" onClick={printChallan}>
            <Printer className="w-4 h-4" /> Print challan
          </button>
          <span style={{ marginRight: 'auto' }} />
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
          {!locked && (
            <>
              <button type="button" className="outline-btn" onClick={saveDraft}>
                <Save className="w-4 h-4" /> Save draft
              </button>
              <button type="button" className="primary-btn" disabled={gateFail.length > 0 || problems.length > 0} onClick={markDispatched}>
                <Send className="w-4 h-4" /> Mark dispatched
              </button>
            </>
          )}
        </>
      }
    >
      {locked && (
        <NoteBanner>
          <Lock className="w-3.5 h-3.5 inline" /> Dispatched {fmtDateTime(dispatch.dispatchedAt)} — serial numbers are locked to each beneficiary.
        </NoteBanner>
      )}
      <FormSection title="Vehicle and documents">
        <div className="form-grid">
          <TextField label="Vehicle no." required disabled={locked} value={v.vehicleNo} onChange={(x) => setV({ ...v, vehicleNo: x.toUpperCase() })} />
          <TextField label="Driver mobile" required disabled={locked} value={v.driverMobile} onChange={(x) => setV({ ...v, driverMobile: x })} />
          <TextField label="Delivery challan no." required disabled={locked} value={v.challanNo} onChange={(x) => setV({ ...v, challanNo: x })} />
          <TextField label="Tax invoice no." required disabled={locked} value={v.invoiceNo} onChange={(x) => setV({ ...v, invoiceNo: x })} />
          <TextField label="E-way bill no." required disabled={locked} value={v.ewayBillNo} onChange={(x) => setV({ ...v, ewayBillNo: x })} hint="Open point: Accounts to confirm which document travels with each vehicle" />
        </div>
      </FormSection>

      {!locked && (
        <FormSection title="Apply to all sites" aside={<button type="button" className="outline-btn btn-sm" onClick={applyAll}>Apply</button>}>
          <div className="form-grid">
            <TextField label="Module make" value={all.moduleMake} onChange={(x) => setAll({ ...all, moduleMake: x })} />
            <NumberField label="Module Wp" value={all.moduleWp} onChange={(x) => setAll({ ...all, moduleWp: x })} />
            <TextField label="ALMM model" value={all.almmModel} onChange={(x) => setAll({ ...all, almmModel: x })} hint={lotAlmm ? 'From the lot GRN' : undefined} />
            <TextField label="Inverter make" value={all.inverterMake} onChange={(x) => setAll({ ...all, inverterMake: x })} />
          </div>
        </FormSection>
      )}

      <FormSection title="Serial scan per beneficiary">
        <div className="stack">
          {sites.map((b) => {
            const d = drafts[b.id]
            const need = moduleQtyPerSite(b.sanctionedKw, boms, items)
            const count = splitSerials(d.serials).length
            return (
              <div key={b.id} className="card section-card">
                <div className="section-title">
                  <div>
                    <h3>
                      {b.name} <small className="muted">· {b.appNo} · {b.sanctionedKw} kW</small>
                    </h3>
                    <p>{b.address}</p>
                  </div>
                  <Chip tone={count === need && need > 0 ? 'good' : 'warn'}>
                    {count}/{need} modules
                  </Chip>
                </div>
                <div className="form-grid">
                  <label className="field span-2">
                    <span>Module serials * (scan or paste one per line)</span>
                    <textarea rows={Math.max(2, Math.min(need, 6))} disabled={locked} value={d.serials} onChange={(e) => setDraft(b.id, { serials: e.target.value })} style={{ fontFamily: 'monospace' }} />
                  </label>
                  <TextField label="Module make" required disabled={locked} value={d.moduleMake} onChange={(x) => setDraft(b.id, { moduleMake: x })} />
                  <NumberField label="Module Wp" required disabled={locked} value={d.moduleWp} onChange={(x) => setDraft(b.id, { moduleWp: x })} />
                  <TextField label="ALMM model" required disabled={locked} value={d.almmModel} onChange={(x) => setDraft(b.id, { almmModel: x })} />
                  <TextField label="Inverter make" required disabled={locked} value={d.inverterMake} onChange={(x) => setDraft(b.id, { inverterMake: x })} />
                  <TextField label="Inverter serial" required disabled={locked} value={d.inverterSerial} onChange={(x) => setDraft(b.id, { inverterSerial: x })} />
                </div>
              </div>
            )
          })}
        </div>
      </FormSection>

      {!locked && (
        <>
          <GateBox missing={gateFail} okText="Contract & Compliance gate clear" title="Dispatch blocked by Contract & Compliance" />
          <GateBox missing={problems} okText="All documents, serials and stock in place — ready to dispatch" title={`${problems.length} item(s) to resolve before dispatch`} />
        </>
      )}
    </Modal>
  )
}
