'use client'

import React, { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { PageHeader, Tabs, EmptyBlock, Chip, ProgressBar, DaysChip, MiniStat, usePaged, Pager } from '../ui'
import { useBeneficiaries, useContracts, useIps, useLotMap, useLotSummaries, usePurchaseOrders, useDispatches } from '@/lib/ula/data'
import { useCollection } from '@/lib/ula/storage'
import {
  STAGES,
  stageOf,
  completeness,
  completenessPct,
  annexGSteps,
  packageLd,
  useSettings,
  fmtDate,
  fmtDateTime,
  fmtInr,
  fmtInrShort,
  downloadCsv,
  isCommissioned,
  type Stage,
} from '@/lib/ula/workflow'
import type { ActivityLog, PaymentFollowUp, PaymentSource } from '@/lib/ula/types'

const TABS = ['kW by stage', 'Lots at risk & LD', 'Completeness', 'CSPDCL delays', 'Receivables', 'IP performance', 'Activity log'] as const
type Tab = (typeof TABS)[number]

const STAGE_COLORS: Record<Stage, string> = {
  Survey: '#d6a03a',
  'CSPDCL Review': '#c66d2f',
  Design: '#8a78d1',
  'Awaiting Dispatch': '#b2bec3',
  'In Transit': '#5b8bd8',
  Installation: '#3d74c9',
  QC: '#2d97b5',
  'Portal Update': '#2aa59a',
  Inspection: '#239485',
  Commissioning: '#1b8573',
  Commissioned: '#127a5f',
  Dropped: '#d6575b',
}

function CsvBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="outline-btn" onClick={onClick} disabled={disabled}>
      <Download className="w-4 h-4" /> Export CSV
    </button>
  )
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card section-card">
      <div className="section-title">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ReportsView() {
  const [tab, setTab] = useState<Tab>('kW by stage')
  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Reports" title="Reports" description="Live reports computed from the records in this browser. Every report can be exported to CSV." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'kW by stage' && <StageReport />}
      {tab === 'Lots at risk & LD' && <LdReport />}
      {tab === 'Completeness' && <CompletenessReport />}
      {tab === 'CSPDCL delays' && <DelayReport />}
      {tab === 'Receivables' && <ReceivablesReport />}
      {tab === 'IP performance' && <IpReport />}
      {tab === 'Activity log' && <ActivityReport />}
    </div>
  )
}

// 1 ---------------- kW by stage ----------------

