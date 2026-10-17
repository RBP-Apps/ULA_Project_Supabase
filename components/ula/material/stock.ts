'use client'

// Stock and BOM helpers for Material Planning & Purchase and Dispatch.
// Pure functions over stored records; other modules may import them read-only.
//
// Exports:
//   stockBalance(moves, itemCode?, warehouseId?)   -> net qty from StockMoves (optionally filtered)
//   balanceByItemWarehouse(moves)                  -> Map<'item|warehouse', qty>
//   activeSites(bens, lotId?)                      -> beneficiaries not 'Dropped' (optionally of one lot)
//   bomForSites(sites, boms)                       -> { lines: {itemCode, qty}[], missingKw: number[] }
//   dispatchedQtyForLot(moves, dispatches, lotId)  -> Map<itemCode, qty> already issued to the lot
//   openPoQty(pos, itemCode, lotId?)               -> qty on open POs (not Received / Cancelled)
//   lotBomRows(...)                                -> required / dispatched / stock / on order / shortfall per item
//   moduleQtyPerSite(kw, boms, items)              -> module count per site from the kW template
//   isOpenPo(po)                                   -> PO still awaiting GRN
//   contractDispatchGate(contract, today)          -> list of failed Contract & Compliance conditions

import type { Beneficiary, BomTemplate, Dispatch, ItemMaster, PurchaseOrder, StockMove } from '@/lib/ula/types'
import type { Contract } from '@/lib/types'
import { stageOf } from '@/lib/ula/workflow'

export function stockBalance(moves: StockMove[], itemCode?: string, warehouseId?: string): number {
  let n = 0
  for (const m of moves) {
    if (itemCode && m.itemCode !== itemCode) continue
    if (warehouseId && m.warehouseId !== warehouseId) continue
    n += Number(m.qty) || 0
  }
  return n
}

export function balanceByItemWarehouse(moves: StockMove[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of moves) {
    const k = `${m.itemCode}|${m.warehouseId}`
    map.set(k, (map.get(k) || 0) + (Number(m.qty) || 0))
  }
  return map
}

export function activeSites(bens: Beneficiary[], lotId?: string): Beneficiary[] {
  return bens.filter((b) => (!lotId || b.lotId === lotId) && stageOf(b) !== 'Dropped')
}

export function bomForSites(sites: Beneficiary[], boms: BomTemplate[]) {
  const qty = new Map<string, number>()
  const missing = new Set<number>()
  for (const s of sites) {
    const t = boms.find((b) => b.kw === s.sanctionedKw)
    if (!t) {
      missing.add(s.sanctionedKw)
      continue
    }
    for (const l of t.lines) qty.set(l.itemCode, (qty.get(l.itemCode) || 0) + l.qty)
  }
  return {
    lines: Array.from(qty.entries()).map(([itemCode, q]) => ({ itemCode, qty: q })),
    missingKw: Array.from(missing).sort((a, b) => a - b),
  }
}

export function dispatchedQtyForLot(moves: StockMove[], dispatches: Dispatch[], lotId: string): Map<string, number> {
  const ids = new Set(dispatches.filter((d) => d.lotId === lotId).map((d) => d.id))
  const map = new Map<string, number>()
  for (const m of moves) {
    if (m.refType === 'Dispatch' && ids.has(m.refId)) map.set(m.itemCode, (map.get(m.itemCode) || 0) - (Number(m.qty) || 0))
  }
  return map
}

export function isOpenPo(po: PurchaseOrder) {
  return po.status !== 'Received' && po.status !== 'Cancelled'
}

export function openPoQty(pos: PurchaseOrder[], itemCode: string, lotId?: string): number {
  let n = 0
  for (const p of pos) {
    if (!isOpenPo(p)) continue
    if (lotId !== undefined && p.lotId && p.lotId !== lotId) continue
    for (const l of p.lines) if (l.itemCode === itemCode) n += Number(l.qty) || 0
  }
  return n
}

export interface BomRow {
  itemCode: string
  required: number
  dispatched: number
  remaining: number
  stock: number
  onOrder: number
  shortfall: number
}

/** Lot BOM vs stock: shortfall = remaining need − stock − open POs (this lot's + general stock POs). */
export function lotBomRows(
  lotId: string,
  bens: Beneficiary[],
  boms: BomTemplate[],
  moves: StockMove[],
  dispatches: Dispatch[],
  pos: PurchaseOrder[],
  warehouseId?: string
): { rows: BomRow[]; missingKw: number[]; sites: number } {
  const sites = activeSites(bens, lotId)
  const bom = bomForSites(sites, boms)
  const sent = dispatchedQtyForLot(moves, dispatches, lotId)
  const rows = bom.lines.map((l) => {
    const dispatched = sent.get(l.itemCode) || 0
    const remaining = Math.max(0, l.qty - dispatched)
    const stock = Math.max(0, stockBalance(moves, l.itemCode, warehouseId || undefined))
    const onOrder = openPoQty(pos, l.itemCode, lotId)
    return { itemCode: l.itemCode, required: l.qty, dispatched, remaining, stock, onOrder, shortfall: Math.max(0, remaining - stock - onOrder) }
  })
  return { rows, missingKw: bom.missingKw, sites: sites.length }
}

export function moduleQtyPerSite(kw: number, boms: BomTemplate[], items: ItemMaster[]): number {
  const t = boms.find((b) => b.kw === kw)
  if (!t) return 0
  return t.lines.filter((l) => items.find((i) => i.code === l.itemCode)?.category === 'Module').reduce((a, l) => a + l.qty, 0)
}

export function contractDispatchGate(contract: Contract | undefined, today: string): string[] {
  if (!contract) return ['Lot is not linked to a contract package']
  const out: string[] = []
  if (contract.gtpStatus !== 'Approved') out.push(`GTP not approved (status: ${contract.gtpStatus})`)
  if (contract.insuranceStatus !== 'Active') out.push(`Insurance not active (status: ${contract.insuranceStatus})`)
  else if (contract.insuranceExpiryDate && contract.insuranceExpiryDate < today) out.push(`Insurance expired on ${contract.insuranceExpiryDate}`)
  return out
}
