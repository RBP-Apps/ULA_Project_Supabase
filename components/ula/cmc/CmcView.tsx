'use client'

import React, { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, CalendarClock, Download } from 'lucide-react'
import { PageHeader, Tabs, MiniStat, EmptyBlock, Chip, FileChip, usePaged, Pager, confirmAction, reportSave, useUserName } from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { useBeneficiaries, useLotMap } from '@/lib/ula/data'
import { useCollection, remove, logActivity } from '@/lib/ula/storage'
import { deleteFile } from '@/lib/ula/files'
import { fmtDate, useSettings, downloadCsv } from '@/lib/ula/workflow'
import type { CmcVisit, ComplaintTicket } from '@/lib/ula/types'
import { commissionedSites, siteSchedule } from './cmc-logic'
import { VisitModal } from './VisitModal'
import { CmcTickets } from './CmcTickets'
import { CmcBilling } from './CmcBilling'
import { CmcHandover } from './CmcHandover'

const TABS = ['Schedule', 'Visit log', 'Complaints', 'CMC billing', 'Handover'] as const
type Tab = (typeof TABS)[number]

export function CmcView() {
  const bens = useBeneficiaries()
  const visits = useCollection<CmcVisit>('cmcVisits')
  const tickets = useCollection<ComplaintTicket>('tickets')
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('Schedule')

  const sites = useMemo(() => commissionedSites(bens, settings), [bens, settings])
  const schedules = useMemo(() => sites.map((b) => siteSchedule(b, visits)), [sites, visits])
  const overdueVisits = schedules.reduce((a, s) => a + s.overdue.length, 0)
  const lowSites = new Set(visits.filter((v) => v.pr < settings.minPrCommissioning || v.cuf < settings.minCufCmc).map((v) => v.beneficiaryId))
  const openTickets = tickets.filter((t) => t.status !== 'Closed').length

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="CMC & Monitoring · Stage 15"
        title="CMC & Service"
        description="Five-year comprehensive maintenance: quarterly visits with photos, PR / CUF per site, complaint tickets, quarterly CMC bills per lot and warranty transfer at year 5."
      />
      <div className="mini-stats">
        <MiniStat label="Sites under CMC" value={sites.length} />
        <MiniStat label="Visits logged" value={visits.length} tone="good" />
        <MiniStat label="Overdue visits" value={overdueVisits} tone={overdueVisits ? 'bad' : undefined} onClick={() => setTab('Schedule')} />
        <MiniStat label="Sites below PR / CUF" value={lowSites.size} tone={lowSites.size ? 'bad' : undefined} hint={`PR < ${settings.minPrCommissioning}% or CUF < ${settings.minCufCmc}%`} onClick={() => setTab('Visit log')} />
        <MiniStat label="Open complaints" value={openTickets} tone={openTickets ? 'warn' : undefined} onClick={() => setTab('Complaints')} />
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Schedule: overdueVisits || undefined, Complaints: openTickets || undefined } as Partial<Record<Tab, number>>} />
      {tab === 'Schedule' && <ScheduleTab schedules={schedules} visits={visits} sites={sites} />}
      {tab === 'Visit log' && <VisitLogTab visits={visits} sites={sites} />}
      {tab === 'Complaints' && <CmcTickets sites={sites} />}
      {tab === 'CMC billing' && <CmcBilling visits={visits} />}
      {tab === 'Handover' && <CmcHandover sites={sites} />}
    </div>
  )
}