function StageReport() {
  const bens = useBeneficiaries()
  const lots = useLotMap()
  const contracts = useContracts()
  const [by, setBy] = useState<'package' | 'district'>('package')

  const { groups, totals } = useMemo(() => {
    const groups = new Map<string, Record<Stage, number>>()
    const totals = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>
    bens.forEach((b) => {
      const lot = lots.get(b.lotId)
      const key = by === 'package' ? contracts.find((c) => c.id === lot?.contractId)?.packageCode || 'No package' : b.district || lot?.district || 'No district'
      if (!groups.has(key)) groups.set(key, Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>)
      const st = stageOf(b)
      groups.get(key)![st] += b.sanctionedKw || 0
      totals[st] += b.sanctionedKw || 0
    })
    return { groups: Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])), totals }
  }, [bens, lots, contracts, by])
  const totalKw = STAGES.reduce((a, s) => a + totals[s], 0)

  if (!bens.length) return <Section title="kW at each stage"><EmptyBlock title="No beneficiaries yet" /></Section>

  return (
    <div className="stack">
      <Section title="kW at each stage (all lots)" sub={`${totalKw.toLocaleString('en-IN')} kW across ${bens.length} sites`}>
        {STAGES.filter((s) => totals[s]).map((s) => (
          <div className="bar-row" key={s}>
            <span>{s}</span>
            <div className="track">
              <span style={{ width: `${(totals[s] / totalKw) * 100}%`, background: STAGE_COLORS[s] }} />
            </div>
            <b>{totals[s].toLocaleString('en-IN')} kW</b>
          </div>
        ))}
      </Section>
      <Section
        title={`kW by stage × ${by}`}
        action={
          <div className="row">
            <select className="filter-select" value={by} onChange={(e) => setBy(e.target.value as typeof by)} aria-label="Group by">
              <option value="package">By package</option>
              <option value="district">By district</option>
            </select>
            <CsvBtn onClick={() => downloadCsv(`kw-by-stage-${by}.csv`, [[by, ...STAGES, 'Total'], ...groups.map(([k, r]) => [k, ...STAGES.map((s) => r[s]), STAGES.reduce((a, s) => a + r[s], 0)])])} />
          </div>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{by}</th>
                <th>Distribution</th>
                {STAGES.map((s) => (
                  <th key={s}>{s}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([k, r]) => {
                const t = STAGES.reduce((a, s) => a + r[s], 0)
                return (
                  <tr key={k}>
                    <td className="strong-cell">{k}</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="stage-bar">
                        {STAGES.filter((s) => r[s]).map((s) => (
                          <span key={s} title={`${s}: ${r[s]} kW`} style={{ width: `${(r[s] / t) * 100}%`, background: STAGE_COLORS[s] }} />
                        ))}
                      </div>
                    </td>
                    {STAGES.map((s) => (
                      <td key={s}>{r[s] || '—'}</td>
                    ))}
                    <td className="strong-cell">{t}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

// 2 ---------------- Lots at risk & LD ----------------

function LdReport() {
  const summaries = useLotSummaries()
  const contracts = useContracts()
  const settings = useSettings()
  const [onlyRisk, setOnlyRisk] = useState(true)

  const rows = summaries
    .filter((s) => !s.allCommissioned && (!onlyRisk || s.overdue || s.daysLeft <= 7))
    .sort((a, b) => a.daysLeft - b.daysLeft)
  const packages = contracts
    .map((c) => {
      const ls = summaries.filter((s) => s.lot.contractId === c.id)
      return { c, ls, ld: packageLd(c, ls, settings.sla) }
    })
    .filter((p) => p.ls.length)

  return (
    <div className="stack">
      <Section
        title="Package LD (capped)"
        sub={`LD ${settings.sla.ldPercentPerWeek}% of unfinished lot value per started week after the due date, capped at ${settings.sla.ldCapPercent}% of contract value (Sec-4 cl. 8.1). Refund if the delayed and next lot both finish on time is not modelled.`}
        action={<CsvBtn disabled={!packages.length} onClick={() => downloadCsv('package-ld.csv', [['Package', 'Contract value', 'Lots', 'LD raw', 'Cap', 'LD applied'], ...packages.map((p) => [p.c.packageCode, p.c.contractValue, p.ls.length, Math.round(p.ld.raw), Math.round(p.ld.cap), Math.round(p.ld.applied)])])} />}
      >
        {packages.length === 0 ? (
          <EmptyBlock title="No lots registered" />
        ) : (
          <div className="mini-stats">
            {packages.map((p) => (
              <MiniStat key={p.c.id} label={p.c.packageCode || p.c.contractName} value={fmtInrShort(p.ld.applied)} tone={p.ld.applied ? 'bad' : 'good'} hint={`${p.ls.length} lots · cap ${fmtInrShort(p.ld.cap)}${p.ld.raw > p.ld.cap ? ' (cap reached)' : ''}`} />
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Lots that will miss or have missed the due date"
        action={
          <div className="row">
            <label className="check-field">
              <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} /> Only overdue or ≤ 7 days left
            </label>
            <CsvBtn disabled={!rows.length} onClick={() => downloadCsv('lots-at-risk.csv', [['Lot', 'District', 'Due', 'Days left', 'Sites', 'Commissioned', 'Unfinished value', 'LD weeks', 'LD'], ...rows.map((s) => [s.lot.lotNo, s.lot.district, s.dueDate, s.daysLeft, s.activeSites, s.commissioned, Math.round(s.unfinishedValue), s.ldWeeks, Math.round(s.ldAmount)])])} />
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyBlock title={onlyRisk ? 'No lots at risk' : 'No open lots'} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Due</th>
                  <th>Days</th>
                  <th>Progress</th>
                  <th>Pending sites</th>
                  <th>Unfinished value</th>
                  <th>LD (live)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.lot.id}>
                    <td>
                      <div className="cell-title">
                        <strong>{s.lot.lotNo}</strong>
                        <small>{s.lot.district}</small>
                      </div>
                    </td>
                    <td>{fmtDate(s.dueDate)}</td>
                    <td>
                      <DaysChip days={s.daysLeft} />
                    </td>
                    <td>
                      <ProgressBar pct={s.activeSites ? Math.round((s.commissioned / s.activeSites) * 100) : 0} />
                    </td>
                    <td>{s.activeSites - s.commissioned}</td>
                    <td>{fmtInr(s.unfinishedValue)}</td>
                    <td>{s.ldAmount ? <Chip tone="bad">{fmtInr(s.ldAmount)} · {s.ldWeeks} wk</Chip> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

// 3 ---------------- Completeness ----------------

function CompletenessReport() {
  const bens = useBeneficiaries()
  const lots = useLotMap()
  const pos = usePurchaseOrders()
  const dispatches = useDispatches()
  const settings = useSettings()
  const [lotId, setLotId] = useState('')
  const [q, setQ] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(true)

  const rows = useMemo(
    () =>
      bens
        .filter((b) => (!lotId || b.lotId === lotId) && stageOf(b) !== 'Dropped')
        .map((b) => {
          const items = completeness(b, { lotPos: pos.filter((p) => p.lotId === b.lotId && p.status === 'Received'), dispatch: dispatches.find((d) => d.id === b.dispatchId) }, settings)
          return { b, pct: completenessPct(items), missing: items.filter((i) => !i.done) }
        }),
    [bens, lotId, pos, dispatches, settings]
  )
  const filtered = rows.filter((r) => {
    const t = q.toLowerCase()
    return (!t || [r.b.appNo, r.b.name].some((x) => x.toLowerCase().includes(t))) && (!onlyIncomplete || r.missing.length)
  })
  const paged = usePaged(filtered, 25)
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0

  return (
    <Section
      title="Beneficiary billing checklist (22 items)"
      sub={`${rows.length} active sites · average ${avg}% complete · ${rows.filter((r) => !r.missing.length).length} fully complete`}
      action={
        <CsvBtn
          disabled={!filtered.length}
          onClick={() => downloadCsv('beneficiary-completeness.csv', [['Lot', 'Application', 'Name', 'Stage', 'Complete %', 'Missing items'], ...filtered.map((r) => [lots.get(r.b.lotId)?.lotNo, r.b.appNo, r.b.name, stageOf(r.b), r.pct, r.missing.map((m) => m.label).join(' | ')])])}
        />
      }
    >
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="search-box table-search" style={{ minWidth: 220 }}>
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="filter-select" value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lot">
          <option value="">All lots</option>
          {Array.from(lots.values()).map((l) => (
            <option key={l.id} value={l.id}>
              {l.lotNo}
            </option>
          ))}
        </select>
        <label className="check-field">
          <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} /> Incomplete only
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyBlock title={rows.length ? 'Nothing to show for these filters' : 'No beneficiaries yet'} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Lot</th>
                  <th>Stage</th>
                  <th>Complete</th>
                  <th>Missing items</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((r) => (
                  <tr key={r.b.id}>
                    <td>
                      <div className="cell-title">
                        <strong>{r.b.name}</strong>
                        <small>{r.b.appNo}</small>
                      </div>
                    </td>
                    <td>{lots.get(r.b.lotId)?.lotNo}</td>
                    <td>{stageOf(r.b)}</td>
                    <td>
                      <ProgressBar pct={r.pct} />
                    </td>
                    <td style={{ maxWidth: 420 }}>{r.missing.length ? r.missing.map((m) => m.label).join(' · ') : <Chip tone="good">Complete</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...paged} />
        </>
      )}
    </Section>
  )
}

// 4 ---------------- Annex G delays ----------------

function DelayReport() {
  const bens = useBeneficiaries()
  const lots = useLotMap()
  const settings = useSettings()
  const [side, setSide] = useState<'' | 'CSPDCL' | 'RBP'>('CSPDCL')
  const rows = useMemo(
    () =>
      bens
        .flatMap((b) => annexGSteps(b, settings.sla).map((s) => ({ b, s })))
        .filter((r) => r.s.overBy > 0 && (!side || r.s.side === side))
        .sort((a, b) => b.s.overBy - a.s.overBy),
    [bens, settings, side]
  )
  const paged = usePaged(rows, 25)
  return (
    <Section
      title="Steps beyond their Annex G days"
      sub="Delays on CSPDCL's side are evidence for extension of time. Working days exclude Sundays; public holidays are not modelled."
      action={
        <div className="row">
          <select className="filter-select" value={side} onChange={(e) => setSide(e.target.value as typeof side)} aria-label="Side">
            <option value="CSPDCL">CSPDCL side</option>
            <option value="RBP">RBP side</option>
            <option value="">Both</option>
          </select>
          <CsvBtn disabled={!rows.length} onClick={() => downloadCsv('annex-g-delays.csv', [['Lot', 'Application', 'Name', 'Step', 'Side', 'Start', 'End', 'Allowed WD', 'Used WD', 'Over by'], ...rows.map(({ b, s }) => [lots.get(b.lotId)?.lotNo, b.appNo, b.name, s.step, s.side, s.start, s.end || 'pending', s.allowedWorkingDays, s.usedWorkingDays, s.overBy])])} />
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyBlock title="No steps over their allowed days" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Step</th>
                  <th>Side</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Allowed / used</th>
                  <th>Over by</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map(({ b, s }) => (
                  <tr key={b.id + s.step}>
                    <td>
                      <div className="cell-title">
                        <strong>{b.name}</strong>
                        <small>
                          {b.appNo} · {lots.get(b.lotId)?.lotNo}
                        </small>
                      </div>
                    </td>
                    <td>{s.step}</td>
                    <td>
                      <Chip tone={s.side === 'CSPDCL' ? 'info' : 'warn'}>{s.side}</Chip>
                    </td>
                    <td>{fmtDate(s.start)}</td>
                    <td>{s.end ? fmtDate(s.end) : <Chip tone="warn">Pending</Chip>}</td>
                    <td>
                      {s.allowedWorkingDays} / {s.usedWorkingDays} WD
                    </td>
                    <td>
                      <Chip tone="bad">{s.overBy} WD</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...paged} />
        </>
      )}
    </Section>
  )
}

// 5 ---------------- Receivables ----------------

const SOURCES: PaymentSource[] = ['CFA (MNRE)', 'SFA + District share (CSPDCL)']

function ReceivablesReport() {
  const payments = useCollection<PaymentFollowUp>('payments')
  const summaries = useLotSummaries()
  const rows = summaries
    .filter((s) => s.commissioned > 0 || payments.some((p) => p.lotId === s.lot.id))
    .map((s) => {
      const p = payments.find((x) => x.lotId === s.lot.id)
      const bySrc = SOURCES.map((src) => {
        const expected = p?.expected.filter((e) => e.source === src).reduce((a, e) => a + e.amount, 0) || 0
        const received = p?.receipts.filter((r) => r.source === src).reduce((a, r) => a + r.gross, 0) || 0
        return { src, expected, received, due: expected - received }
      })
      const lastDesk = p?.movements.length ? [...p.movements].sort((a, b) => b.date.localeCompare(a.date))[0] : undefined
      const writeOff = p?.writeOff?.amount || 0
      return { s, p, bySrc, lastDesk, writeOff, totalDue: bySrc.reduce((a, x) => a + x.due, 0) - writeOff }
    })
  const total = rows.reduce((a, r) => a + Math.max(0, r.totalDue), 0)
  const bySrcTotal = SOURCES.map((src) => rows.reduce((a, r) => a + Math.max(0, r.bySrc.find((x) => x.src === src)!.due), 0))
  const max = Math.max(1, ...bySrcTotal)

  return (
    <div className="stack">
      <Section title="Money due by source" sub={`Total outstanding ${fmtInrShort(total)} (expected − received gross − approved write-off). Lots without a payment follow-up record show 0 expected.`}>
        {SOURCES.map((src, i) => (
          <div className="bar-row" key={src}>
            <span>{src}</span>
            <div className="track">
              <span style={{ width: `${(bySrcTotal[i] / max) * 100}%`, background: i ? '#3d74c9' : '#129b8a' }} />
            </div>
            <b>{fmtInrShort(bySrcTotal[i])}</b>
          </div>
        ))}
      </Section>
      <Section
        title="Receivables per lot"
        action={
          <CsvBtn
            disabled={!rows.length}
            onClick={() =>
              downloadCsv('receivables.csv', [
                ['Lot', ...SOURCES.flatMap((s) => [`${s} expected`, `${s} received`]), 'Write-off', 'Outstanding', 'Current desk', 'Closed'],
                ...rows.map((r) => [r.s.lot.lotNo, ...r.bySrc.flatMap((x) => [x.expected, x.received]), r.writeOff, r.totalDue, r.lastDesk?.desk || '', r.p?.closed ? 'Yes' : 'No']),
              ])
            }
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyBlock title="No commissioned lots or payment records yet" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  {SOURCES.map((s) => (
                    <th key={s}>{s} (recv / exp)</th>
                  ))}
                  <th>Outstanding</th>
                  <th>File at desk</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.s.lot.id}>
                    <td className="strong-cell">{r.s.lot.lotNo}</td>
                    {r.bySrc.map((x) => (
                      <td key={x.src}>
                        {fmtInrShort(x.received)} / {fmtInrShort(x.expected)}
                      </td>
                    ))}
                    <td>{r.totalDue > 0 ? <Chip tone="warn">{fmtInr(r.totalDue)}</Chip> : fmtInr(0)}</td>
                    <td>{r.lastDesk ? `${r.lastDesk.desk} · ${fmtDate(r.lastDesk.date)}` : '—'}</td>
                    <td>{r.p ? r.p.closed ? <Chip tone="good">Closed</Chip> : <Chip tone="info">Following up</Chip> : <Chip>No record</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

// 6 ---------------- IP performance ----------------

function IpReport() {
  const ips = useIps()
  const bens = useBeneficiaries()
  const settings = useSettings()
  const rows = ips.map((ip) => {
    const mine = bens.filter((b) => b.ipId === ip.id)
    const installed = mine.filter((b) => b.installation.status === 'Submitted' || b.qc.history.length).length
    const rejections = mine.reduce((a, b) => a + b.qc.history.filter((h) => h.result === 'Rejected').length, 0)
    const passed = mine.filter((b) => b.qc.status === 'Passed').length
    const commissioned = mine.filter((b) => isCommissioned(b, settings)).length
    return { ip, assigned: mine.length, kw: mine.reduce((a, b) => a + b.sanctionedKw, 0), installed, rejections, passed, commissioned }
  })
  const max = Math.max(1, ...rows.map((r) => r.assigned))
  return (
    <Section
      title="Installation partner performance"
      sub="QC rejection rate = rejections ÷ installations submitted."
      action={<CsvBtn disabled={!rows.length} onClick={() => downloadCsv('ip-performance.csv', [['IP', 'Assigned', 'kW', 'Installed', 'QC passed', 'QC rejections', 'Commissioned'], ...rows.map((r) => [r.ip.name, r.assigned, r.kw, r.installed, r.passed, r.rejections, r.commissioned])])} />}
    >
      {rows.length === 0 ? (
        <EmptyBlock title="No installation partners" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>IP</th>
                <th>Assigned</th>
                <th>Installed</th>
                <th>QC passed</th>
                <th>QC rejections</th>
                <th>Commissioned</th>
                <th>Commissioned share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ip.id}>
                  <td className="strong-cell">{r.ip.name}</td>
                  <td>
                    {r.assigned} <small className="muted">({r.kw} kW)</small>
                  </td>
                  <td>{r.installed}</td>
                  <td>{r.passed}</td>
                  <td>{r.rejections ? <Chip tone={r.installed && r.rejections / r.installed > 0.2 ? 'bad' : 'warn'}>{r.rejections}{r.installed ? ` (${Math.round((r.rejections / r.installed) * 100)}%)` : ''}</Chip> : '0'}</td>
                  <td>{r.commissioned}</td>
                  <td style={{ minWidth: 160 }}>
                    <div className="bar-row" style={{ gridTemplateColumns: '1fr 40px' }}>
                      <div className="track">
                        <span style={{ width: `${(r.assigned / max) * 100}%`, background: '#d6e4e8', display: 'flex' }}>
                          <span style={{ width: `${r.assigned ? (r.commissioned / r.assigned) * 100 : 0}%`, background: '#129b8a' }} />
                        </span>
                      </div>
                      <b>{r.assigned ? Math.round((r.commissioned / r.assigned) * 100) : 0}%</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// 7 ---------------- Activity log ----------------

function ActivityReport() {
  const log = useCollection<ActivityLog>('activity')
  const [q, setQ] = useState('')
  const [userF, setUserF] = useState('')
  const [entity, setEntity] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const users = useMemo(() => Array.from(new Set(log.map((l) => l.by))).sort(), [log])
  const entities = useMemo(() => Array.from(new Set(log.map((l) => l.entity))).sort(), [log])
  const rows = log.filter((l) => {
    const d = l.at.slice(0, 10)
    const t = q.toLowerCase()
    return (!t || [l.action, l.entityId].some((x) => x.toLowerCase().includes(t))) && (!userF || l.by === userF) && (!entity || l.entity === entity) && (!from || d >= from) && (!to || d <= to)
  })
  const paged = usePaged(rows, 50)
  return (
    <Section
      title="Activity log"
      sub="Last 2,000 actions recorded in this browser."
      action={<CsvBtn disabled={!rows.length} onClick={() => downloadCsv('activity-log.csv', [['Time', 'User', 'Entity', 'Entity ID', 'Action'], ...rows.map((l) => [l.at, l.by, l.entity, l.entityId, l.action])])} />}
    >
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="search-box table-search" style={{ minWidth: 200 }}>
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search action…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="filter-select" value={userF} onChange={(e) => setUserF(e.target.value)} aria-label="User">
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <select className="filter-select" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity">
          <option value="">All entities</option>
          {entities.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <input type="date" className="filter-select" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input type="date" className="filter-select" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>
      {rows.length === 0 ? (
        <EmptyBlock title={log.length ? 'No entries match' : 'No activity recorded yet'} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Entity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDateTime(l.at)}</td>
                    <td>{l.by}</td>
                    <td>
                      {l.entity}
                      <br />
                      <small className="muted">{l.entityId}</small>
                    </td>
                    <td>{l.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...paged} />
        </>
      )}
    </Section>
  )
}
