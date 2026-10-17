'use client'

import React, { useState } from 'react'
import { Plus, Save, Trash2, Pencil, Search, ShoppingCart, Send, ClipboardCheck, PackageCheck, XCircle, Eye } from 'lucide-react'
import {
  Modal,
  FormSection,
  TextField,
  NumberField,
  DateField,
  SelectField,
  TextArea,
  FileField,
  EmptyBlock,
  Chip,
  GateBox,
  NoteBanner,
  usePaged,
  Pager,
  confirmAction,
  reportSave,
  toast,
  useUserName,
  FileChip,
} from '../ui'
import { useLots, usePurchaseOrders, useItems, useWarehouses } from '@/lib/ula/data'
import { upsert, upsertMany, remove, newId, nextNumber, logActivity } from '@/lib/ula/storage'
import { today, fmtDate, fmtInr, nowIso, daysBetween, downloadCsv } from '@/lib/ula/workflow'
import type { PurchaseOrder, StockMove } from '@/lib/ula/types'
import { isOpenPo } from './stock'

const STATUSES: PurchaseOrder['status'][] = ['Requested', 'PO Raised', 'Inspection Called', 'Inspected', 'Received', 'Cancelled']

const tone = (s: PurchaseOrder['status']) =>
  s === 'Received' ? 'good' : s === 'Cancelled' ? undefined : s === 'Inspected' ? 'info' : s === 'Requested' ? 'warn' : 'info'

export const poValue = (p: PurchaseOrder) => p.lines.reduce((a, l) => a + l.qty * l.rate, 0)

