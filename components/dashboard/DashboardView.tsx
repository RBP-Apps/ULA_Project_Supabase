'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  BriefcaseBusiness,
  HardHat,
  Bell,
  SolarPanel,
  FileCheck2,
  AlertTriangle,
  ArrowRight,
  Clock3,
  Building2,
  ChevronRight,
  FileText,
  Plus,
  Inbox,
  CalendarClock,
  Copy,
  Truck,
  WalletCards,
} from 'lucide-react'
import { getStoredContracts, complianceItems } from '@/lib/contracts-store'
import { Contract } from '@/lib/types'
import { StatusPill } from '@/components/contracts/StatusPill'
import { useAuth } from '@/lib/auth-context'
import { useBeneficiaries, useLots, useLotSummaries, usePurchaseOrders, useContracts } from '@/lib/ula/data'
import { useCollection } from '@/lib/ula/storage'
import type { PaymentFollowUp, RoleAssignment, UlaRole } from '@/lib/ula/types'
import {
  STAGES,
  stageOf,
  useSettings,
  annexGSteps,
  packageLd,
  fmtDate,
  fmtInrShort,
  today,
  type Stage,
} from '@/lib/ula/workflow'
import { useWorkItems, itemsForRole, bucketOf, escalationOf, alertsFrom, ALL_ROLES, type QueueBucket } from '@/lib/ula/alerts'
import { Chip, DaysChip, toast } from '@/components/ula/ui'

// Stages grouped into the 15-stage flow shown on the tracker
const TRACK: { label: string; stages: Stage[]; href: string }[] = [
  { label: 'Survey', stages: ['Survey', 'CSPDCL Review'], href: '/survey' },
  { label: 'Design', stages: ['Design'], href: '/design' },
  { label: 'Dispatch', stages: ['Awaiting Dispatch', 'In Transit'], href: '/dispatch' },
  { label: 'Installation', stages: ['Installation'], href: '/installation' },
  { label: 'QC', stages: ['QC'], href: '/qc' },
  { label: 'Portal', stages: ['Portal Update'], href: '/portal-update' },
  { label: 'CSPDCL', stages: ['Inspection', 'Commissioning'], href: '/jcr-status' },
  { label: 'Commissioned', stages: ['Commissioned'], href: '/invoicing' },
]

