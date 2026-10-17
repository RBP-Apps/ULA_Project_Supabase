'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ShoppingCart, PackageCheck, Send, Boxes } from 'lucide-react'
import { PageHeader, Tabs, MiniStat, EmptyBlock, Chip, Modal, NoteBanner, GateBox, CheckField, reportSave, useUserName, DaysChip } from '../ui'
import { useLots, useBeneficiaries, useBomTemplates, useStockMoves, useDispatches, usePurchaseOrders, useItems, useWarehouses } from '@/lib/ula/data'
import { patch, logActivity } from '@/lib/ula/storage'
import { addDays, today, daysBetween, fmtDate, fmtDateTime, nowIso, useSettings, stageOf, downloadCsv } from '@/lib/ula/workflow'
import type { Lot, PurchaseOrder } from '@/lib/ula/types'
import { lotBomRows, activeSites, bomForSites, stockBalance, isOpenPo } from './stock'
import { PurchaseOrdersTab, PoFormModal } from './PurchaseOrders'
import { StockTab } from './StockTab'

const TABS = ['Lot BOM', 'Purchase Orders', 'Stock', 'Material Ready'] as const
type Tab = (typeof TABS)[number]

export function MaterialView() {
  const [tab, setTab] = useState<Tab>('Lot BOM')
  const lots = useLots()
  const bens = useBeneficiaries()
  const boms = useBomTemplates()
  const moves = useStockMoves()
  const dispatches = useDispatches()
  const pos = usePurchaseOrders()

  const lotStats = useMemo(
    () =>
      lots.map((l) => {
        const r = lotBomRows(l.id, bens, boms, moves, dispatches, pos)
        return { lot: l, short: r.rows.filter((x) => x.shortfall > 0).length, missingKw: r.missingKw.length }
      }),
    [lots, bens, boms, moves, dispatches, pos]
  )
  const t = today()
  const openPos = pos.filter(isOpenPo)
  const atRisk = openPos.filter((p) => p.expectedDate && p.expectedDate < t && p.status !== 'Requested')

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Execution · Stage 4"
        title="Material Planning & Purchase"
        description="Lot BOM from the 1 kW / 2 kW mix, stock by warehouse, shortfall → purchase request → PO → pre-dispatch inspection → GRN, then Material Ready to Dispatch and Project."
      />
      <div className="mini-stats">
        <MiniStat label="Lots with shortfall" value={lotStats.filter((s) => s.short > 0).length} tone={lotStats.some((s) => s.short > 0) ? 'bad' : undefined} onClick={() => setTab('Lot BOM')} />
        <MiniStat label="Open requests / POs" value={openPos.length} onClick={() => setTab('Purchase Orders')} />
        <MiniStat label="POs past expected date" value={atRisk.length} tone={atRisk.length ? 'warn' : undefined} hint="Delivery date at risk" onClick={() => setTab('Purchase Orders')} />
        <MiniStat label="Material Ready sent" value={`${lots.filter((l) => l.materialReadyAt).length} / ${lots.length}`} tone="good" onClick={() => setTab('Material Ready')} />
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'Lot BOM' && <LotBomTab />}
      {tab === 'Purchase Orders' && <PurchaseOrdersTab />}
      {tab === 'Stock' && <StockTab />}
      {tab === 'Material Ready' && <MaterialReadyTab />}
    </div>
  )
}

// ---------------- Lot BOM ----------------

