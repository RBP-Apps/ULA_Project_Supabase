'use client'

import React, { useMemo } from 'react'
import { Search } from 'lucide-react'
import type { Beneficiary, Lot, InstallationPartner } from '@/lib/ula/types'

export interface QueueFilterState {
  q: string
  lotId: string
  district: string
  ipId: string
}

export const EMPTY_FILTER: QueueFilterState = { q: '', lotId: '', district: '', ipId: '' }

export function applyQueueFilter(list: Beneficiary[], f: QueueFilterState) {
  const t = f.q.trim().toLowerCase()
  return list.filter(
    (b) =>
      (!t || [b.appNo, b.name, b.consumerNo, b.mobile, b.subDivision].some((x) => x?.toLowerCase().includes(t))) &&
      (!f.lotId || b.lotId === f.lotId) &&
      (!f.district || b.district === f.district) &&
      (!f.ipId || (f.ipId === '__none' ? !b.ipId : b.ipId === f.ipId))
  )
}

/** Search + lot / district / IP filters shared by the survey and design queues. */
export function QueueFilters({
  value,
  onChange,
  lots,
  ips,
  beneficiaries,
  children,
}: {
  value: QueueFilterState
  onChange: (v: QueueFilterState) => void
  lots: Lot[]
  ips: InstallationPartner[]
  beneficiaries: Beneficiary[]
  children?: React.ReactNode
}) {
  const districts = useMemo(() => Array.from(new Set(beneficiaries.map((b) => b.district).filter(Boolean))).sort(), [beneficiaries])
  return (
    <div className="toolbar-row">
      <div className="search-box table-search grow">
        <Search className="w-4 h-4 text-slate-400" />
        <input placeholder="Search application no., name, consumer no., mobile…" value={value.q} onChange={(e) => onChange({ ...value, q: e.target.value })} />
      </div>
      <div className="row">
        <select className="filter-select" value={value.lotId} onChange={(e) => onChange({ ...value, lotId: e.target.value })} aria-label="Lot">
          <option value="">All lots</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lotNo}
            </option>
          ))}
        </select>
        <select className="filter-select" value={value.district} onChange={(e) => onChange({ ...value, district: e.target.value })} aria-label="District">
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className="filter-select" value={value.ipId} onChange={(e) => onChange({ ...value, ipId: e.target.value })} aria-label="Installation partner">
          <option value="">All IPs</option>
          <option value="__none">Unassigned</option>
          {ips.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        {children}
      </div>
    </div>
  )
}