export function DashboardView() {
  const contracts = useContracts()
  const { user } = useAuth()
  const bens = useBeneficiaries()
  const lots = useLots()
  const summaries = useLotSummaries()
  const pos = usePurchaseOrders()
  const payments = useCollection<PaymentFollowUp>('payments')
  const roles = useCollection<RoleAssignment>('roles')
  const settings = useSettings()
  const items = useWorkItems()

  const myAssigned = roles.find((r) => r.id === (user?.email || '').toLowerCase())?.role
  const [role, setRole] = useState<UlaRole | 'All'>('All')
  useEffect(() => {
    if (myAssigned) setRole(myAssigned)
  }, [myAssigned])
  const [bucket, setBucket] = useState<QueueBucket>('overdue')
  const [pkgFilter, setPkgFilter] = useState('')
  const [districtFilter, setDistrictFilter] = useState('')

  // ---------------- existing contract metrics (preserved) ----------------
  const totalContracts = contracts.length
  const totalValue = contracts.reduce((acc, c) => acc + (c.contractValue || 0), 0)
  const compliantCount = contracts.filter((c) => c.overallStatus === 'Compliant').length
  const atRiskCount = contracts.filter((c) => c.overallStatus === 'At Risk' || c.overallStatus === 'Overdue').length
  const gtpQueueCount = contracts.filter((c) => c.gtpStatus === 'Submitted' || c.gtpStatus === 'Under Review').length
  const inspectionDueCount = contracts.filter((c) => c.inspectionStatus === 'Pending' || c.inspectionStatus === 'Scheduled').length
  const pendingExecutionCount = contracts.filter((c) => c.pbgStatus === 'Pending' || c.agreementStatus === 'Pending').length

  // ---------------- ULA execution metrics ----------------
  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots])
  const districts = useMemo(() => Array.from(new Set(bens.map((b) => b.district).filter(Boolean))).sort(), [bens])

  const scoped = useMemo(
    () =>
      bens.filter((b) => {
        const lot = lotById.get(b.lotId)
        return (!pkgFilter || lot?.contractId === pkgFilter) && (!districtFilter || b.district === districtFilter)
      }),
    [bens, lotById, pkgFilter, districtFilter]
  )

  // Q1: kW at each stage
  const stageKw = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s, { sites: 0, kw: 0 }])) as Record<Stage, { sites: number; kw: number }>
    scoped.forEach((b) => {
      const s = stageOf(b)
      m[s].sites++
      m[s].kw += b.sanctionedKw || 0
    })
    return m
  }, [scoped])
  const activeKw = scoped.reduce((a, b) => a + (stageOf(b) === 'Dropped' ? 0 : b.sanctionedKw || 0), 0)
  const commissionedKw = stageKw.Commissioned.kw
  const execPct = activeKw ? Math.round((commissionedKw / activeKw) * 100) : 0

  // Q2: lots that will miss day 30
  const riskLots = summaries
    .filter((s) => !s.allCommissioned && s.activeSites > 0 && (s.overdue || s.daysLeft <= 7))
    .sort((a, b) => a.daysLeft - b.daysLeft)
  const ldByPackage = contracts.map((c) => ({ c, ...packageLd(c, summaries.filter((s) => s.lot.contractId === c.id), settings.sla) })).filter((x) => x.raw > 0)
  const totalLd = ldByPackage.reduce((a, x) => a + x.applied, 0)

  // Q3: material short and when it arrives
  const notReady = summaries.filter((s) => !s.lot.materialReadyAt && !s.allCommissioned && s.activeSites)
  const openPos = pos.filter((p) => p.status !== 'Received' && p.status !== 'Cancelled').sort((a, b) => (a.expectedDate || '9').localeCompare(b.expectedDate || '9'))

  // Q4: CSPDCL steps beyond Annex G
  const annexDelays = useMemo(
    () =>
      scoped.flatMap((b) =>
        annexGSteps(b, settings.sla)
          .filter((s) => s.side === 'CSPDCL' && s.overBy > 0)
          .map((s) => ({ b, s }))
      ),
    [scoped, settings.sla]
  )

  // Q5: money due, from whom, at which desk
  const receivables = payments.map((p) => {
    const expected = p.expected.reduce((a, e) => a + e.amount, 0)
    const received = p.receipts.reduce((a, r) => a + r.gross, 0)
    const lastDesk = [...p.movements].sort((a, b) => a.date.localeCompare(b.date)).pop()
    return { p, lot: lotById.get(p.lotId), expected, received, outstanding: expected - received - (p.writeOff?.amount || 0), lastDesk, bySource: p.expected.map((e) => ({ source: e.source, due: e.amount - p.receipts.filter((r) => r.source === e.source).reduce((a, r) => a + r.gross, 0) })) }
  })
  const totalOutstanding = receivables.filter((r) => !r.p.closed).reduce((a, r) => a + Math.max(0, r.outstanding), 0)

  // My queue
  const mine = itemsForRole(items, role)
  const counts = { arrived: 0, dueToday: 0, overdue: 0 } as Record<QueueBucket, number>
  mine.forEach((i) => counts[bucketOf(i)]++)
  const queueList = mine.filter((i) => bucketOf(i) === bucket).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'))
  const alerts = alertsFrom(items)

  // Circle summary (preserved, now including lot execution)
  const circleList = useMemo(() => {
    const m = new Map<string, { count: number; kwp: number; compliant: number; atRisk: number; divisions: Set<string>; lotKw: number; commissioned: number }>()
    contracts.forEach((c) => {
      const k = c.circle || 'General'
      const e = m.get(k) || { count: 0, kwp: 0, compliant: 0, atRisk: 0, divisions: new Set<string>(), lotKw: 0, commissioned: 0 }
      e.count++
      e.kwp += c.kwp || 0
      if (c.division) e.divisions.add(c.division)
      if (c.overallStatus === 'Compliant') e.compliant++
      if (c.overallStatus === 'At Risk' || c.overallStatus === 'Overdue') e.atRisk++
      summaries
        .filter((s) => s.lot.contractId === c.id)
        .forEach((s) => {
          e.lotKw += s.kw
          e.commissioned += s.commissioned
        })
      m.set(k, e)
    })
    return Array.from(m.entries()).map(([circle, d]) => ({
      circle,
      ...d,
      divisionNames: Array.from(d.divisions).join(', ') || 'Division Office',
      pct: d.count ? Math.round((d.compliant / d.count) * 100) : 0,
    }))
  }, [contracts, summaries])

  const copySummary = async () => {
    const lines = [
      `SuryaSetu ULA daily summary — ${fmtDate(today())}`,
      `Lots: ${summaries.length} · Active kW: ${activeKw} · Commissioned kW: ${commissionedKw} (${execPct}%)`,
      `Lots at risk of day-30: ${riskLots.length} · LD exposure: ${fmtInrShort(totalLd)}`,
      `Lots without Material Ready: ${notReady.length} · Open POs: ${openPos.length}`,
      `CSPDCL steps beyond Annex G: ${annexDelays.length}`,
      `Receivable outstanding: ${fmtInrShort(totalOutstanding)}`,
      `Overdue items: ${items.filter((i) => bucketOf(i) === 'overdue').length} · High-priority alerts: ${alerts.filter((a) => a.severity === 'high').length}`,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast('Daily summary copied to clipboard', 'success')
    } catch {
      toast('Clipboard is not available in this browser', 'error')
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            Control Room Overview
          </span>
          <h1>Dashboard(Urban Local Bodies)</h1>
          <p>CSPDCL ULA rooftop solar (PM Surya Ghar) — lot execution from allotment to payment and CMC</p>
        </div>

        <div className="heading-actions">
          <button type="button" className="outline-btn" onClick={copySummary} title="Copies the summary text. Automatic 9 am email / WhatsApp delivery needs the backend.">
            <Copy className="w-4 h-4" />
            <span>Copy daily summary</span>
          </button>
          <Link href="/lots" className="primary-btn">
            <BriefcaseBusiness className="w-4 h-4" />
            <span>Lot register</span>
          </Link>
        </div>
      </div>

      {/* Primary metrics */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Packages / Lots</span>
            <div className="stat-icon teal">
              <BriefcaseBusiness className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">
            {totalContracts} <small>pkg</small> · {summaries.length} <small>lots</small>
          </strong>
          <div className="stat-foot">
            <span className={compliantCount > 0 ? 'positive' : ''}>{compliantCount} compliant</span>
            <span>{totalValue > 0 ? `₹${(totalValue / 10000000).toFixed(2)} Cr contract value` : 'no contract value'}</span>
          </div>
        </div>

        <div className="stat-card accent-blue">
          <div className="stat-top">
            <span className="stat-label">Allotted capacity</span>
            <div className="stat-icon blue">
              <SolarPanel className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">
            {activeKw.toLocaleString('en-IN')} <small>kW</small>
          </strong>
          <div className="stat-foot">
            <span className="positive">{commissionedKw.toLocaleString('en-IN')} kW commissioned</span>
            <span>{execPct}%</span>
          </div>
        </div>

        <div className="stat-card accent-amber">
          <div className="stat-top">
            <span className="stat-label">Lots at risk (day 30)</span>
            <div className="stat-icon amber">
              <HardHat className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">
            {riskLots.length} <small>lots</small>
          </strong>
          <div className="stat-foot">
            <span className={totalLd > 0 ? 'negative' : ''}>LD {fmtInrShort(totalLd)}</span>
            <span>{settings.sla.ldPercentPerWeek}%/week, cap {settings.sla.ldCapPercent}%</span>
          </div>
        </div>

        <div className="stat-card accent-rose">
          <div className="stat-top">
            <span className="stat-label">Actionable alerts</span>
            <div className="stat-icon rose">
              <Bell className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">
            {alerts.length} <small>open</small>
          </strong>
          <div className="stat-foot">
            <span className={alerts.some((a) => a.severity === 'high') ? 'negative' : 'positive'}>{alerts.filter((a) => a.severity === 'high').length} high priority</span>
            <span>{fmtInrShort(totalOutstanding)} receivable</span>
          </div>
        </div>
      </div>

      {/* My queue */}
      <section className="card section-card" style={{ marginBottom: 17 }}>
        <div className="section-title">
          <div>
            <h3>My queue</h3>
            <p>What has arrived, what is due today, what is overdue. Overdue items escalate one level after 24 h and to the Director after 48 h.</p>
          </div>
          <select className="filter-select" value={role} onChange={(e) => setRole(e.target.value as UlaRole | 'All')} aria-label="Role">
            <option value="All">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
                {r === myAssigned ? ' (my role)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="queue-counts">
          <button type="button" className="queue-count blue" onClick={() => setBucket('arrived')} style={bucket === 'arrived' ? { boxShadow: '0 0 0 2px #4779d355' } : undefined}>
            <span>Arrived</span>
            <strong>{counts.arrived}</strong>
            <small>
              <Inbox className="w-3.5 h-3.5" /> In queue, not yet due
            </small>
          </button>
          <button type="button" className="queue-count amber" onClick={() => setBucket('dueToday')} style={bucket === 'dueToday' ? { boxShadow: '0 0 0 2px #e0a43a55' } : undefined}>
            <span>Due today</span>
            <strong>{counts.dueToday}</strong>
            <small>
              <CalendarClock className="w-3.5 h-3.5" /> Close before end of day
            </small>
          </button>
          <button type="button" className="queue-count red" onClick={() => setBucket('overdue')} style={bucket === 'overdue' ? { boxShadow: '0 0 0 2px #d4676755' } : undefined}>
            <span>Overdue</span>
            <strong>{counts.overdue}</strong>
            <small>
              <AlertTriangle className="w-3.5 h-3.5" /> Past SLA — escalating
            </small>
          </button>
        </div>
        {queueList.length === 0 ? (
          <p className="muted" style={{ fontSize: 11 }}>
            {items.length === 0 ? 'No work items yet. Register a lot and import its beneficiary list to start the clock.' : 'Nothing in this bucket.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Escalation</th>
                  <th className="text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {queueList.slice(0, 15).map((i) => {
                  const esc = escalationOf(i)
                  return (
                    <tr key={i.id}>
                      <td>
                        <div className="cell-title">
                          <strong>{i.title}</strong>
                          <small>{i.detail}</small>
                        </div>
                      </td>
                      <td>{i.role}</td>
                      <td>{i.dueDate ? fmtDate(i.dueDate) : '—'}</td>
                      <td>{esc.level > 0 ? <Chip tone={esc.level === 2 ? 'bad' : 'warn'}>→ {esc.to}</Chip> : '—'}</td>
                      <td className="text-right">
                        <Link href={i.href} className="action-icon-btn" title="Open">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {queueList.length > 15 && <div className="pager">Showing 15 of {queueList.length}</div>}
          </div>
        )}
      </section>

      {/* Q1: kW by stage with drill-down filters */}
      <section className="card workflow-card">
        <div className="card-head workflow-head">
          <div>
            <span className="eyebrow compact">1 · How many kW are at each stage?</span>
            <h2>Stage-wise sites and kW</h2>
          </div>
          <div className="row">
            <select className="filter-select" value={pkgFilter} onChange={(e) => setPkgFilter(e.target.value)} aria-label="Package">
              <option value="">All packages</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.packageCode || c.contractName}
                </option>
              ))}
            </select>
            <select className="filter-select" value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} aria-label="District">
              <option value="">All districts</option>
              {districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="workflow-track">
          {TRACK.map((t, idx) => {
            const sites = t.stages.reduce((a, s) => a + stageKw[s].sites, 0)
            const kw = t.stages.reduce((a, s) => a + stageKw[s].kw, 0)
            return (
              <Link href={t.href} key={t.label} className={`workflow-stage ${t.label === 'Commissioned' && sites ? 'done' : sites ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
                <div className="stage-node">{idx + 1}</div>
                <strong>{t.label}</strong>
                <span>
                  {sites} sites · {kw} kW
                </span>
                {idx < TRACK.length - 1 && <i />}
              </Link>
            )
          })}
        </div>

        <div className="workflow-footer">
          <div>
            <span>Commissioned:</span>
            <strong>{execPct}%</strong>
          </div>
          <div className="workflow-progress">
            <span style={{ width: `${execPct}%` }} />
          </div>
          <div className="ld-exposure">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              Dropped (ineligible / not feasible): <strong>{stageKw.Dropped.sites} sites</strong>
            </span>
          </div>
        </div>
      </section>

      <div className="ula-grid-2" style={{ marginTop: 17 }}>
        {/* Q2 */}
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow compact">2 · Which lots will miss day 30?</span>
              <h2>Lots at risk and LD at stake</h2>
              <p>Not fully commissioned and overdue or within 7 days of the due date</p>
            </div>
            <Link href="/lots" className="more-btn">
              <span>All lots</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="table-scroll">
            <table style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Due</th>
                  <th>Done</th>
                  <th>LD</th>
                </tr>
              </thead>
              <tbody>
                {riskLots.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-slate-400">
                      No lot is at risk.
                    </td>
                  </tr>
                ) : (
                  riskLots.slice(0, 8).map((s) => (
                    <tr key={s.lot.id}>
                      <td>
                        <Link href={`/lots/${s.lot.id}`} className="cell-title">
                          <strong>{s.lot.lotNo}</strong>
                          <small>{s.lot.district}</small>
                        </Link>
                      </td>
                      <td>
                        <DaysChip days={s.daysLeft} />
                      </td>
                      <td>
                        {s.commissioned}/{s.activeSites}
                      </td>
                      <td>{s.ldAmount ? <Chip tone="bad">{fmtInrShort(s.ldAmount)}</Chip> : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {ldByPackage.length > 0 && (
            <div className="queue-footer">
              {ldByPackage.map((x) => (
                <span key={x.c.id}>
                  {x.c.packageCode}: {fmtInrShort(x.applied)}
                  {x.raw > x.cap ? ' (capped)' : ''}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Q3 */}
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow compact">3 · Where is material short?</span>
              <h2>Material readiness and open POs</h2>
              <p>{notReady.length} lot(s) without Material Ready</p>
            </div>
            <Link href="/material-purchase" className="more-btn">
              <span>Purchase</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="table-scroll">
            <table style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>PO / Lot</th>
                  <th>Status</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {openPos.length === 0 && notReady.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-slate-400">
                      No shortages recorded.
                    </td>
                  </tr>
                ) : (
                  <>
                    {openPos.slice(0, 6).map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="cell-title">
                            <strong>{p.poNo || 'Purchase request'}</strong>
                            <small>
                              {p.vendor || '—'} · {lotById.get(p.lotId)?.lotNo || 'General stock'}
                            </small>
                          </div>
                        </td>
                        <td>
                          <StatusPill value={p.status === 'Requested' ? 'Pending' : 'In Progress'} /> <small>{p.status}</small>
                        </td>
                        <td>{p.expectedDate ? <DaysChip days={Math.round((new Date(p.expectedDate).getTime() - new Date(today()).getTime()) / 86400000)} /> : '—'}</td>
                      </tr>
                    ))}
                    {notReady.slice(0, 4).map((s) => (
                      <tr key={s.lot.id}>
                        <td>
                          <div className="cell-title">
                            <strong>{s.lot.lotNo}</strong>
                            <small>Material Ready not sent</small>
                          </div>
                        </td>
                        <td>
                          <Truck className="w-3.5 h-3.5 inline" /> {s.activeSites} sites
                        </td>
                        <td>{fmtDate(s.lot.allotmentDate)}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Q4 */}
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow compact">4 · Which CSPDCL steps are pending beyond Annex G?</span>
              <h2>CSPDCL-side delays (evidence for extension of time)</h2>
              <p>{annexDelays.length} step(s) over the allowed working days</p>
            </div>
            <Link href="/jcr-status" className="more-btn">
              <span>JCR status</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="table-scroll">
            <table style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Beneficiary</th>
                  <th>Step</th>
                  <th>Over by</th>
                </tr>
              </thead>
              <tbody>
                {annexDelays.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-slate-400">
                      No CSPDCL step is beyond its Annex G days.
                    </td>
                  </tr>
                ) : (
                  annexDelays.slice(0, 8).map(({ b, s }) => (
                    <tr key={b.id + s.step}>
                      <td>
                        <div className="cell-title">
                          <strong>{b.name}</strong>
                          <small>{b.appNo}</small>
                        </div>
                      </td>
                      <td>{s.step}</td>
                      <td>
                        <Chip tone="bad">{s.overBy} working day(s)</Chip>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Q5 */}
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow compact">5 · How much money is due, from whom, at which desk?</span>
              <h2>Receivables by lot and source</h2>
              <p>{fmtInrShort(totalOutstanding)} outstanding</p>
            </div>
            <Link href="/payment-tracker" className="more-btn">
              <span>Payment tracker</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="table-scroll">
            <table style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Due by source</th>
                  <th>Desk</th>
                </tr>
              </thead>
              <tbody>
                {receivables.filter((r) => !r.p.closed).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-slate-400">
                      <WalletCards className="w-6 h-6 mx-auto mb-1 opacity-40" />
                      No submitted dockets awaiting payment.
                    </td>
                  </tr>
                ) : (
                  receivables
                    .filter((r) => !r.p.closed)
                    .slice(0, 8)
                    .map((r) => (
                      <tr key={r.p.id}>
                        <td className="strong-cell">{r.lot?.lotNo || '—'}</td>
                        <td>
                          {r.bySource.map((s) => (
                            <div key={s.source}>
                              <small>
                                {s.source}: <strong>{fmtInrShort(Math.max(0, s.due))}</strong>
                              </small>
                            </div>
                          ))}
                        </td>
                        <td>{r.lastDesk ? `${r.lastDesk.desk} · ${fmtDate(r.lastDesk.date)}` : 'Not moved'}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Contract compliance queues (preserved) */}
      <div className="queue-counts" style={{ marginTop: 17 }}>
        <Link href="/contract-compliance" className="queue-count blue">
          <span>GTP Approval Queue</span>
          <strong>{gtpQueueCount}</strong>
          <small>
            <Clock3 className="w-3.5 h-3.5" />
            Awaiting CSPDCL Technical Cell review
          </small>
        </Link>

        <Link href="/contract-compliance" className="queue-count amber">
          <span>Inspection Calls Due</span>
          <strong>{inspectionDueCount}</strong>
          <small>
            <AlertTriangle className="w-3.5 h-3.5" />
            Pre-dispatch inspection calls
          </small>
        </Link>

        <Link href="/contract-compliance" className="queue-count red">
          <span>Pending PBG(Performance Bank Guarantee) & Agreements</span>
          <strong>{pendingExecutionCount}</strong>
          <small>
            <FileText className="w-3.5 h-3.5" />
            Agreements & bank guarantees pending
          </small>
        </Link>
      </div>

      {/* Recent contracts & circle summary (preserved) */}
      <div className="lower-grid mt-4">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Recent Contract Packages</h2>
              <p>Active government packages & compliance readiness</p>
            </div>
            <Link href="/contract-compliance" className="more-btn">
              <span>View all ({totalContracts})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Capacity</th>
                  <th>Entity</th>
                  <th>Compliance</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-slate-600">No contract packages found</p>
                      <p className="text-xs text-slate-400 mt-1">Your local storage does not contain any contracts yet.</p>
                      <Link href="/contract-compliance" className="primary-btn inline-flex mt-3 text-xs py-1.5 px-3">
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Contract Package
                      </Link>
                    </td>
                  </tr>
                ) : (
                  contracts.slice(0, 5).map((c) => {
                    const m = complianceItems(c)
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/contract-compliance/${c.id}`} className="font-semibold text-slate-800 hover:text-teal-700">
                            {c.contractName}
                          </Link>
                          <br />
                          <small className="text-slate-400">{c.packageCode}</small>
                        </td>
                        <td>{c.kwp} kWp</td>
                        <td>
                          <span className="entity-chip">{c.entity}</span>
                        </td>
                        <td>
                          {m.filter((x) => x.done).length}/{m.length}
                        </td>
                        <td>
                          <StatusPill value={c.overallStatus} />
                        </td>
                        <td className="text-right">
                          <Link href={`/contract-compliance/${c.id}`} className="action-icon-btn" title="View contract">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card lots-card">
          <div className="card-head">
            <div>
              <h2>Circle Execution Summary</h2>
              <p>Contract compliance and lot execution by circle</p>
            </div>
            <Link href="/lots" className="more-btn">
              <span>View lots</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Circle / Division</th>
                  <th>Capacity</th>
                  <th>Sites done</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {circleList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">
                      <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-slate-600">No circle execution records</p>
                      <p className="text-xs text-slate-400 mt-1">Contracts created with circle data will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  circleList.map((item) => (
                    <tr key={item.circle}>
                      <td>
                        <div className="lot-cell">
                          <div className="lot-avatar">{item.circle.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <strong>{item.circle} Circle</strong>
                            <span>{item.divisionNames}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{item.kwp}</strong> kWp <small>({item.lotKw} kW allotted)</small>
                      </td>
                      <td>{item.commissioned}</td>
                      <td>
                        <span className={`status-badge ${item.atRisk > 0 ? 'risk' : item.pct >= 50 ? 'good' : 'warning'}`}>{item.atRisk > 0 ? 'At Risk' : item.pct >= 50 ? 'On Track' : 'In Progress'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {atRiskCount > 0 && (
        <p className="muted" style={{ fontSize: 10, marginTop: 10 }}>
          <FileCheck2 className="w-3 h-3 inline" /> {atRiskCount} contract package(s) have compliance milestones at risk or overdue.
        </p>
      )}
    </div>
  )
}
