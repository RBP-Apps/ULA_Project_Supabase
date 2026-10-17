'use client'

import React, { useMemo, useState } from 'react'
import { HardHat, Eye, ClipboardCheck } from 'lucide-react'
import { PageHeader, MiniStat, Tabs, EmptyBlock, Chip, usePaged, Pager } from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { InstallationForm } from './InstallationForm'
import { QueueFilters, useQueueFilter, lastQcEvent } from './QueueFilters'
import { useBeneficiaries, useLotMap, useIpMap } from '@/lib/ula/data'
import { stageOf, useSettings, addDays, today, fmtDate, installationGate } from '@/lib/ula/workflow'
import type { Beneficiary, Lot } from '@/lib/ula/types'

const TABS = ['To start', 'In progress', 'Rejected by QC', 'Submitted'] as const
type Tab = (typeof TABS)[number]

function tabOf(b: Beneficiary): Tab | null {
  if (b.installation.status === 'Submitted') return 'Submitted'
  if (stageOf(b) !== 'Installation') return null
  if (b.qc.status === 'Rejected') return 'Rejected by QC'
  return b.installation.status === 'Not Started' ? 'To start' : 'In progress'
}

/** Installed (date set) on an earlier day but still not submitted to QC. */
function lateSubmission(b: Beneficiary) {
  const at = b.installation.installedAt?.slice(0, 10)
  return !!at && at < today() && b.installation.status !== 'Submitted'
}

function windowOf(lot: Lot | undefined, endDay: number) {
  if (!lot?.allotmentDate) return null
  return { from: addDays(lot.allotmentDate, 8), to: addDays(lot.allotmentDate, endDay) }
}

export function InstallationQueue() {
  const all = useBeneficiaries()
  const lots = useLotMap()
  const ips = useIpMap()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('To start')
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const { f, setF, apply, districts } = useQueueFilter(all)

  const inScope = useMemo(() => all.filter((b) => tabOf(b) !== null), [all])
  const filtered = apply(inScope)
  const counts = Object.fromEntries(TABS.map((t) => [t, filtered.filter((b) => tabOf(b) === t).length])) as Record<Tab, number>
  // Submitted tab is newest first; work queues are oldest receipt first
  const rows = filtered
    .filter((b) => tabOf(b) === tab)
    .sort((a, b) => (tab === 'Submitted' ? (b.installation.submittedAt || '').localeCompare(a.installation.submittedAt || '') : (a.received?.at || '').localeCompare(b.received?.at || '')))
  const paged = usePaged(rows, 25)

  const late = filtered.filter(lateSubmission).length
  const pastWindow = filtered.filter((b) => {
    const w = windowOf(lots.get(b.lotId), settings.sla.installEndTargetDay)
    return tabOf(b) !== 'Submitted' && w && today() > w.to
  }).length
  const openB = open ? all.find((b) => b.id === open) : undefined

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Execution · Stage 8"
        title="Installation"
        description="IP checklist per site: structure, modules, inverter, ACDB/DCDB, earthing, LA, data logger and SIM, serial re-scan, fixed geotagged photo list, signed installation report, PR reading and consumer training."
      />

      <div className="mini-stats">
        <MiniStat label="To start" value={counts['To start']} hint="Material received" onClick={() => setTab('To start')} active={tab === 'To start'} />
        <MiniStat label="In progress" value={counts['In progress']} onClick={() => setTab('In progress')} active={tab === 'In progress'} />
        <MiniStat label="Rejected by QC" value={counts['Rejected by QC']} tone={counts['Rejected by QC'] ? 'bad' : undefined} onClick={() => setTab('Rejected by QC')} active={tab === 'Rejected by QC'} />
        <MiniStat label="Installed, not submitted" value={late} tone={late ? 'warn' : undefined} hint="Must be submitted the same day" />
        <MiniStat label={`Past D${settings.sla.installEndTargetDay} target`} value={pastWindow} tone={pastWindow ? 'bad' : undefined} />
        <MiniStat label="Submitted to QC" value={counts.Submitted} tone="good" onClick={() => setTab('Submitted')} active={tab === 'Submitted'} />
      </div>

      <section className="card table-card">
        <div style={{ padding: '6px 18px 0' }}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} counts={counts} />
        </div>
        <QueueFilters f={f} setF={setF} districts={districts} />
        {inScope.length === 0 ? (
          <EmptyBlock icon={HardHat} title="No sites ready for installation" text="Sites arrive here when the IP acknowledges material receipt in Dispatch & Receiving." />
        ) : rows.length === 0 ? (
          <EmptyBlock title={`Nothing in "${tab}"`} text={f.ipId || f.lotId || f.district || f.q ? 'Try clearing the filters.' : undefined} />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Beneficiary</th>
                    <th>Lot / IP</th>
                    <th>kW</th>
                    <th>Received</th>
                    <th>Install window</th>
                    <th>{tab === 'Rejected by QC' ? 'Rejection reason' : 'Progress'}</th>
                    <th>Flags</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((b) => {
                    const lot = lots.get(b.lotId)
                    const w = windowOf(lot, settings.sla.installEndTargetDay)
                    const missing = installationGate(b, settings).length
                    const rej = lastQcEvent(b, 'Rejected')
                    const done = tab === 'Submitted'
                    return (
                      <tr key={b.id}>
                        <td>
                          <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                            <strong>{b.name}</strong>
                            <small>
                              {b.appNo} · {b.mobile}
                            </small>
                          </button>
                        </td>
                        <td>
                          <div className="cell-title">
                            <strong>{lot?.lotNo || '—'}</strong>
                            <small>{b.ipId ? ips.get(b.ipId)?.name : 'No IP'}</small>
                          </div>
                        </td>
                        <td>{b.sanctionedKw}</td>
                        <td>{fmtDate(b.received?.at)}</td>
                        <td>
                          {w ? (
                            <Chip tone={done ? 'good' : today() > w.to ? 'bad' : today() < w.from ? undefined : 'info'}>
                              D8–D{settings.sla.installEndTargetDay}: {fmtDate(w.from)} – {fmtDate(w.to)}
                            </Chip>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {tab === 'Rejected by QC' ? (
                            <span title={rej?.remarks}>{rej?.remarks || '—'}</span>
                          ) : done ? (
                            <span>
                              Submitted {fmtDate(b.installation.submittedAt)} · QC {b.qc.status}
                            </span>
                          ) : b.installation.status === 'Not Started' ? (
                            <span className="muted">Not started</span>
                          ) : (
                            <Chip tone={missing ? 'warn' : 'good'}>{missing ? `${missing} item(s) pending` : 'Ready to submit'}</Chip>
                          )}
                        </td>
                        <td>
                          {lateSubmission(b) && <Chip tone="warn">Installed {fmtDate(b.installation.installedAt)}, not submitted</Chip>}
                          {b.received?.shortage || b.received?.damage ? <Chip tone="bad">Shortage/damage logged</Chip> : null}
                        </td>
                        <td className="text-right">
                          <div className="row-actions">
                            <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="outline-btn btn-sm" onClick={() => setOpen(b.id)}>
                              <ClipboardCheck className="w-3 h-3" /> {done ? 'View' : b.installation.status === 'Not Started' ? 'Start' : 'Checklist'}
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

      {openB && <InstallationForm key={openB.id} b={openB} onClose={() => setOpen(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </div>
  )
}
