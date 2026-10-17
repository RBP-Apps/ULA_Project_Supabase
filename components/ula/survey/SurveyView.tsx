'use client'

import React, { useMemo, useState } from 'react'
import { ClipboardCheck, Eye, FileDown, Send, Gavel, Lock, AlertTriangle } from 'lucide-react'
import {
  PageHeader,
  MiniStat,
  Tabs,
  EmptyBlock,
  Chip,
  DaysChip,
  Modal,
  SelectField,
  DateField,
  TextField,
  TextArea,
  NoteBanner,
  usePaged,
  Pager,
  reportSave,
  toast,
  useUserName,
} from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { SurveyFormModal } from './SurveyFormModal'
import { QueueFilters, applyQueueFilter, EMPTY_FILTER } from './QueueFilters'
import { useBeneficiaries, useLots, useIps, useIpMap, useLotMap, useWorkOrders, updateBeneficiary } from '@/lib/ula/data'
import { patch, logActivity } from '@/lib/ula/storage'
import { stageOf, useSettings, addDays, daysBetween, today, fmtDate, fmtDateTime, siteDueDate, downloadCsv, summarizeLot } from '@/lib/ula/workflow'
import type { Beneficiary, Lot } from '@/lib/ula/types'

const TABS = ['To survey', 'Awaiting review', 'CSPDCL review', 'Dropped', 'Lot feasibility reports'] as const
type Tab = (typeof TABS)[number]