function LotBomTab() {
  const lots = useLots()
  const bens = useBeneficiaries()
  const boms = useBomTemplates()
  const moves = useStockMoves()
  const dispatches = useDispatches()
  const pos = usePurchaseOrders()
  const items = useItems()
  const whs = useWarehouses()
  const [lotId, setLotId] = useState('')
  const [wh, setWh] = useState('')
  const [request, setRequest] = useState<PurchaseOrder | null>(null)

  const lot = lots.find((l) => l.id === lotId) || lots[0]
  const data = useMemo(() => (lot ? lotBomRows(lot.id, bens, boms, moves, dispatches, pos, wh) : null), [lot, bens, boms, moves, dispatches, pos, wh])

  if (!lots.length) return <EmptyBlock icon={Boxes} title="No lots yet" text="The lot BOM is built as soon as a lot and its beneficiary list exist (D0)." />
  if (!lot || !data) return null

  const itemName = (c: string) => items.find((i) => i.code === c)?.name || c
  const shortRows = data.rows.filter((r) => r.shortfall > 0)
  const flagged = shortRows.length > 0 && daysBetween(lot.allotmentDate, today()) >= 1

  const raise = () => {
    setRequest({
      id: '',
      poNo: '',
      lotId: lot.id,
      vendor: '',
      lines: shortRows.map((r) => ({ itemCode: r.itemCode, qty: r.shortfall, rate: 0 })),
      raisedAt: '',
      expectedDate: '',
      status: 'Requested',
      remarks: `Shortfall for lot ${lot.lotNo}`,
    })
  }

  return (
    <div className="stack">
      <section className="card table-card">
        <div className="toolbar-row">
          <div className="row">
            <select className="filter-select" value={lot.id} onChange={(e) => setLotId(e.target.value)} aria-label="Lot">
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNo} · {l.district}
                </option>
              ))}
            </select>
            <select className="filter-select" value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Warehouse">
              <option value="">Stock: all warehouses</option>
              {whs.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 11 }}>
              {data.sites} active site(s) · D0 {fmtDate(lot.allotmentDate)}
            </span>
          </div>
          <div className="row">
            <button
              type="button"
              className="outline-btn"
              disabled={!data.rows.length}
              onClick={() =>
                downloadCsv(`${lot.lotNo}-bom.csv`, [
                  ['Item', 'Name', 'Required', 'Dispatched', 'Remaining', 'Stock', 'On order', 'Shortfall'],
                  ...data.rows.map((r) => [r.itemCode, itemName(r.itemCode), r.required, r.dispatched, r.remaining, r.stock, r.onOrder, r.shortfall]),
                ])
              }
            >
              Export
            </button>
            <button type="button" className="primary-btn" disabled={!shortRows.length} onClick={raise}>
              <ShoppingCart className="w-4 h-4" /> Raise purchase request for shortfall
            </button>
          </div>
        </div>
        <div style={{ padding: '12px 18px 0' }} className="stack">
          {data.missingKw.length > 0 && (
            <div className="gate-box bad">
              <strong>
                <AlertTriangle className="w-4 h-4" /> No BOM template for {data.missingKw.join(', ')} kW — those sites are not counted.{' '}
                <Link href="/settings" className="underline">
                  Define templates in Settings
                </Link>
              </strong>
            </div>
          )}
          {flagged && (
            <div className="gate-box bad">
              <strong>
                <AlertTriangle className="w-4 h-4" /> Shortfall on {shortRows.length} item(s) — flagged from D1 ({fmtDate(addDays(lot.allotmentDate, 1))}).
              </strong>
            </div>
          )}
        </div>
        {data.rows.length === 0 ? (
          <EmptyBlock title="Nothing to plan" text={data.sites ? 'No BOM template matches the site sizes in this lot.' : 'This lot has no active beneficiaries.'} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Required (lot)</th>
                  <th>Dispatched</th>
                  <th>Remaining need</th>
                  <th>In stock</th>
                  <th>On order</th>
                  <th>Shortfall</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.itemCode}>
                    <td>
                      <div className="cell-title">
                        <strong>{r.itemCode}</strong>
                        <small>{itemName(r.itemCode)}</small>
                      </div>
                    </td>
                    <td>{r.required}</td>
                    <td>{r.dispatched}</td>
                    <td>{r.remaining}</td>
                    <td>{r.stock}</td>
                    <td>{r.onOrder}</td>
                    <td>{r.shortfall > 0 ? <Chip tone="bad">{r.shortfall}</Chip> : <Chip tone="good">Covered</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">Stock is shared across lots; on-order counts open requests/POs for this lot and for general stock.</div>
      </section>
      {request && <PoFormModal initial={request} onClose={() => setRequest(null)} />}
    </div>
  )
}

// ---------------- Material Ready ----------------

