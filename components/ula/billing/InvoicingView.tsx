'use client'

import React, { useMemo, useState } from 'react'
import { WalletCards, FolderOpen, Search, Download } from 'lucide-react'
import { PageHeader, MiniStat, EmptyBlock, Chip, ProgressBar, usePaged, Pager, Tabs } from '../ui'
import { useLots, useBeneficiaries, usePurchaseOrders, useDispatches, useContracts } from '@/lib/ula/data'
import { useCollection } from '@/lib/ula/storage'
import { useSettings, fmtDate, fmtInrShort, downloadCsv } from '@/lib/ula/workflow'
import type { Docket } from '@/lib/ula/types'
import { lotBilling } from './docket-logic'
import { DocketModal } from './DocketModal'

const TABS = ['All lots', 'Ready to bill', 'Docket late', 'Submitted'] as const
type Tab = (typeof TABS)[number]

export function InvoicingView() {
  const lots = useLots()
  const bens = useBeneficiaries()
  const pos = usePurchaseOrders()
  const dispatches = useDispatches()
  const contracts = useContracts()
  const dockets = useCollection<Docket>('dockets')
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('All lots')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      lots.map((lot) => {
        const docket = dockets.find((d) => d.lotId === lot.id)
        return { lot, docket, billing: lotBilling(lot, bens, pos, dispatches, settings, docket) }
      }),
    [lots, bens, pos, dispatches, settings, dockets]
  )

  const ready = rows.filter((r) => r.billing.gateOpen && r.docket?.status !== 'Submitted')
  const late = rows.filter((r) => r.billing.docketLate)
  const submitted = rows.filter((r) => r.docket?.status === 'Submitted')
  const billedValue = submitted.reduce((a, r) => a + (r.docket?.invoiceAmount || 0), 0)

  const base = tab === 'Ready to bill' ? ready : tab === 'Docket late' ? late : tab === 'Submitted' ? submitted : rows
  const filtered = base.filter((r) => {
    const t = q.toLowerCase()
    return !t || [r.lot.lotNo, r.lot.district, r.docket?.invoiceNo, r.docket?.inwardNo].some((x) => x?.toLowerCase().includes(t))
  })
  const paged = usePaged(filtered, 20)

  const exportCsv = () =>
    downloadCsv('lot-dockets.csv', [
      ['Lot', 'District', 'Sites', 'Commissioned', 'Checklist %', 'Lot value', 'Docket status', 'Invoice no.', 'Invoice date', 'Amount', 'GST %', 'Inward no.', 'Submitted', 'Office'],
      ...filtered.map((r) => [
        r.lot.lotNo,
        r.lot.district,
        r.billing.summary.activeSites,
        r.billing.summary.commissioned,
        r.billing.avgPct,
        Math.round(r.billing.summary.value),
        r.docket?.status || 'Not started',
        r.docket?.invoiceNo,
        r.docket?.invoiceDate,
        r.docket?.invoiceAmount,
        r.docket?.gstPercent,
        r.docket?.inwardNo,
        r.docket?.submittedAt?.slice(0, 10),
        r.docket?.office,
      ]),
    ])

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Billing & Payment · Stage 12"
        title="Lot Docket & Billing"
        description="One invoice and one hard-bound docket (original + 2 copies) per lot. A lot can be billed only when every beneficiary is commissioned and its 22-item checklist is complete."
        actions={
          <button type="button" className="outline-btn" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />

      <div className="mini-stats">
        <MiniStat label="Lots" value={rows.length} onClick={() => setTab('All lots')} active={tab === 'All lots'} />
        <MiniStat label="Ready to bill" value={ready.length} tone={ready.length ? 'good' : undefined} onClick={() => setTab('Ready to bill')} active={tab === 'Ready to bill'} />
        <MiniStat label="Docket late" value={late.length} tone={late.length ? 'bad' : undefined} hint={`> ${settings.sla.docketDays} days after last commissioning`} onClick={() => setTab('Docket late')} active={tab === 'Docket late'} />
        <MiniStat label="Dockets submitted" value={submitted.length} hint={fmtInrShort(billedValue) + ' billed (excl. GST)'} onClick={() => setTab('Submitted')} active={tab === 'Submitted'} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ 'All lots': rows.length, 'Ready to bill': ready.length, 'Docket late': late.length, Submitted: submitted.length }} />

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder="Search lot, district, invoice no., inward no.…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyBlock icon={WalletCards} title="No lots yet" text="Lots appear here once registered in Lots & Beneficiaries." />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No lots in this view" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Sites</th>
                    <th>Commissioned</th>
                    <th>Billing checklist</th>
                    <th>Lot value</th>
                    <th>Billing gate</th>
                    <th>Docket</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map(({ lot, docket, billing }) => {
                    const s = billing.summary
                    const pct = s.activeSites ? Math.round((s.commissioned / s.activeSites) * 100) : 0
                    return (
                      <tr key={lot.id}>
                        <td>
                          <div className="cell-title">
                            <strong>{lot.lotNo}</strong>
                            <small>
                              {contracts.find((c) => c.id === lot.contractId)?.packageCode || '—'} · {lot.district}
                            </small>
                          </div>
                        </td>
                        <td>{s.activeSites}</td>
                        <td>
                          <ProgressBar pct={pct} />
                        </td>
                        <td>
                          <ProgressBar pct={billing.avgPct} />
                        </td>
                        <td>{fmtInrShort(s.value)}</td>
                        <td>
                          {billing.gateOpen ? (
                            <Chip tone="good">Open</Chip>
                          ) : !s.activeSites ? (
                            <Chip>No sites</Chip>
                          ) : !s.allCommissioned ? (
                            <Chip tone="warn">{s.activeSites - s.commissioned} not commissioned</Chip>
                          ) : (
                            <Chip tone="warn">{billing.incomplete.length} site(s) incomplete</Chip>
                          )}
                        </td>
                        <td>
                          {docket?.status === 'Submitted' ? (
                            <div className="cell-title">
                              <Chip tone="good">Submitted</Chip>
                              <small>
                                Inward {docket.inwardNo} · {fmtDate(docket.submittedAt)}
                              </small>
                            </div>
                          ) : billing.docketLate ? (
                            <Chip tone="bad">Late — due {fmtDate(billing.docketDue)}</Chip>
                          ) : docket ? (
                            <Chip tone="info">{docket.status}</Chip>
                          ) : billing.docketDue ? (
                            <Chip tone="warn">Due {fmtDate(billing.docketDue)}</Chip>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <button type="button" className={billing.gateOpen && docket?.status !== 'Submitted' ? 'primary-btn btn-sm' : 'outline-btn btn-sm'} onClick={() => setOpen(lot.id)}>
                            <FolderOpen className="w-3 h-3" /> {docket?.status === 'Submitted' ? 'View docket' : billing.gateOpen ? 'Build docket' : 'Check gate'}
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
      </section>

      {open && <DocketModal lotId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
