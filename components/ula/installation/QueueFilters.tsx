'use client'

// Lot / IP / district / search filter shared by the Installation, QC and Portal Update queues.

import React, { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useLots, useIps } from '@/lib/ula/data'
import type { Beneficiary } from '@/lib/ula/types'

export interface QueueFilterState {
  q: string
  lotId: string
  ipId: string
  district: string
}

export function useQueueFilter(all: Beneficiary[]) {
  const [f, setF] = useState<QueueFilterState>({ q: '', lotId: '', ipId: '', district: '' })
  const apply = useMemo(
    () => (rows: Beneficiary[]) => {
      const t = f.q.trim().toLowerCase()
      return rows.filter(
        (b) =>
          (!f.lotId || b.lotId === f.lotId) &&
          (!f.ipId || b.ipId === f.ipId) &&
          (!f.district || b.district === f.district) &&
          (!t || [b.appNo, b.name, b.consumerNo, b.mobile, b.inverterSerial, ...b.moduleSerials].some((x) => x?.toLowerCase().includes(t)))
      )
    },
    [f]
  )
  const districts = useMemo(() => Array.from(new Set(all.map((b) => b.district).filter(Boolean))).sort(), [all])
  return { f, setF, apply, districts }
}

export function QueueFilters({
  f,
  setF,
  districts,
  children,
}: {
  f: QueueFilterState
  setF: (f: QueueFilterState) => void
  districts: string[]
  children?: React.ReactNode
}) {
  const lots = useLots()
  const ips = useIps()
  return (
    <div className="toolbar-row">
      <div className="search-box table-search grow">
        <Search className="w-4 h-4 text-slate-400" />
        <input placeholder="Search application no., name, consumer no., serial…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      </div>
      <div className="row">
        <select className="filter-select" value={f.ipId} onChange={(e) => setF({ ...f, ipId: e.target.value })} aria-label="Installation partner">
          <option value="">All IPs</option>
          {ips.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select className="filter-select" value={f.lotId} onChange={(e) => setF({ ...f, lotId: e.target.value })} aria-label="Lot">
          <option value="">All lots</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lotNo}
            </option>
          ))}
        </select>
        <select className="filter-select" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} aria-label="District">
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {children}
      </div>
    </div>
  )
}

/** Last QC event of a given result, if any. */
export function lastQcEvent(b: Beneficiary, result: 'Passed' | 'Rejected') {
  const ev = b.qc.history.filter((h) => h.result === result)
  return ev.length ? ev[ev.length - 1] : undefined
}