function MaterialReadyTab() {
  const lots = useLots()
  const bens = useBeneficiaries()
  const boms = useBomTemplates()
  const moves = useStockMoves()
  const settings = useSettings()
  const [sending, setSending] = useState<Lot | null>(null)

  if (!lots.length) return <EmptyBlock icon={PackageCheck} title="No lots yet" />

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <strong style={{ fontSize: 13 }}>Material Ready per lot</strong>
        <span className="muted" style={{ fontSize: 11 }}>
          Target D{settings.sla.materialReadyTargetDay} · stock checked across all warehouses
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lot</th>
              <th>Undispatched sites</th>
              <th>Design-approved (part-lot)</th>
              <th>Full lot covered</th>
              <th>Part-lot covered</th>
              <th>Target</th>
              <th>Status</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const r = readiness(l, bens, boms, moves)
              const target = addDays(l.allotmentDate, settings.sla.materialReadyTargetDay)
              return (
                <tr key={l.id}>
                  <td className="strong-cell">
                    <Link href={`/lots/${l.id}`}>{l.lotNo}</Link>
                    <br />
                    <small className="muted">{l.district}</small>
                  </td>
                  <td>{r.full.sites}</td>
                  <td>{r.part.sites}</td>
                  <td>{r.full.sites ? r.full.short.length ? <Chip tone="bad">{r.full.short.length} item(s) short</Chip> : <Chip tone="good">Yes</Chip> : '—'}</td>
                  <td>{r.part.sites ? r.part.short.length ? <Chip tone="bad">{r.part.short.length} item(s) short</Chip> : <Chip tone="good">Yes</Chip> : '—'}</td>
                  <td>
                    {fmtDate(target)}
                    <br />
                    {l.materialReadyAt ? null : <DaysChip days={daysBetween(today(), target)} />}
                  </td>
                  <td>
                    {l.materialReadyAt ? (
                      <Chip tone="good">
                        {l.materialReadyPartial ? 'Part-lot' : 'Full lot'} · {fmtDateTime(l.materialReadyAt)}
                      </Chip>
                    ) : (
                      <Chip tone="warn">Not sent</Chip>
                    )}
                  </td>
                  <td className="text-right">
                    <button type="button" className="primary-btn btn-sm" disabled={!!l.materialReadyAt && !l.materialReadyPartial} onClick={() => setSending(l)}>
                      <Send className="w-3 h-3" /> {l.materialReadyAt ? 'Upgrade to full' : 'Send Material Ready'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sending && <MaterialReadyModal lot={sending} onClose={() => setSending(null)} />}
    </section>
  )
}

function readiness(lot: Lot, bens: ReturnType<typeof useBeneficiaries>, boms: ReturnType<typeof useBomTemplates>, moves: ReturnType<typeof useStockMoves>) {
  const undispatched = activeSites(bens, lot.id).filter((b) => !b.dispatchedAt)
  const approved = undispatched.filter((b) => stageOf(b) === 'Awaiting Dispatch')
  const check = (sites: typeof undispatched) => {
    const bom = bomForSites(sites, boms)
    const short = bom.lines.filter((l) => stockBalance(moves, l.itemCode) < l.qty).map((l) => ({ ...l, stock: Math.max(0, stockBalance(moves, l.itemCode)) }))
    return { sites: sites.length, short, missingKw: bom.missingKw }
  }
  return { full: check(undispatched), part: check(approved) }
}

function MaterialReadyModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const bens = useBeneficiaries()
  const boms = useBomTemplates()
  const moves = useStockMoves()
  const user = useUserName()
  const r = readiness(lot, bens, boms, moves)
  const [partial, setPartial] = useState(r.full.short.length > 0 || r.full.missingKw.length > 0)
  const scope = partial ? r.part : r.full
  const missing = [
    ...(scope.sites === 0 ? [partial ? 'No design-approved undispatched sites yet' : 'No undispatched sites'] : []),
    ...scope.missingKw.map((k) => `No BOM template for ${k} kW`),
    ...scope.short.map((s) => `${s.itemCode}: need ${s.qty}, in stock ${s.stock}`),
  ]

  const send = () => {
    if (missing.length) return
    const ok = patch<Lot>('lots', lot.id, (l) => ({ ...l, materialReadyAt: nowIso(), materialReadyPartial: partial }))
    if (reportSave(ok, `Material Ready sent for ${lot.lotNo} (${partial ? 'part-lot' : 'full lot'}) to Dispatch and Project`)) {
      logActivity(user, 'Lot', lot.id, `Material Ready sent (${partial ? `part-lot, ${scope.sites} sites` : 'full lot'})`)
      onClose()
    }
  }

  return (
    <Modal
      size="narrow"
      eyebrow={`Lot ${lot.lotNo}`}
      title="Send Material Ready"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-btn" disabled={missing.length > 0} onClick={send}>
            <Send className="w-4 h-4" /> Send
          </button>
        </>
      }
    >
      <NoteBanner>Material Ready notifies Dispatch and Project that stock covers the scope below. Dispatch plans can be made only after it is sent.</NoteBanner>
      <CheckField label={`Part-lot only (${r.part.sites} design-approved site(s))`} checked={partial} onChange={setPartial} />
      <GateBox missing={missing} okText={`Stock covers ${scope.sites} site(s)`} title="Cannot send yet" />
    </Modal>
  )
}