export function PurchaseOrdersTab() {
  const pos = usePurchaseOrders()
  const lots = useLots()
  const user = useUserName()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [lotF, setLotF] = useState('')
  const [edit, setEdit] = useState<PurchaseOrder | null>(null)
  const [inspect, setInspect] = useState<{ po: PurchaseOrder; mode: 'call' | 'result' } | null>(null)
  const [grn, setGrn] = useState<PurchaseOrder | null>(null)
  const [view, setView] = useState<PurchaseOrder | null>(null)
  const t = today()

  const blank = (): PurchaseOrder => ({ id: '', poNo: '', lotId: '', vendor: '', lines: [], raisedAt: '', expectedDate: '', status: 'Requested', remarks: '' })

  const filtered = pos.filter((p) => {
    const s = q.toLowerCase()
    return (
      (!s || [p.poNo, p.vendor, p.remarks, ...p.lines.map((l) => l.itemCode)].some((x) => x?.toLowerCase().includes(s))) &&
      (!status || (status === 'At risk' ? atRisk(p, t) : p.status === status)) &&
      (!lotF || (lotF === 'general' ? !p.lotId : p.lotId === lotF))
    )
  })
  const paged = usePaged(filtered, 20)

  const raisePo = (p: PurchaseOrder) => {
    const miss: string[] = []
    if (!p.vendor.trim()) miss.push('vendor')
    if (!p.expectedDate) miss.push('expected delivery date')
    if (p.lines.some((l) => !(l.rate > 0))) miss.push('rate on every line')
    if (miss.length) return toast(`Edit the request first: ${miss.join(', ')} required to raise a PO.`, 'error')
    const poNo = nextNumber(pos.filter((x) => x.poNo.startsWith('PO-')).map((x) => x.poNo), 'PO')
    const prNo = p.poNo
    if (reportSave(upsert('purchaseOrders', { ...p, poNo, status: 'PO Raised', raisedAt: nowIso(), remarks: [p.remarks, prNo ? `From ${prNo}` : ''].filter(Boolean).join(' · ') }), `${poNo} raised on ${p.vendor}`))
      logActivity(user, 'PurchaseOrder', p.id, `${prNo} converted to ${poNo}`)
  }

  const cancel = (p: PurchaseOrder) => {
    if (!confirmAction(`Cancel ${p.poNo}?`)) return
    if (reportSave(upsert('purchaseOrders', { ...p, status: 'Cancelled' }), `${p.poNo} cancelled`)) logActivity(user, 'PurchaseOrder', p.id, 'Cancelled')
  }
  const del = (p: PurchaseOrder) => {
    if (!confirmAction(`Delete request ${p.poNo}?`)) return
    if (reportSave(remove('purchaseOrders', p.id), `${p.poNo} deleted`)) logActivity(user, 'PurchaseOrder', p.id, 'Request deleted')
  }

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <div className="search-box table-search grow">
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search PO / PR no., vendor, item…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row">
          <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
            <option>At risk</option>
          </select>
          <select className="filter-select" value={lotF} onChange={(e) => setLotF(e.target.value)} aria-label="Lot">
            <option value="">All lots</option>
            <option value="general">General stock</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lotNo}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="outline-btn"
            disabled={!filtered.length}
            onClick={() =>
              downloadCsv('purchase-orders.csv', [
                ['No.', 'Vendor', 'Lot', 'Status', 'Expected', 'Value', 'Lines'],
                ...filtered.map((p) => [p.poNo, p.vendor, lots.find((l) => l.id === p.lotId)?.lotNo || 'General', p.status, p.expectedDate, Math.round(poValue(p)), p.lines.map((l) => `${l.itemCode}x${l.qty}`).join(' ')]),
              ])
            }
          >
            Export
          </button>
          <button type="button" className="primary-btn" onClick={() => setEdit(blank())}>
            <Plus className="w-4 h-4" /> New request
          </button>
        </div>
      </div>
      {pos.length === 0 ? (
        <EmptyBlock icon={ShoppingCart} title="No purchase requests or orders" text="Raise a request from a lot's shortfall in the Lot BOM tab, or create one here." />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No. / Vendor</th>
                  <th>Lot</th>
                  <th>Lines</th>
                  <th>Value</th>
                  <th>Expected</th>
                  <th>Inspection</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-title">
                        <strong>{p.poNo}</strong>
                        <small>{p.vendor || 'Vendor not set'}</small>
                      </div>
                    </td>
                    <td>{lots.find((l) => l.id === p.lotId)?.lotNo || 'General stock'}</td>
                    <td>{p.lines.map((l) => `${l.itemCode} × ${l.qty}`).join(', ')}</td>
                    <td>{fmtInr(poValue(p))}</td>
                    <td>
                      {fmtDate(p.expectedDate)}
                      {atRisk(p, t) && (
                        <>
                          <br />
                          <Chip tone="bad">At risk · {daysBetween(p.expectedDate, t)}d late</Chip>
                        </>
                      )}
                    </td>
                    <td>
                      {p.inspection ? (
                        <>
                          {fmtDate(p.inspection.date)} {p.inspection.result && <Chip tone={p.inspection.result === 'Cleared' ? 'good' : 'bad'}>{p.inspection.result}</Chip>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Chip tone={tone(p.status)}>{p.status}</Chip>
                    </td>
                    <td className="text-right">
                      <div className="row-actions">
                        <button type="button" className="action-icon-btn" title="View" onClick={() => setView(p)}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {(p.status === 'Requested' || p.status === 'PO Raised') && (
                          <button type="button" className="action-icon-btn" title="Edit" onClick={() => setEdit(p)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {p.status === 'Requested' && (
                          <button type="button" className="outline-btn btn-sm" onClick={() => raisePo(p)}>
                            <Send className="w-3 h-3" /> Raise PO
                          </button>
                        )}
                        {p.status === 'PO Raised' && (
                          <button type="button" className="outline-btn btn-sm" onClick={() => setInspect({ po: p, mode: 'call' })}>
                            <ClipboardCheck className="w-3 h-3" /> Call inspection
                          </button>
                        )}
                        {p.status === 'Inspection Called' && (
                          <button type="button" className="outline-btn btn-sm" onClick={() => setInspect({ po: p, mode: 'result' })}>
                            <ClipboardCheck className="w-3 h-3" /> Record result
                          </button>
                        )}
                        {p.status === 'Inspected' && (
                          <button type="button" className="primary-btn btn-sm" onClick={() => setGrn(p)}>
                            <PackageCheck className="w-3 h-3" /> GRN
                          </button>
                        )}
                        {isOpenPo(p) && p.status !== 'Requested' && (
                          <button type="button" className="action-icon-btn danger" title="Cancel" onClick={() => cancel(p)}>
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {p.status === 'Requested' && (
                          <button type="button" className="action-icon-btn danger" title="Delete request" onClick={() => del(p)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyBlock title="No records match" />}
          </div>
          <Pager {...paged} />
        </>
      )}
      {edit && <PoFormModal initial={edit} onClose={() => setEdit(null)} />}
      {inspect && <InspectionModal po={inspect.po} mode={inspect.mode} onClose={() => setInspect(null)} />}
      {grn && <GrnModal po={grn} onClose={() => setGrn(null)} />}
      {view && <PoViewModal po={view} onClose={() => setView(null)} />}
    </section>
  )
}

function atRisk(p: PurchaseOrder, t: string) {
  return isOpenPo(p) && p.status !== 'Requested' && !!p.expectedDate && p.expectedDate < t
}

export function PoFormModal({ initial, onClose }: { initial: PurchaseOrder; onClose: () => void }) {
  const pos = usePurchaseOrders()
  const lots = useLots()
  const items = useItems()
  const user = useUserName()
  const [p, setP] = useState<PurchaseOrder>(initial)
  const raised = p.status !== 'Requested'

  const save = () => {
    const lines = p.lines.filter((l) => l.itemCode)
    if (!lines.length) return toast('Add at least one item line', 'error')
    if (lines.some((l) => !(l.qty > 0))) return toast('Every line needs a quantity greater than 0', 'error')
    if (new Set(lines.map((l) => l.itemCode)).size !== lines.length) return toast('Each item can appear once', 'error')
    if (lines.some((l) => l.rate < 0)) return toast('Rate cannot be negative', 'error')
    if (raised && (!p.vendor.trim() || !p.expectedDate || lines.some((l) => !(l.rate > 0)))) return toast('A raised PO needs vendor, expected date and rates', 'error')
    const isNew = !p.id
    const saved: PurchaseOrder = {
      ...p,
      lines,
      id: p.id || newId('PO'),
      poNo: p.poNo || nextNumber(pos.filter((x) => x.poNo.startsWith('PR-')).map((x) => x.poNo), 'PR'),
    }
    if (reportSave(upsert('purchaseOrders', saved), `${saved.poNo} saved`)) {
      logActivity(user, 'PurchaseOrder', saved.id, isNew ? 'Purchase request created' : 'Edited')
      onClose()
    }
  }

  return (
    <Modal
      eyebrow={raised ? 'Purchase order' : 'Purchase request'}
      title={p.poNo || 'New purchase request'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> Save
          </button>
        </>
      }
    >
      {items.length === 0 && <NoteBanner>No items in the item master. Add items in Settings → Items &amp; BOM.</NoteBanner>}
      <div className="form-grid">
        <TextField label="Vendor" required={raised} value={p.vendor} onChange={(v) => setP({ ...p, vendor: v })} hint="Required to raise the PO" />
        <SelectField label="For lot" value={p.lotId} onChange={(v) => setP({ ...p, lotId: v })} placeholder="General stock" options={lots.map((l) => ({ value: l.id, label: `${l.lotNo} · ${l.district}` }))} />
        <DateField label="Expected delivery" required={raised} value={p.expectedDate} onChange={(v) => setP({ ...p, expectedDate: v })} />
        <TextArea label="Remarks" value={p.remarks} onChange={(v) => setP({ ...p, remarks: v })} rows={2} />
      </div>
      <FormSection title="Lines" aside={<button type="button" className="outline-btn btn-sm" onClick={() => setP({ ...p, lines: [...p.lines, { itemCode: '', qty: 1, rate: 0 }] })}><Plus className="w-3 h-3" /> Add line</button>}>
        {p.lines.length === 0 && <span className="muted" style={{ fontSize: 11 }}>No lines yet.</span>}
        <div className="stack" style={{ gap: 8 }}>
          {p.lines.map((l, i) => (
            <div key={i} className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr auto', alignItems: 'end' }}>
              <SelectField label="Item" value={l.itemCode} onChange={(v) => setP({ ...p, lines: p.lines.map((x, j) => (j === i ? { ...x, itemCode: v } : x)) })} options={items.map((it) => ({ value: it.code, label: `${it.code} — ${it.name}` }))} />
              <NumberField label="Qty" min={0} value={l.qty} onChange={(v) => setP({ ...p, lines: p.lines.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} />
              <NumberField label="Rate (₹)" min={0} value={l.rate} onChange={(v) => setP({ ...p, lines: p.lines.map((x, j) => (j === i ? { ...x, rate: v } : x)) })} />
              <button type="button" className="action-icon-btn danger" title="Remove line" onClick={() => setP({ ...p, lines: p.lines.filter((_, j) => j !== i) })}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, marginTop: 10 }}>
          Total: <strong>{fmtInr(poValue(p))}</strong> (excl. GST)
        </p>
      </FormSection>
    </Modal>
  )
}

function InspectionModal({ po, mode, onClose }: { po: PurchaseOrder; mode: 'call' | 'result'; onClose: () => void }) {
  const user = useUserName()
  const [calledAt, setCalledAt] = useState(po.inspection?.calledAt || today())
  const [date, setDate] = useState(po.inspection?.date || '')
  const [result, setResult] = useState<'' | 'Cleared' | 'Failed'>('')
  const [remarks, setRemarks] = useState(po.inspection?.remarks || '')
  const notice = calledAt && date ? daysBetween(calledAt, date) : 0

  const save = () => {
    if (mode === 'call') {
      if (!calledAt || !date) return toast('Call date and inspection date are required', 'error')
      if (date < calledAt) return toast('Inspection date cannot be before the call date', 'error')
      const ok = upsert('purchaseOrders', { ...po, status: 'Inspection Called', inspection: { calledAt, date, result: '', remarks } })
      if (reportSave(ok, `Inspection called for ${po.poNo} on ${fmtDate(date)}`)) {
        logActivity(user, 'PurchaseOrder', po.id, `Pre-dispatch inspection called for ${date}`)
        onClose()
      }
    } else {
      if (!result) return toast('Select the inspection result', 'error')
      if (!date) return toast('Inspection date is required', 'error')
      if (result === 'Failed' && !remarks.trim()) return toast('Give the reason for failure', 'error')
      const ok = upsert('purchaseOrders', {
        ...po,
        status: result === 'Cleared' ? 'Inspected' : 'Inspection Called',
        inspection: { calledAt: po.inspection?.calledAt || calledAt, date, result, remarks },
      })
      if (reportSave(ok, result === 'Cleared' ? `${po.poNo} cleared — ready for GRN` : `${po.poNo} failed inspection; re-inspection needed`)) {
        logActivity(user, 'PurchaseOrder', po.id, `Inspection ${result}${remarks ? `: ${remarks}` : ''}`)
        onClose()
      }
    }
  }

  return (
    <Modal
      size="narrow"
      eyebrow={po.poNo}
      title={mode === 'call' ? 'Call pre-dispatch inspection' : 'Record inspection result'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> Save
          </button>
        </>
      }
    >
      {mode === 'call' && <NoteBanner>Sec-5 cl. 12.11: inspection notice to CSPDCL 15 days ahead; the whole lot is inspected at one time.</NoteBanner>}
      <div className="form-grid">
        {mode === 'call' && <DateField label="Call / notice date" required value={calledAt} onChange={setCalledAt} />}
        <DateField label="Inspection date" required value={date} onChange={setDate} hint={mode === 'call' && date ? `${notice} day(s) notice` : undefined} error={mode === 'call' && date && notice < 15 ? 'Less than 15 days notice' : undefined} />
        {mode === 'result' && (
          <SelectField label="Result" required value={result} onChange={(v) => setResult(v as typeof result)} options={['Cleared', 'Failed']} />
        )}
        <TextArea label="Remarks" span2 value={remarks} onChange={setRemarks} rows={2} />
      </div>
    </Modal>
  )
}

function GrnModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const pos = usePurchaseOrders()
  const items = useItems()
  const whs = useWarehouses()
  const user = useUserName()
  const hasModules = po.lines.some((l) => items.find((i) => i.code === l.itemCode)?.category === 'Module')
  const [g, setG] = useState<NonNullable<PurchaseOrder['grn']>>({
    grnNo: nextNumber(pos.map((p) => p.grn?.grnNo || ''), 'GRN'),
    date: today(),
    warehouseId: whs.length === 1 ? whs[0].id : '',
    received: po.lines.map((l) => ({ itemCode: l.itemCode, qty: l.qty })),
    almmModel: '',
    remarks: '',
  })

  const missing: string[] = []
  if (!g.grnNo.trim()) missing.push('GRN number')
  if (!g.date) missing.push('GRN date')
  if (!g.warehouseId) missing.push('Receiving warehouse')
  g.received.forEach((r) => {
    const ordered = po.lines.find((l) => l.itemCode === r.itemCode)?.qty || 0
    if (r.qty < 0 || r.qty > ordered) missing.push(`${r.itemCode}: received must be 0–${ordered}`)
  })
  if (!g.received.some((r) => r.qty > 0)) missing.push('At least one received quantity')
  if (hasModules) {
    if (!g.almmModel.trim()) missing.push('ALMM model (modules)')
    if (!g.dcrCertificate) missing.push('DCR certificate (modules)')
    if (!g.cellInvoice) missing.push('Cell GST invoice (modules)')
  }

  const save = () => {
    if (missing.length) return toast('Complete the GRN first', 'error')
    // A PO takes one GRN. A short receipt short-closes the PO; the balance is recorded and
    // reappears as shortfall in the lot BOM so it can be re-ordered.
    const short = po.lines
      .map((l) => ({ itemCode: l.itemCode, qty: l.qty - (g.received.find((r) => r.itemCode === l.itemCode)?.qty || 0) }))
      .filter((s) => s.qty > 0)
    const shortText = short.map((s) => `${s.itemCode} × ${s.qty}`).join(', ')
    if (short.length && !confirmAction(`Short receipt: ${shortText} not received.\n\nPosting this GRN short-closes ${po.poNo}; the balance will show again as shortfall in the lot BOM for re-ordering. Continue?`)) return
    const moves: StockMove[] = g.received
      .filter((r) => r.qty > 0)
      .map((r) => ({ id: newId('SM'), date: g.date, itemCode: r.itemCode, warehouseId: g.warehouseId, qty: r.qty, refType: 'GRN', refId: po.id, remarks: `${g.grnNo} against ${po.poNo}` }))
    const remarks = short.length ? `${po.remarks ? po.remarks + ' · ' : ''}Short-closed at GRN ${g.grnNo}: ${shortText} not received` : po.remarks
    const ok = upsertMany('stockMoves', moves) && upsert('purchaseOrders', { ...po, status: 'Received', grn: g, remarks })
    if (reportSave(ok, `${g.grnNo} posted — ${moves.length} item(s) added to stock${short.length ? ' (PO short-closed)' : ''}`)) {
      logActivity(user, 'PurchaseOrder', po.id, `GRN ${g.grnNo} posted${short.length ? `; short-closed (${shortText})` : ''}`)
      onClose()
    }
  }

  return (
    <Modal
      eyebrow={po.poNo}
      title="Goods receipt (GRN)"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={missing.length > 0}>
            <PackageCheck className="w-4 h-4" /> Post GRN
          </button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label="GRN no." required value={g.grnNo} onChange={(v) => setG({ ...g, grnNo: v })} />
        <DateField label="GRN date" required value={g.date} onChange={(v) => setG({ ...g, date: v })} />
        <SelectField label="Receiving warehouse" required value={g.warehouseId} onChange={(v) => setG({ ...g, warehouseId: v })} options={whs.map((w) => ({ value: w.id, label: `${w.name} (${w.kind})` }))} hint={whs.length ? undefined : 'Add warehouses in Settings'} />
        <TextField label="ALMM model" required={hasModules} value={g.almmModel} onChange={(v) => setG({ ...g, almmModel: v })} />
      </div>
      <FormSection title="Received quantities">
        <div className="stack" style={{ gap: 8 }}>
          {g.received.map((r, i) => (
            <div key={r.itemCode} className="form-grid" style={{ alignItems: 'end' }}>
              <div className="kv">
                <span>{r.itemCode}</span>
                <strong>Ordered {po.lines.find((l) => l.itemCode === r.itemCode)?.qty}</strong>
              </div>
              <NumberField label="Received qty" min={0} value={r.qty} onChange={(v) => setG({ ...g, received: g.received.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} />
            </div>
          ))}
        </div>
      </FormSection>
      <FormSection title="DCR and ALMM papers">
        <div className="form-grid">
          <FileField label="DCR certificate" required={hasModules} value={g.dcrCertificate} onChange={(f) => setG({ ...g, dcrCertificate: f })} />
          <FileField label="Cell GST invoice" required={hasModules} value={g.cellInvoice} onChange={(f) => setG({ ...g, cellInvoice: f })} />
          <TextArea label="Remarks" span2 value={g.remarks} onChange={(v) => setG({ ...g, remarks: v })} rows={2} />
        </div>
      </FormSection>
      <GateBox missing={missing} okText="Ready to post" />
    </Modal>
  )
}

function PoViewModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const lots = useLots()
  const whs = useWarehouses()
  return (
    <Modal size="narrow" eyebrow={po.status} title={po.poNo} onClose={onClose}>
      <div className="kv-grid">
        {(
          [
            ['Vendor', po.vendor],
            ['Lot', lots.find((l) => l.id === po.lotId)?.lotNo || 'General stock'],
            ['Raised', fmtDate(po.raisedAt)],
            ['Expected', fmtDate(po.expectedDate)],
            ['Value', fmtInr(poValue(po))],
            ['Inspection', po.inspection ? `${fmtDate(po.inspection.date)} ${po.inspection.result}` : '—'],
            ['GRN', po.grn ? `${po.grn.grnNo} · ${fmtDate(po.grn.date)}` : '—'],
            ['Warehouse', po.grn ? whs.find((w) => w.id === po.grn?.warehouseId)?.name : '—'],
            ['ALMM model', po.grn?.almmModel],
            ['Remarks', po.remarks],
          ] as [string, string | undefined][]
        ).map(([k, v]) => (
          <div className="kv" key={k}>
            <span>{k}</span>
            <strong>{v || '—'}</strong>
          </div>
        ))}
      </div>
      <div className="table-wrap card">
        <table style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.itemCode}>
                <td>{l.itemCode}</td>
                <td>{l.qty}</td>
                <td>{fmtInr(l.rate)}</td>
                <td>{po.grn?.received.find((r) => r.itemCode === l.itemCode)?.qty ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(po.grn?.dcrCertificate || po.grn?.cellInvoice) && (
        <div className="row">
          {po.grn?.dcrCertificate && <FileChip file={po.grn.dcrCertificate} />}
          {po.grn?.cellInvoice && <FileChip file={po.grn.cellInvoice} />}
        </div>
      )}
    </Modal>
  )
}