export function SurveyView() {
  const all = useBeneficiaries()
  const lots = useLots()
  const lotMap = useLotMap()
  const ips = useIps()
  const ipMap = useIpMap()
  const wos = useWorkOrders()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('To survey')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [review, setReview] = useState<Beneficiary | null>(null)
  const [report, setReport] = useState<Lot | null>(null)

  const lockedLots = lots.filter((l) => l.listLocked)
  const inScope = useMemo(() => {
    const lockedIds = new Set(lots.filter((l) => l.listLocked).map((l) => l.id))
    return all.filter((b) => lockedIds.has(b.lotId))
  }, [all, lots])

  const buckets = useMemo(() => {
    const toSurvey: Beneficiary[] = []
    const awaiting: Beneficiary[] = []
    const cspdcl: Beneficiary[] = []
    const dropped: Beneficiary[] = []
    inScope.forEach((b) => {
      const st = stageOf(b)
      if (st === 'Survey') (b.survey.status === 'Submitted' ? awaiting : toSurvey).push(b)
      else if (st === 'CSPDCL Review') cspdcl.push(b)
      else if (st === 'Dropped') dropped.push(b)
    })
    return { toSurvey, awaiting, cspdcl, dropped }
  }, [inScope])

  const surveyDue = (b: Beneficiary) => {
    const lot = lotMap.get(b.lotId)
    return lot ? addDays(lot.allotmentDate, settings.sla.surveyDays) : ''
  }
  const dayNo = (b: Beneficiary) => {
    const lot = lotMap.get(b.lotId)
    return lot ? daysBetween(lot.allotmentDate, today()) : 0
  }
  const assigned = (b: Beneficiary) => !!(b.workOrderId && b.ipId && wos.some((w) => w.id === b.workOrderId && w.status !== 'Declined'))

  const d4Pending = buckets.toSurvey.filter((b) => dayNo(b) >= settings.sla.surveyDays - 1).length
  const overdue = buckets.toSurvey.concat(buckets.awaiting).filter((b) => today() > surveyDue(b)).length
  const blocked = buckets.toSurvey.filter((b) => !assigned(b)).length

  const current = tab === 'To survey' ? buckets.toSurvey : tab === 'Awaiting review' ? buckets.awaiting : tab === 'CSPDCL review' ? buckets.cspdcl : tab === 'Dropped' ? buckets.dropped : []
  const rows = applyQueueFilter(current, filter).sort((a, b) => surveyDue(a).localeCompare(surveyDue(b)))
  const paged = usePaged(rows, 25)

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Execution · Stage 2"
        title="Survey & Feasibility"
        description="Site survey with geotagged photos, roof and shade check, existing-RTS declaration and consumer signature. Feasibility report due 5 days from allotment."
      />

      <div className="mini-stats">
        <MiniStat label="To survey" value={buckets.toSurvey.length} hint={blocked ? `${blocked} blocked — no work order` : undefined} active={tab === 'To survey'} onClick={() => setTab('To survey')} />
        <MiniStat label="Pending at D4 or later" value={d4Pending} tone={d4Pending ? 'warn' : undefined} />
        <MiniStat label="Past D5 tender limit" value={overdue} tone={overdue ? 'bad' : 'good'} />
        <MiniStat label="Awaiting review" value={buckets.awaiting.length} active={tab === 'Awaiting review'} onClick={() => setTab('Awaiting review')} />
        <MiniStat label="With CSPDCL (not feasible)" value={buckets.cspdcl.length} tone={buckets.cspdcl.length ? 'warn' : undefined} active={tab === 'CSPDCL review'} onClick={() => setTab('CSPDCL review')} />
        <MiniStat label="Dropped" value={buckets.dropped.length} active={tab === 'Dropped'} onClick={() => setTab('Dropped')} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ 'To survey': buckets.toSurvey.length, 'Awaiting review': buckets.awaiting.length, 'CSPDCL review': buckets.cspdcl.length, Dropped: buckets.dropped.length, 'Lot feasibility reports': lockedLots.length }} />

      {tab === 'Lot feasibility reports' ? (
        <LotReports lots={lockedLots} onMark={setReport} />
      ) : (
        <section className="card table-card">
          <QueueFilters value={filter} onChange={setFilter} lots={lockedLots} ips={ips} beneficiaries={current} />
          {lockedLots.length === 0 ? (
            <EmptyBlock icon={Lock} title="No locked lots" text="Surveys start once a lot's beneficiary list is imported and locked, and sites are assigned through work orders." />
          ) : rows.length === 0 ? (
            <EmptyBlock icon={ClipboardCheck} title={current.length ? 'Nothing matches these filters' : `Nothing in “${tab}”`} />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Application / Name</th>
                      <th>Lot</th>
                      <th>kW</th>
                      <th>IP</th>
                      {tab === 'CSPDCL review' ? <th>Reason not feasible</th> : tab === 'Dropped' ? <th>Reason</th> : <th>Survey due (D5)</th>}
                      <th>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.slice.map((b) => {
                      const due = surveyDue(b)
                      const ok = assigned(b)
                      return (
                        <tr key={b.id}>
                          <td>
                            <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                              <strong>{b.name}</strong>
                              <small>
                                {b.appNo} · {b.subDivision || b.district}
                              </small>
                            </button>
                          </td>
                          <td>{lotMap.get(b.lotId)?.lotNo}</td>
                          <td>{b.sanctionedKw}</td>
                          <td>{b.ipId ? ipMap.get(b.ipId)?.name : <Chip tone="bad">No work order</Chip>}</td>
                          {tab === 'CSPDCL review' ? (
                            <td style={{ maxWidth: 260 }}>{b.survey.feasibilityRemarks || '—'}</td>
                          ) : tab === 'Dropped' ? (
                            <td style={{ maxWidth: 260 }}>{b.survey.existingRts === 'Yes' ? 'Existing rooftop solar' : `CSPDCL rejected ${fmtDate(b.survey.cspdclReviewDate)}: ${b.survey.cspdclReviewRemarks || ''}`}</td>
                          ) : (
                            <td>
                              <div className="cell-title">
                                <strong>{fmtDate(due)}</strong>
                                <DaysChip days={daysBetween(today(), due)} />
                              </div>
                            </td>
                          )}
                          <td>
                            {tab === 'CSPDCL review' ? (
                              <Chip tone="warn">Awaiting CSPDCL since {fmtDate(b.survey.acceptedAt)}</Chip>
                            ) : (
                              <>
                                <Chip tone={b.survey.status === 'Returned' ? 'bad' : b.survey.status === 'Submitted' ? 'info' : b.survey.status === 'Accepted' ? 'good' : 'warn'}>{b.survey.status}</Chip>
                                {b.survey.existingRts === 'Yes' && tab !== 'Dropped' && (
                                  <>
                                    {' '}
                                    <Chip tone="bad">RTS exists</Chip>
                                  </>
                                )}
                                {b.survey.submittedAt && tab === 'Awaiting review' && <small className="muted"> {fmtDateTime(b.survey.submittedAt)}</small>}
                              </>
                            )}
                          </td>
                          <td className="text-right">
                            <div className="row-actions">
                              <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {tab === 'CSPDCL review' ? (
                                <button type="button" className="primary-btn btn-sm" onClick={() => setReview(b)}>
                                  <Gavel className="w-3 h-3" /> Record decision
                                </button>
                              ) : tab === 'Dropped' ? null : (
                                <button
                                  type="button"
                                  className="primary-btn btn-sm"
                                  disabled={!ok}
                                  title={ok ? '' : 'Assign this site to an IP work order first'}
                                  onClick={() => (ok ? setOpen(b.id) : toast('Assign this site to an IP work order first', 'error'))}
                                >
                                  <ClipboardCheck className="w-3 h-3" /> {tab === 'Awaiting review' ? 'Review' : b.survey.status === 'Pending' && !b.survey.surveyDate ? 'Start survey' : 'Continue'}
                                </button>
                              )}
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
      )}

      {open && <SurveyFormModal id={open} onClose={() => setOpen(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
      {review && <CspdclReviewModal b={review} onClose={() => setReview(null)} />}
      {report && <MarkReportModal lot={report} onClose={() => setReport(null)} />}
    </div>
  )
}

// ---------------- CSPDCL review of non-feasible sites ----------------

function CspdclReviewModal({ b, onClose }: { b: Beneficiary; onClose: () => void }) {
  const user = useUserName()
  const lot = useLotMap().get(b.lotId)
  const settings = useSettings()
  const [decision, setDecision] = useState<'' | 'Approved' | 'Rejected'>('')
  const [date, setDate] = useState(today())
  const [remarks, setRemarks] = useState('')
  const submit = () => {
    if (!decision) return toast('Select CSPDCL decision', 'error')
    if (!date) return toast('Decision date is required', 'error')
    if (decision === 'Rejected' && !remarks.trim()) return toast('Record CSPDCL remarks for a rejection', 'error')
    const ok = updateBeneficiary(
      b.id,
      (x) => ({ ...x, survey: { ...x.survey, cspdclReview: decision, cspdclReviewDate: date, cspdclReviewRemarks: remarks.trim() } }),
      user,
      `CSPDCL review: ${decision}${remarks.trim() ? ` — ${remarks.trim()}` : ''}`
    )
    if (reportSave(ok, decision === 'Approved' ? `${b.name} approved by CSPDCL — moves to Design` : `${b.name} rejected by CSPDCL — site dropped`)) onClose()
  }
  const dueIfApproved = lot && date ? siteDueDate({ ...b, survey: { ...b.survey, cspdclReview: 'Approved', cspdclReviewDate: date } }, lot, settings.sla) : ''
  return (
    <Modal
      size="narrow"
      eyebrow={`Application ${b.appNo}`}
      title="CSPDCL review decision"
      subtitle={`${b.name} · surveyed not feasible: ${b.survey.feasibilityRemarks}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Gavel className="w-4 h-4" /> Save decision
          </button>
        </>
      }
    >
      <div className="form-grid">
        <SelectField label="CSPDCL decision" required value={decision} options={['Approved', 'Rejected']} onChange={(v) => setDecision(v as typeof decision)} />
        <DateField label="Decision date" required value={date} max={today()} onChange={setDate} />
        <TextArea label="CSPDCL remarks" span2 value={remarks} onChange={setRemarks} />
      </div>
      {decision === 'Approved' && dueIfApproved && <NoteBanner>Approved site gets its own due date: {fmtDate(dueIfApproved)} (decision date + {settings.sla.commissionDaysAfterReport} days).</NoteBanner>}
      {decision === 'Rejected' && <NoteBanner>The site will be dropped from the lot and excluded from lot value, LD and billing.</NoteBanner>}
    </Modal>
  )
}

// ---------------- Lot feasibility reports ----------------

function LotReports({ lots, onMark }: { lots: Lot[]; onMark: (l: Lot) => void }) {
  const all = useBeneficiaries()
  const settings = useSettings()
  const ipMap = useIpMap()

  const exportReport = (lot: Lot) => {
    const list = all.filter((b) => b.lotId === lot.id)
    downloadCsv(`${lot.lotNo}-feasibility-report.csv`, [
      ['Lot', lot.lotNo, 'Allotment letter', lot.allotmentLetterNo, 'D0', lot.allotmentDate],
      [],
      ['Application No', 'Name', 'Consumer No', 'kW', 'Sub-division', 'IP', 'Survey date', 'Surveyor', 'Roof type', 'Usable area (sq m)', 'Shade', 'Orientation', 'Structure', 'Existing RTS', 'Feasible', 'Remarks', 'Photos', 'Consumer signed', 'Survey status', 'CSPDCL review'],
      ...list.map((b) => [
        b.appNo,
        b.name,
        b.consumerNo,
        b.sanctionedKw,
        b.subDivision,
        b.ipId ? ipMap.get(b.ipId)?.name : '',
        b.survey.surveyDate,
        b.survey.surveyor,
        b.survey.roofType,
        b.survey.usableArea || '',
        b.survey.shade,
        b.survey.orientation,
        b.survey.structureType,
        b.survey.existingRts,
        b.survey.feasible,
        b.survey.feasibilityRemarks,
        b.survey.photos.length,
        b.survey.consumerSigned ? 'Yes' : 'No',
        b.survey.status,
        b.survey.cspdclReview,
      ]),
    ])
  }

  if (!lots.length) return <EmptyBlock icon={Lock} title="No locked lots" />
  return (
    <section className="card table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lot</th>
              <th>D0 / D5</th>
              <th>Sites</th>
              <th>Submitted</th>
              <th>Accepted</th>
              <th>Feasible / Not / Ineligible</th>
              <th>Report to CSPDCL</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => {
              const list = all.filter((b) => b.lotId === lot.id)
              const accepted = list.filter((b) => b.survey.status === 'Accepted')
              const submitted = list.filter((b) => b.survey.status === 'Submitted').length
              const d5 = addDays(lot.allotmentDate, settings.sla.surveyDays)
              const feasible = accepted.filter((b) => b.survey.feasible === 'Yes' && b.survey.existingRts !== 'Yes').length
              const ineligible = accepted.filter((b) => b.survey.existingRts === 'Yes').length
              const notFeasible = accepted.length - feasible - ineligible
              const complete = list.length > 0 && accepted.length === list.length
              const s = summarizeLot(lot, all, settings)
              return (
                <tr key={lot.id}>
                  <td className="strong-cell">
                    {lot.lotNo}
                    <br />
                    <small className="muted">{lot.district}</small>
                  </td>
                  <td>
                    {fmtDate(lot.allotmentDate)} / {fmtDate(d5)}
                  </td>
                  <td>{list.length}</td>
                  <td>{submitted}</td>
                  <td>
                    {accepted.length} / {list.length}
                  </td>
                  <td>
                    {feasible} / {notFeasible} / {ineligible}
                  </td>
                  <td>
                    {lot.feasibilityReportDate ? (
                      <div className="cell-title">
                        <Chip tone={lot.feasibilityReportDate > d5 ? 'warn' : 'good'}>Sent {fmtDate(lot.feasibilityReportDate)}</Chip>
                        <small>
                          {lot.feasibilityReportRef || ''} · lot due {fmtDate(s.dueDate)}
                        </small>
                      </div>
                    ) : (
                      <DaysChip days={daysBetween(today(), d5)} />
                    )}
                  </td>
                  <td className="text-right">
                    <div className="row-actions">
                      <button type="button" className="outline-btn btn-sm" onClick={() => exportReport(lot)} disabled={!list.length}>
                        <FileDown className="w-3 h-3" /> Export report
                      </button>
                      <button
                        type="button"
                        className="primary-btn btn-sm"
                        disabled={!complete}
                        title={complete ? '' : 'Every beneficiary in the lot needs an accepted survey first'}
                        onClick={() => onMark(lot)}
                      >
                        <Send className="w-3 h-3" /> {lot.feasibilityReportDate ? 'Update sent date' : 'Mark sent to CSPDCL'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MarkReportModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const user = useUserName()
  const settings = useSettings()
  const [date, setDate] = useState(lot.feasibilityReportDate || today())
  const [ref, setRef] = useState(lot.feasibilityReportRef || '')
  const d5 = addDays(lot.allotmentDate, settings.sla.surveyDays)
  const submit = () => {
    if (!date) return toast('Date is required', 'error')
    if (date < lot.allotmentDate) return toast('Report date cannot be before allotment (D0)', 'error')
    if (reportSave(patch<Lot>('lots', lot.id, (l) => ({ ...l, feasibilityReportDate: date, feasibilityReportRef: ref.trim() })), `Feasibility report of ${lot.lotNo} recorded — commissioning due ${fmtDate(addDays(date, settings.sla.commissionDaysAfterReport))}`))
    {
      logActivity(user, 'Lot', lot.id, `Feasibility report sent to CSPDCL on ${date}${ref.trim() ? ` (${ref.trim()})` : ''}`)
      onClose()
    }
  }
  return (
    <Modal
      size="narrow"
      eyebrow={`Lot ${lot.lotNo}`}
      title="Feasibility report sent to CSPDCL"
      subtitle="This date starts the 25-day commissioning clock for the lot (Corr-1 cl. 1.5)."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Send className="w-4 h-4" /> Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <DateField label="Date sent" required value={date} max={today()} onChange={setDate} />
        <TextField label="Letter / email reference" value={ref} onChange={setRef} />
      </div>
      {date > d5 && (
        <div className="gate-box bad">
          <strong>
            <AlertTriangle className="w-4 h-4" /> After the D5 limit ({fmtDate(d5)}) — {daysBetween(d5, date)} day(s) late.
          </strong>
        </div>
      )}
      {date && <NoteBanner>Lot commissioning due date becomes {fmtDate(addDays(date, settings.sla.commissionDaysAfterReport))}.</NoteBanner>}
    </Modal>
  )
}
