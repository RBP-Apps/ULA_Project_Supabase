'use client'

// Domain hooks and write helpers shared by the ULA pages.

import { useMemo, useSyncExternalStore } from 'react'
import type { Contract } from '../types'
import type { Beneficiary, Lot, InstallationPartner, Warehouse, ItemMaster, BomTemplate, WorkOrder, PurchaseOrder, StockMove, Dispatch } from './types'
import { useCollection, patch, patchMany, logActivity, subscribe, getById } from './storage'
import { STORAGE_KEY_CONTRACTS } from '../contracts-store'
import { nowIso, summarizeLot, useSettings, type LotSummary } from './workflow'

// ---- legacy contract store (key: surya-setu-contracts) ----

let contractsCache: { raw: string | null; value: Contract[] } = { raw: null, value: [] }
const NO_CONTRACTS: Contract[] = []

function readContracts(): Contract[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY_CONTRACTS)
  } catch {
    return NO_CONTRACTS
  }
  if (raw === contractsCache.raw) return contractsCache.value
  let value: Contract[] = []
  try {
    const parsed = raw ? JSON.parse(raw) : []
    value = Array.isArray(parsed) ? parsed : []
  } catch {
    value = []
  }
  contractsCache = { raw, value }
  return value
}

export function useContracts(): Contract[] {
  return useSyncExternalStore(subscribe, readContracts, () => NO_CONTRACTS)
}

export function getContracts(): Contract[] {
  return typeof window === 'undefined' ? [] : readContracts()
}

// ---- collections ----

export const useLots = () => useCollection<Lot>('lots')
export const useBeneficiaries = () => useCollection<Beneficiary>('beneficiaries')
export const useIps = () => useCollection<InstallationPartner>('ips')
export const useWarehouses = () => useCollection<Warehouse>('warehouses')
export const useItems = () => useCollection<ItemMaster & { id: string }>('items')
export const useBomTemplates = () => useCollection<BomTemplate>('bomTemplates')
export const useWorkOrders = () => useCollection<WorkOrder>('workOrders')
export const usePurchaseOrders = () => useCollection<PurchaseOrder>('purchaseOrders')
export const useStockMoves = () => useCollection<StockMove>('stockMoves')
export const useDispatches = () => useCollection<Dispatch>('dispatches')

/** Lot summaries (clock, value, LD, stage counts) recomputed from stored records. */
export function useLotSummaries(): LotSummary[] {
  const lots = useLots()
  const bens = useBeneficiaries()
  const settings = useSettings()
  return useMemo(() => lots.map((l) => summarizeLot(l, bens, settings)), [lots, bens, settings])
}

export function useLotMap() {
  const lots = useLots()
  return useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots])
}

export function useIpMap() {
  const ips = useIps()
  return useMemo(() => new Map(ips.map((i) => [i.id, i])), [ips])
}

// ---- writes ----

/** Update one beneficiary (sets updatedAt and writes an activity entry). Returns false on storage failure. */
export function updateBeneficiary(id: string, fn: (b: Beneficiary) => Beneficiary, by: string, action?: string): boolean {
  const ok = patch<Beneficiary>('beneficiaries', id, (b) => ({ ...fn(b), updatedAt: nowIso() }))
  if (ok && action) logActivity(by, 'Beneficiary', id, action)
  return ok
}

/** Update several beneficiaries in one write. */
export function updateBeneficiaries(ids: string[], fn: (b: Beneficiary) => Beneficiary, by: string, action?: string): boolean {
  const now = nowIso()
  const ok = patchMany<Beneficiary>('beneficiaries', ids, (b) => ({ ...fn(b), updatedAt: now }))
  if (ok && action) ids.forEach((id) => logActivity(by, 'Beneficiary', id, action))
  return ok
}

export function getBeneficiary(id: string) {
  return getById<Beneficiary>('beneficiaries', id)
}

export function getLot(id: string) {
  return getById<Lot>('lots', id)
}
