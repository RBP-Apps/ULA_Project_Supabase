'use client'

import React, { useMemo, useState } from 'react'
import { WalletCards, Search, Download, FolderOpen, Ban } from 'lucide-react'
import { PageHeader, MiniStat, Tabs, EmptyBlock, Chip, NoteBanner, usePaged, Pager } from '../ui'
import { useLots, useContracts } from '@/lib/ula/data'
import { useCollection } from '@/lib/ula/storage'
import { useSettings, fmtDate, fmtInr, fmtInrShort, downloadCsv, today } from '@/lib/ula/workflow'
import type { PaymentFollowUp, Docket } from '@/lib/ula/types'
import { paymentStats } from './payment-logic'
import { PaymentModal } from './PaymentModal'

const TABS = ['Open files', 'Weekly follow-up', 'Closed'] as const
type Tab = (typeof TABS)[number]

export function PaymentTrackerView() {
  const payments = useCollection<PaymentFollowUp>('payments')
  const dockets = useCollection<Docket>('dockets')
  const lots = useLots()
  const contracts = useContracts()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('Open files')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      payments.map((p) => {
        const lot = lots.find((l) => l.id === p.lotId)
        const docket = dockets.find((d) => d.lotId === p.lotId)
        return { p, lot, docket, s: paymentStats(p, docket, settings.sla.paymentIdleDays) }
      }),
    [payments, lots, dockets, settings.sla.paymentIdleDays]
  )
  const openRows = rows.filter((r) => !r.p.closed)
  const idle = openRows.filter((r) => r.s.idle)
  const closed = rows.filter((r) => r.p.closed)
  const totals = {
    expected: openRows.reduce((a, r) => a + r.s.expected, 0),
    outstanding: openRows.reduce((a, r) => a + r.s.outstanding, 0),
    received: rows.reduce((a, r) => a + r.s.net, 0),
    cfa: openRows.reduce((a, r) => a + r.s.bySource['CFA (MNRE)'].outstanding, 0),
    sfa: openRows.reduce((a, r) => a + r.s.bySource['SFA + District share (CSPDCL)'].outstanding, 0),
  }

  const base = tab === 'Open files' ? openRows : tab === 'Closed' ? closed : [...openRows].sort((a, b) => b.s.idleDays - a.s.idleDays)
  const filtered = base.filter((r) => {
    const t = q.toLowerCase()
    return !t || [r.lot?.lotNo, r.lot?.district, r.docket?.invoiceNo, r.s.desk].some((x) => x?.toLowerCase().includes(t))
  })
  const paged = usePaged(filtered, 20)

  const exportFollowUp = () =>
    downloadCsv(`payment-follow-up-${today()}.csv`, [
      ['Lot', 'District', 'Invoice', 'Current desk', 'Last action', 'Idle days', 'Expected', 'Received (gross)', 'Outstanding', 'CFA outstanding', 'SFA+district outstanding', 'Open queries'],
      ...filtered.map((r) => [
        r.lot?.lotNo,
        r.lot?.district,
        r.docket?.invoiceNo,
        r.s.desk,
        r.s.lastActivity,
        r.s.idleDays,
        Math.round(r.s.expected),
        Math.round(r.s.gross),
        Math.round(r.s.outstanding),
        Math.round(r.s.bySource['CFA (MNRE)'].outstanding),
        Math.round(r.s.bySource['SFA + District share (CSPDCL)'].outstanding),
        r.s.openQueries,
      ]),
    ])

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Billing & Payment · Stage 13"
        title="Payment Tracker"
        description="Follow each lot's payment after docket submission: CFA from MNRE and SFA + district share from CSPDCL, file movement between desks, queries, receipts with TDS / LD deductions."
        actions={
          <button type="button" className="outline-btn" onClick={exportFollowUp} disabled={!filtered.length}>
            <Download className="w-4 h-4" /> {tab === 'Weekly follow-up' ? 'Follow-up list' : 'Export'}
          </button>
        }
      />

      <NoteBanner>
        <Ban className="w-3.5 h-3.5 inline mr-1" />
        Receipts are recorded only from MNRE (CFA) and CSPDCL (SFA + district share), per lot. No money may be collected from beneficiaries (Sec-1 cl. 2.4), so there is no beneficiary-level receipt entry.
      </NoteBanner>

      <div className="mini-stats" style={{ marginTop: 14 }}>
        <MiniStat label="Open payment files" value={openRows.length} onClick={() => setTab('Open files')} active={tab === 'Open files'} />
        <MiniStat label="Outstanding" value={fmtInrShort(totals.outstanding)} tone={totals.outstanding ? 'warn' : undefined} hint={`of ${fmtInrShort(totals.expected)} expected`} />
        <MiniStat label="Due from MNRE (CFA)" value={fmtInrShort(totals.cfa)} />
        <MiniStat label="Due from CSPDCL" value={fmtInrShort(totals.sfa)} hint="SFA + district share" />
        <MiniStat label={`Idle > ${settings.sla.paymentIdleDays} days`} value={idle.length} tone={idle.length ? 'bad' : undefined} onClick={() => setTab('Weekly follow-up')} active={tab === 'Weekly follow-up'} />
        <MiniStat label="Net received (all)" value={fmtInrShort(totals.received)} tone="good" />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ 'Open files': openRows.length, 'Weekly follow-up': idle.length, Closed: closed.length }} />

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder="Search lot, district, invoice no., desk…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {payments.length === 0 ? (
          <EmptyBlock icon={WalletCards} title="No payment files yet" text="A payment file opens automatically when a lot docket is recorded as submitted in Lot Docket & Billing." />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="Nothing in this view" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lot / invoice</th>
                    <th>Expected</th>
                    <th>Received (gross)</th>
                    <th>Deductions</th>
                    <th>Outstanding</th>
                    <th>Current desk</th>
                    <th>Last action</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map(({ p, lot, docket, s }) => (
                    <tr key={p.id}>
                      <td>
                        <div className="cell-title">
                          <strong>{lot?.lotNo || 'Deleted lot'}</strong>
                          <small>
                            {contracts.find((c) => c.id === lot?.contractId)?.packageCode || '—'} · Inv {docket?.invoiceNo || '—'}
                          </small>
                        </div>
                      </td>
                      <td>{fmtInr(s.expected)}</td>
                      <td>{fmtInr(s.gross)}</td>
                      <td>{s.deductions ? fmtInr(s.deductions) : '—'}</td>
                      <td>{p.closed ? <Chip tone="good">Closed</Chip> : <Chip tone={s.outstanding > 0 ? 'warn' : 'good'}>{fmtInr(s.outstanding)}</Chip>}</td>
                      <td>
                        {s.desk}
                        {s.openQueries > 0 && (
                          <>
                            <br />
                            <Chip tone="warn">{s.openQueries} open query</Chip>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="cell-title">
                          <strong>{fmtDate(s.lastActivity)}</strong>
                          {!p.closed && (s.idle ? <Chip tone="bad">Idle {s.idleDays}d</Chip> : <small>{s.idleDays}d ago</small>)}
                        </div>
                      </td>
                      <td className="text-right">
                        <button type="button" className="outline-btn btn-sm" onClick={() => setOpen(p.id)}>
                          <FolderOpen className="w-3 h-3" /> Open file
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
      </section>

      {open && <PaymentModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
