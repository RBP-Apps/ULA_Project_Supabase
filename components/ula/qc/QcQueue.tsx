'use client'

import React, { useMemo, useState } from 'react'
import { ShieldCheck, Eye, ClipboardCheck } from 'lucide-react'
import { PageHeader, MiniStat, Tabs, EmptyBlock, Chip, usePaged, Pager } from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { QcReview } from './QcReview'
import { QueueFilters, useQueueFilter, lastQcEvent } from '../installation/QueueFilters'
import { useBeneficiaries, useLotMap, useIpMap } from '@/lib/ula/data'
import { useSettings, hoursSince, fmtDateTime, fmtDate } from '@/lib/ula/workflow'
import type { Beneficiary, QcEvent } from '@/lib/ula/types'

const TABS = ['Pending', 'Passed', 'Rejected', 'History'] as const
type Tab = (typeof TABS)[number]

function tabOf(b: Beneficiary): Exclude<Tab, 'History'> | null {
  if (b.qc.status === 'Rejected') return 'Rejected'
  if (b.qc.status === 'Passed') return 'Passed'
  if (b.installation.status === 'Submitted') return 'Pending'
  return null
}

export function QcQueue() {
  const all = useBeneficiaries()
  const lots = useLotMap()
  const ips = useIpMap()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('Pending')
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const { f, setF, apply, districts } = useQueueFilter(all)

  const filtered = apply(all)
  const qcDue = (b: Beneficiary) => !!b.installation.submittedAt && hoursSince(b.installation.submittedAt) > settings.sla.qcHours
  const rejectionStale = (b: Beneficiary) => {
    const r = lastQcEvent(b, 'Rejected')
    return !!r && hoursSince(r.at) > 48
  }

  const history = useMemo(
    () =>
      filtered
        .flatMap((b) => b.qc.history.map((e, k) => ({ b, e, k })))
        .sort((x, y) => y.e.at.localeCompare(x.e.at)),
    [filtered]
  )

  const counts: Record<Tab, number> = {
    Pending: filtered.filter((b) => tabOf(b) === 'Pending').length,
    Passed: filtered.filter((b) => tabOf(b) === 'Passed').length,
    Rejected: filtered.filter((b) => tabOf(b) === 'Rejected').length,
    History: history.length,
  }
  const rows = filtered
    .filter((b) => tabOf(b) === tab)
    .sort((a, b) => (a.installation.submittedAt || '').localeCompare(b.installation.submittedAt || ''))
  const paged = usePaged(rows, 25)
  const histPaged = usePaged(history, 25)
  const overdueCount = filtered.filter((b) => tabOf(b) === 'Pending' && qcDue(b)).length
  const staleRejections = filtered.filter((b) => tabOf(b) === 'Rejected' && rejectionStale(b)).length
  const visits = history.filter((h) => h.e.physicalVisit).length
  const openB = open ? all.find((b) => b.id === open) : undefined

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Execution · Stage 9"
        title="QC"
        description="Review photos beside the IP checklist. Only QC-passed sites go to Portal Update and IP billing; rejections return to the IP with a reason."
      />

      <div className="mini-stats">
        <MiniStat label="Awaiting review" value={counts.Pending} onClick={() => setTab('Pending')} active={tab === 'Pending'} />
        <MiniStat label={`Over ${settings.sla.qcHours} h`} value={overdueCount} tone={overdueCount ? 'bad' : undefined} hint="Since submission" />
        <MiniStat label="Open rejections" value={counts.Rejected} tone={counts.Rejected ? 'warn' : undefined} onClick={() => setTab('Rejected')} active={tab === 'Rejected'} />
        <MiniStat label="Rejections > 48 h" value={staleRejections} tone={staleRejections ? 'bad' : undefined} />
        <MiniStat label="Passed" value={counts.Passed} tone="good" onClick={() => setTab('Passed')} active={tab === 'Passed'} />
        <MiniStat label="Physical visits logged" value={visits} onClick={() => setTab('History')} active={tab === 'History'} />
      </div>

      <section className="card table-card">
        <div style={{ padding: '6px 18px 0' }}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} counts={counts} />
        </div>
        <QueueFilters f={f} setF={setF} districts={districts} />

        {tab === 'History' ? (
          history.length === 0 ? (
            <EmptyBlock icon={ShieldCheck} title="No QC decisions yet" />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Beneficiary</th>
                      <th>Lot / IP</th>
                      <th>Result</th>
                      <th>Remarks</th>
                      <th>Physical visit</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histPaged.slice.map(({ b, e, k }: { b: Beneficiary; e: QcEvent; k: number }) => (
                      <tr key={`${b.id}-${k}`}>
                        <td>{fmtDateTime(e.at)}</td>
                        <td>
                          <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                            <strong>{b.name}</strong>
                            <small>{b.appNo}</small>
                          </button>
                        </td>
                        <td>
                          {lots.get(b.lotId)?.lotNo || '—'} · {b.ipId ? ips.get(b.ipId)?.name : '—'}
                        </td>
                        <td>
                          <Chip tone={e.result === 'Passed' ? 'good' : 'bad'}>{e.result}</Chip>
                        </td>
                        <td>{e.remarks || '—'}</td>
                        <td>{e.physicalVisit ? 'Yes' : 'No'}</td>
                        <td>{e.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager {...histPaged} />
            </>
          )
        ) : rows.length === 0 ? (
          <EmptyBlock
            icon={ShieldCheck}
            title={tab === 'Pending' ? 'No installations waiting for QC' : `No ${tab.toLowerCase()} sites`}
            text={tab === 'Pending' ? 'Sites arrive here when the IP submits a complete installation checklist.' : undefined}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Beneficiary</th>
                    <th>Lot / IP</th>
                    <th>kW</th>
                    <th>Installed</th>
                    <th>{tab === 'Pending' ? 'Submitted' : 'Decision'}</th>
                    <th>{tab === 'Rejected' ? 'Reason' : 'PR'}</th>
                    <th>Flags</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((b) => {
                    const last = b.qc.history[b.qc.history.length - 1]
                    return (
                      <tr key={b.id}>
                        <td>
                          <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                            <strong>{b.name}</strong>
                            <small>{b.appNo}</small>
                          </button>
                        </td>
                        <td>
                          <div className="cell-title">
                            <strong>{lots.get(b.lotId)?.lotNo || '—'}</strong>
                            <small>{b.ipId ? ips.get(b.ipId)?.name : 'No IP'}</small>
                          </div>
                        </td>
                        <td>{b.sanctionedKw}</td>
                        <td>{fmtDate(b.installation.installedAt)}</td>
                        <td>{tab === 'Pending' ? fmtDateTime(b.installation.submittedAt) : last ? `${fmtDateTime(last.at)} · ${last.by}` : '—'}</td>
                        <td>{tab === 'Rejected' ? last?.remarks || '—' : `${b.installation.prReading || 0}%`}</td>
                        <td>
                          {tab === 'Pending' && qcDue(b) && <Chip tone="bad">Over {settings.sla.qcHours} h</Chip>}
                          {tab === 'Pending' && b.qc.history.some((h) => h.result === 'Rejected') && <Chip tone="info">Re-submission</Chip>}
                          {tab === 'Rejected' && (rejectionStale(b) ? <Chip tone="bad">Open &gt; 48 h</Chip> : <Chip tone="warn">With IP</Chip>)}
                          {tab === 'Passed' && last?.physicalVisit && <Chip tone="good">Physical visit</Chip>}
                        </td>
                        <td className="text-right">
                          <div className="row-actions">
                            <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className={tab === 'Pending' ? 'primary-btn btn-sm' : 'outline-btn btn-sm'} onClick={() => setOpen(b.id)}>
                              <ClipboardCheck className="w-3 h-3" /> {tab === 'Pending' ? 'Review' : 'View'}
                            </button>
                          </div>
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

      {openB && <QcReview key={openB.id} b={openB} onClose={() => setOpen(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </div>
  )
}
