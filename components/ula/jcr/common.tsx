'use client'

// Helpers shared by the CSPDCL-side modules (JCR Status, Commissioning, Docket, Payments, IP Payment).

import React from 'react'
import { Search } from 'lucide-react'
import type { Lot, Docket } from '@/lib/ula/types'

export function QueueToolbar({
  q,
  setQ,
  lotId,
  setLotId,
  lots,
  placeholder,
  children,
}: {
  q: string
  setQ: (v: string) => void
  lotId: string
  setLotId: (v: string) => void
  lots: Lot[]
  placeholder?: string
  children?: React.ReactNode
}) {
  return (
    <div className="toolbar-row">
      <div className="search-box table-search grow">
        <Search className="w-4 h-4 text-slate-400" />
        <input placeholder={placeholder || 'Search application no., name, consumer no.…'} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row">
        <select className="filter-select" value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lot">
          <option value="">All lots</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lotNo} · {l.district}
            </option>
          ))}
        </select>
        {children}
      </div>
    </div>
  )
}

export function matchesBen(b: { appNo: string; name: string; consumerNo: string; mobile: string }, q: string) {
  const t = q.trim().toLowerCase()
  return !t || [b.appNo, b.name, b.consumerNo, b.mobile].some((x) => x?.toLowerCase().includes(t))
}

/** Records of a lot whose docket is submitted are frozen: billing evidence must not change afterwards. */
export function isLotBilled(dockets: Docket[], lotId: string) {
  return dockets.some((d) => d.lotId === lotId && d.status === 'Submitted')
}