function ScheduleTab({ schedules, visits, sites }: { schedules: ReturnType<typeof siteSchedule>[]; visits: CmcVisit[]; sites: ReturnType<typeof commissionedSites> }) {
  const lots = useLotMap()
  const [q, setQ] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [log, setLog] = useState<{ beneficiaryId: string; quarter: number } | null>(null)
  const [view, setView] = useState<string | null>(null)

  const rows = schedules
    .filter((s) => {
      const t = q.toLowerCase()
      return (!t || [s.b.appNo, s.b.name, s.b.district, lots.get(s.b.lotId)?.lotNo].some((x) => x?.toLowerCase().includes(t))) && (!onlyOverdue || s.overdue.length)
    })
    .sort((a, b) => b.overdue.length - a.overdue.length || (a.nextDue?.due || '9').localeCompare(b.nextDue?.due || '9'))
  const paged = usePaged(rows, 25)

  if (!schedules.length)
    return (
      <section className="card">
        <EmptyBlock icon={CalendarClock} title="No sites under CMC yet" text="Sites appear here once commissioned (signed JIR, certificate and PR recorded). 20 quarterly visits are scheduled from the commissioning date." />
      </section>
    )

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <div className="search-box table-search grow">
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search application no., name, lot, district…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="check-field">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Only overdue
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Site</th>
              <th>Lot</th>
              <th>Commissioned</th>
              <th>Visits done</th>
              <th>Next due</th>
              <th>Overdue</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((s) => {
              const target = s.overdue[0] || s.nextDue
              return (
                <tr key={s.b.id}>
                  <td>
                    <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(s.b.id)}>
                      <strong>{s.b.name}</strong>
                      <small>
                        {s.b.appNo} · {s.b.sanctionedKw} kW · {s.b.district}
                      </small>
                    </button>
                  </td>
                  <td>{lots.get(s.b.lotId)?.lotNo || '—'}</td>
                  <td>{fmtDate(s.b.commissioning.commissionedDate)}</td>
                  <td>{s.done} / 20</td>
                  <td>{s.nextDue ? `Q${s.nextDue.quarter} · ${fmtDate(s.nextDue.due)}` : <Chip tone="good">All logged</Chip>}</td>
                  <td>{s.overdue.length ? <Chip tone="bad">{s.overdue.map((o) => `Q${o.quarter}`).join(', ')}</Chip> : '—'}</td>
                  <td className="text-right">
                    {target && (
                      <button type="button" className="outline-btn btn-sm" onClick={() => setLog({ beneficiaryId: s.b.id, quarter: target.quarter })}>
                        <Plus className="w-3 h-3" /> Log Q{target.quarter}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyBlock title="No sites match" />}
      </div>
      <Pager {...paged} />
      {log && <VisitModal sites={sites} visits={visits} preset={log} onClose={() => setLog(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </section>
  )
}

function VisitLogTab({ visits, sites }: { visits: CmcVisit[]; sites: ReturnType<typeof commissionedSites> }) {
  const bens = useBeneficiaries()
  const settings = useSettings()
  const user = useUserName()
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [edit, setEdit] = useState<CmcVisit | 'new' | null>(null)
  const benMap = useMemo(() => new Map(bens.map((b) => [b.id, b])), [bens])
  const isLow = (v: CmcVisit) => v.pr < settings.minPrCommissioning || v.cuf < settings.minCufCmc

  const rows = visits
    .filter((v) => {
      const b = benMap.get(v.beneficiaryId)
      const t = q.toLowerCase()
      return (!t || [b?.appNo, b?.name, v.by].some((x) => x?.toLowerCase().includes(t))) && (!onlyLow || isLow(v))
    })
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate))
  const paged = usePaged(rows, 25)

  const del = (v: CmcVisit) => {
    if (!confirmAction('Delete this visit record and its photos?')) return
    if (reportSave(remove('cmcVisits', v.id), 'Visit deleted')) {
      v.photos.forEach((p) => deleteFile(p.id))
      logActivity(user, 'Beneficiary', v.beneficiaryId, `CMC Q${v.quarter} visit deleted`)
    }
  }

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <div className="search-box table-search grow">
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search site or visitor…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row">
          <label className="check-field">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Below PR / CUF only
          </label>
          <button
            type="button"
            className="outline-btn"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv('cmc-visits.csv', [
                ['Application', 'Name', 'Quarter', 'Visit date', 'Cleaning', 'PR %', 'CUF %', 'Photos', 'By', 'Remarks'],
                ...rows.map((v) => {
                  const b = benMap.get(v.beneficiaryId)
                  return [b?.appNo, b?.name, v.quarter, v.visitDate, v.cleaning ? 'Yes' : 'No', v.pr, v.cuf, v.photos.length, v.by, v.remarks]
                }),
              ])
            }
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button type="button" className="primary-btn" disabled={!sites.length} onClick={() => setEdit('new')}>
            <Plus className="w-4 h-4" /> Log visit
          </button>
        </div>
      </div>
      {visits.length === 0 ? (
        <EmptyBlock title="No CMC visits logged" text={sites.length ? 'Log the quarterly visit with photos, PR and CUF.' : 'No commissioned sites yet.'} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Quarter</th>
                  <th>Visit date</th>
                  <th>Cleaning</th>
                  <th>PR</th>
                  <th>CUF</th>
                  <th>Photos</th>
                  <th>By</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((v) => {
                  const b = benMap.get(v.beneficiaryId)
                  return (
                    <tr key={v.id}>
                      <td>
                        <div className="cell-title">
                          <strong>{b?.name || 'Deleted site'}</strong>
                          <small>{b?.appNo}</small>
                        </div>
                      </td>
                      <td>Q{v.quarter}</td>
                      <td>{fmtDate(v.visitDate)}</td>
                      <td>{v.cleaning ? <Chip tone="good">Done</Chip> : <Chip tone="bad">No</Chip>}</td>
                      <td>
                        <Chip tone={v.pr < settings.minPrCommissioning ? 'bad' : 'good'}>{v.pr}%</Chip>
                      </td>
                      <td>
                        <Chip tone={v.cuf < settings.minCufCmc ? 'bad' : 'good'}>{v.cuf}%</Chip>
                      </td>
                      <td>
                        <div className="row">{v.photos.slice(0, 2).map((p) => <FileChip key={p.id} file={p} />)}{v.photos.length > 2 && <small className="muted">+{v.photos.length - 2}</small>}</div>
                      </td>
                      <td>{v.by}</td>
                      <td className="text-right">
                        <div className="row-actions">
                          <button type="button" className="action-icon-btn" title="Edit" onClick={() => setEdit(v)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" className="action-icon-btn danger" title="Delete" onClick={() => del(v)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && <EmptyBlock title="No visits match" />}
          </div>
          <Pager {...paged} />
        </>
      )}
      {edit && <VisitModal sites={sites} visits={visits} initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </section>
  )
}
