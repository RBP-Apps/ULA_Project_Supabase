'use client'

// Work items and alerts derived from stored records.
// Every queue count, alert and escalation in the UI comes from buildWorkItems().

import { useMemo } from 'react'
import type {
  Beneficiary,
  Lot,
  WorkOrder,
  PurchaseOrder,
  Dispatch,
  Docket,
  PaymentFollowUp,
  IpBill,
  CmcVisit,
  ComplaintTicket,
  MonitoringRecord,
  Settings,
  UlaRole,
} from './types'
import type { Contract } from '../types'
import { useCollection } from './storage'
import { useContracts } from './data'
import {
  addDays,
  addWorkingDays,
  daysBetween,
  hoursSince,
  isCommissioned,
  stageOf,
  summarizeLot,
  today,
  useSettings,
  type Stage,
} from './workflow'

export type Severity = 'high' | 'medium' | 'low'

export interface WorkItem {
  id: string
  role: UlaRole
  module: string
  title: string
  detail: string
  href: string
  arrivedAt: string // YYYY-MM-DD or ISO
  dueDate: string // YYYY-MM-DD ('' = no due date)
  severity: Severity
  lotId?: string
  /** pure alerts (expiry, not-reporting) are not stage tasks */
  alertOnly?: boolean
}

export const ESCALATES_TO: Record<UlaRole, UlaRole | null> = {
  'Director / Management': null,
  'Project Head': 'Director / Management',
  'Project Coordinator': 'Project Head',
  'Survey team / IP surveyor': 'Project Coordinator',
  Engineering: 'Project Head',
  'Purchase / Stores': 'Director / Management',
  'Dispatch team': 'Project Head',
  'IP (Installation Partner)': 'Project Coordinator',
  'QC team': 'Project Head',
  'Portal / Sync team': 'Project Head',
  'Liaison team (district)': 'Project Head',
  'Billing / Accounts': 'Director / Management',
  'O&M team': 'Project Head',
}

export const ALL_ROLES = Object.keys(ESCALATES_TO) as UlaRole[]

export type QueueBucket = 'overdue' | 'dueToday' | 'arrived'

export function bucketOf(item: WorkItem, asOf = today()): QueueBucket {
  if (!item.dueDate) return 'arrived'
  const d = daysBetween(asOf, item.dueDate)
  if (d < 0) return 'overdue'
  if (d === 0) return 'dueToday'
  return 'arrived'
}

/** Overdue items escalate one level after 24 h and to the Director after 48 h. */
export function escalationOf(item: WorkItem, asOf = today()): { level: 0 | 1 | 2; to: UlaRole | null; hoursOverdue: number } {
  if (!item.dueDate) return { level: 0, to: null, hoursOverdue: 0 }
  const overdueDays = -daysBetween(asOf, item.dueDate)
  const hoursOverdue = Math.max(0, overdueDays * 24)
  if (hoursOverdue > 48 && item.role !== 'Director / Management') return { level: 2, to: 'Director / Management', hoursOverdue }
  if (hoursOverdue > 24) return { level: 1, to: ESCALATES_TO[item.role], hoursOverdue }
  return { level: 0, to: null, hoursOverdue }
}

/** Items a role should see: its own plus anything escalated to it. */
export function itemsForRole(items: WorkItem[], role: UlaRole | 'All', asOf = today()) {
  if (role === 'All') return items
  return items.filter((i) => {
    if (i.role === role) return true
    const e = escalationOf(i, asOf)
    return e.level > 0 && e.to === role
  })
}

interface Inputs {
  lots: Lot[]
  bens: Beneficiary[]
  wos: WorkOrder[]
  pos: PurchaseOrder[]
  dispatches: Dispatch[]
  dockets: Docket[]
  payments: PaymentFollowUp[]
  ipBills: IpBill[]
  visits: CmcVisit[]
  tickets: ComplaintTicket[]
  monitoring: MonitoringRecord[]
  contracts: Contract[]
  settings: Settings
}

const STAGE_OWNER: Partial<Record<Stage, UlaRole>> = {
  Survey: 'Survey team / IP surveyor',
  'CSPDCL Review': 'Liaison team (district)',
  Design: 'Engineering',
  'Awaiting Dispatch': 'Dispatch team',
  'In Transit': 'IP (Installation Partner)',
  Installation: 'IP (Installation Partner)',
  QC: 'QC team',
  'Portal Update': 'Portal / Sync team',
  Inspection: 'Liaison team (district)',
  Commissioning: 'Liaison team (district)',
}

const STAGE_HREF: Partial<Record<Stage, string>> = {
  Survey: '/survey',
  'CSPDCL Review': '/survey',
  Design: '/design',
  'Awaiting Dispatch': '/dispatch',
  'In Transit': '/dispatch',
  Installation: '/installation',
  QC: '/qc',
  'Portal Update': '/portal-update',
  Inspection: '/jcr-status',
  Commissioning: '/commissioning',
}

function addMonths(date: string, n: number) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`)
  if (isNaN(d.getTime())) return ''
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export function buildWorkItems(x: Inputs, asOf = today()): WorkItem[] {
  const { settings } = x
  const sla = settings.sla
  const out: WorkItem[] = []
  const lotMap = new Map(x.lots.map((l) => [l.id, l]))

  // ---- beneficiary stage tasks ----
  for (const b of x.bens) {
    const lot = lotMap.get(b.lotId)
    if (!lot || !lot.listLocked) continue
    const st = stageOf(b)
    const role = STAGE_OWNER[st]
    if (!role) continue
    const D0 = lot.allotmentDate
    let arrived = D0
    let due = ''
    switch (st) {
      case 'Survey':
        if (!b.ipId) continue // waits for a work order (counted under Project Coordinator below)
        due = addDays(D0, sla.surveyDays)
        break
      case 'CSPDCL Review':
        arrived = b.survey.acceptedAt || D0
        due = ''
        break
      case 'Design':
        arrived = b.survey.acceptedAt || D0
        due = addDays(D0, sla.designTargetDay)
        break
      case 'Awaiting Dispatch':
        arrived = b.design.approvedAt || D0
        due = addDays(D0, sla.materialReadyTargetDay + 1)
        break
      case 'In Transit':
        arrived = b.dispatchedAt || D0
        due = b.dispatchedAt ? addDays(b.dispatchedAt.slice(0, 10), Math.ceil(sla.vehicleReceiveHours / 24)) : ''
        break
      case 'Installation':
        arrived = b.received?.at || D0
        due = addDays(D0, sla.installEndTargetDay)
        break
      case 'QC':
        arrived = b.installation.submittedAt || D0
        due = b.installation.submittedAt ? addDays(b.installation.submittedAt.slice(0, 10), Math.ceil(sla.qcHours / 24)) : ''
        break
      case 'Portal Update': {
        const pass = [...b.qc.history].reverse().find((h) => h.result === 'Passed')
        arrived = pass?.at || D0
        due = pass ? addWorkingDays(pass.at.slice(0, 10), sla.portalUploadWorkingDays) : ''
        break
      }
      case 'Inspection':
        arrived = b.portal.uploadedAt || D0
        due = b.portal.uploadedAt ? addWorkingDays(b.portal.uploadedAt.slice(0, 10), sla.cspdclInspectDays) : ''
        break
      case 'Commissioning':
        arrived = b.commissioning.inspectionDate || D0
        due = b.commissioning.inspectionDate ? addWorkingDays(b.commissioning.inspectionDate, sla.cspdclMeterDays + sla.cspdclCommissionDays) : ''
        break
    }
    const qcRejected = st === 'Installation' && b.qc.status === 'Rejected'
    out.push({
      id: `ben-${b.id}`,
      role,
      module: st,
      title: `${st}${qcRejected ? ' (QC rejected — redo)' : ''}: ${b.name}`,
      detail: `${lot.lotNo} · ${b.appNo} · ${b.sanctionedKw} kW`,
      href: STAGE_HREF[st] || '/lots',
      arrivedAt: arrived,
      dueDate: due,
      severity: qcRejected ? 'high' : 'medium',
      lotId: lot.id,
    })
  }

  // ---- lot-level tasks ----
  for (const lot of x.lots) {
    const s = summarizeLot(lot, x.bens, settings, asOf)
    if (!lot.listLocked) {
      out.push({ id: `lot-lock-${lot.id}`, role: 'Project Coordinator', module: 'Lots', title: `Import and lock beneficiary list: ${lot.lotNo}`, detail: `${s.sites} imported`, href: `/lots/${lot.id}`, arrivedAt: lot.allotmentDate, dueDate: lot.allotmentDate, severity: 'high', lotId: lot.id })
      continue
    }
    const unassigned = x.bens.filter((b) => b.lotId === lot.id && !b.ipId && stageOf(b) !== 'Dropped').length
    if (unassigned)
      out.push({ id: `lot-wo-${lot.id}`, role: 'Project Coordinator', module: 'Work Orders', title: `Issue IP work orders: ${lot.lotNo}`, detail: `${unassigned} site(s) without an IP`, href: '/work-orders', arrivedAt: lot.allotmentDate, dueDate: addDays(lot.allotmentDate, 1), severity: 'high', lotId: lot.id })
    if (!lot.feasibilityReportDate && s.activeSites)
      out.push({ id: `lot-feas-${lot.id}`, role: 'Survey team / IP surveyor', module: 'Survey', title: `Feasibility report to CSPDCL: ${lot.lotNo}`, detail: `${s.surveyPending} survey(s) pending`, href: '/survey', arrivedAt: lot.allotmentDate, dueDate: s.d5, severity: 'high', lotId: lot.id })
    if (!lot.materialReadyAt && !s.allCommissioned)
      out.push({ id: `lot-mat-${lot.id}`, role: 'Purchase / Stores', module: 'Material', title: `Material Ready: ${lot.lotNo}`, detail: `${s.activeSites} sites · ${s.kw} kW`, href: '/material-purchase', arrivedAt: lot.allotmentDate, dueDate: addDays(lot.allotmentDate, sla.materialReadyTargetDay), severity: 'medium', lotId: lot.id })
    if (s.overdue)
      out.push({ id: `lot-ld-${lot.id}`, role: 'Project Head', module: 'LD', title: `Lot ${lot.lotNo} past due — LD running`, detail: `${s.ldWeeks} week(s) · ₹${Math.round(s.ldAmount).toLocaleString('en-IN')} at stake`, href: `/lots/${lot.id}`, arrivedAt: s.dueDate, dueDate: s.dueDate, severity: 'high', lotId: lot.id, alertOnly: true })
    const docket = x.dockets.find((d) => d.lotId === lot.id)
    if (s.allCommissioned && docket?.status !== 'Submitted') {
      const lastComm = x.bens
        .filter((b) => b.lotId === lot.id && isCommissioned(b, settings))
        .map((b) => b.commissioning.commissionedDate)
        .sort()
        .pop() || asOf
      out.push({ id: `lot-docket-${lot.id}`, role: 'Billing / Accounts', module: 'Docket', title: `Submit lot docket: ${lot.lotNo}`, detail: 'All sites commissioned', href: '/invoicing', arrivedAt: lastComm, dueDate: addDays(lastComm, sla.docketDays), severity: 'high', lotId: lot.id })
    }
  }

  // ---- work orders not accepted ----
  for (const w of x.wos) {
    if (w.status !== 'Issued') continue
    const due = addDays(w.issuedAt.slice(0, 10), Math.ceil(sla.workOrderAcceptHours / 24))
    out.push({ id: `wo-${w.id}`, role: 'IP (Installation Partner)', module: 'Work Orders', title: `Accept work order ${w.woNo}`, detail: `${w.beneficiaryIds.length} sites`, href: '/work-orders', arrivedAt: w.issuedAt, dueDate: due, severity: 'medium', lotId: w.lotId })
  }

  // ---- purchase orders at risk ----
  for (const p of x.pos) {
    if (p.status === 'Received' || p.status === 'Cancelled' || !p.expectedDate) continue
    out.push({ id: `po-${p.id}`, role: 'Purchase / Stores', module: 'Purchase', title: `${p.poNo || 'Purchase request'} — ${p.status}`, detail: `${p.vendor || 'Vendor not set'} · expected ${p.expectedDate}`, href: '/material-purchase', arrivedAt: p.raisedAt || asOf, dueDate: p.expectedDate, severity: 'medium', lotId: p.lotId || undefined })
  }

  // ---- dispatch plans awaiting approval / dispatch ----
  for (const d of x.dispatches) {
    if (d.status === 'Planned')
      out.push({ id: `dsp-appr-${d.id}`, role: 'Project Head', module: 'Dispatch', title: `Approve dispatch plan ${d.dispatchNo}`, detail: `${d.beneficiaryIds.length} sites · ${d.cluster || d.route}`, href: '/dispatch', arrivedAt: d.plannedDate, dueDate: d.plannedDate, severity: 'medium', lotId: d.lotId })
  }

  // ---- payments idle ----
  for (const p of x.payments) {
    if (p.closed) continue
    const dates = [...p.movements.map((m) => m.date), ...p.receipts.map((r) => r.date)].sort()
    const last = dates.pop()
    if (!last) continue
    out.push({ id: `pay-${p.id}`, role: 'Billing / Accounts', module: 'Payment', title: 'Follow up payment file', detail: `Last movement ${last}`, href: '/payment-tracker', arrivedAt: last, dueDate: addDays(last, sla.paymentIdleDays), severity: 'medium', lotId: p.lotId })
  }

  // ---- IP bills pending approval ----
  for (const bill of x.ipBills) {
    if (bill.status !== 'Submitted') continue
    const at = (bill.submittedAt || bill.billDate).slice(0, 10)
    out.push({ id: `ipb-${bill.id}`, role: 'Billing / Accounts', module: 'IP Payment', title: `Approve IP bill ${bill.billNo}`, detail: `₹${Math.round(bill.gross).toLocaleString('en-IN')}`, href: '/ip-payment', arrivedAt: at, dueDate: addDays(at, 7), severity: 'low' })
  }

  // ---- CMC ----
  const commissioned = x.bens.filter((b) => isCommissioned(b, settings) && b.commissioning.commissionedDate)
  for (const b of commissioned) {
    const done = new Set(x.visits.filter((v) => v.beneficiaryId === b.id).map((v) => v.quarter))
    for (let q = 1; q <= 20; q++) {
      const due = addMonths(b.commissioning.commissionedDate, 3 * q)
      if (!due || due > addDays(asOf, 15)) break
      if (!done.has(q)) {
        out.push({ id: `cmc-${b.id}-${q}`, role: 'O&M team', module: 'CMC', title: `CMC visit Q${q}: ${b.name}`, detail: b.appNo, href: '/cmc', arrivedAt: addMonths(b.commissioning.commissionedDate, 3 * (q - 1)), dueDate: due, severity: 'low', lotId: b.lotId })
        break
      }
    }
    const lowVisit = x.visits.filter((v) => v.beneficiaryId === b.id).sort((a, c) => c.quarter - a.quarter)[0]
    if (lowVisit && (lowVisit.pr < settings.minPrCommissioning || lowVisit.cuf < settings.minCufCmc))
      out.push({ id: `cmc-low-${b.id}`, role: 'O&M team', module: 'CMC', title: `Below PR/CUF: ${b.name}`, detail: `Q${lowVisit.quarter} PR ${lowVisit.pr}% · CUF ${lowVisit.cuf}%`, href: '/cmc', arrivedAt: lowVisit.visitDate, dueDate: lowVisit.visitDate, severity: 'high', alertOnly: true })
  }
  for (const t of x.tickets) {
    if (t.status === 'Closed') continue
    out.push({ id: `tkt-${t.id}`, role: 'O&M team', module: 'Complaint', title: `Close ticket ${t.ticketNo}`, detail: t.description.slice(0, 80), href: '/cmc', arrivedAt: t.openedAt, dueDate: addDays(t.openedAt.slice(0, 10), Math.ceil(sla.ticketCloseHours / 24)), severity: 'medium' })
  }
  // installed loggers that never sent data for 24 h (no monitoring record or no last-data time)
  const monById = new Map(x.monitoring.map((m) => [m.id, m]))
  for (const b of x.bens) {
    if (!b.installation.loggerId || !b.installation.installedAt || monById.get(b.id)?.lastDataAt) continue
    if (hoursSince(b.installation.installedAt) > 24)
      out.push({ id: `mon-${b.id}`, role: 'O&M team', module: 'Monitoring', title: 'Site not reporting', detail: `${b.name} · no data since installation`, href: '/system-info', arrivedAt: b.installation.installedAt, dueDate: b.installation.installedAt.slice(0, 10), severity: 'medium', alertOnly: true })
  }
  for (const m of x.monitoring) {
    if (m.lastDataAt && hoursSince(m.lastDataAt) > 24)
      out.push({ id: `mon-${m.id}`, role: 'O&M team', module: 'Monitoring', title: 'Site not reporting', detail: `${x.bens.find((b) => b.id === m.id)?.name || m.id} · last data ${m.lastDataAt.slice(0, 16).replace('T', ' ')}`, href: '/system-info', arrivedAt: m.lastDataAt, dueDate: m.lastDataAt.slice(0, 10), severity: 'medium', alertOnly: true })
    if (m.simExpiry && daysBetween(asOf, m.simExpiry) <= 15)
      out.push({ id: `sim-${m.id}`, role: 'O&M team', module: 'Monitoring', title: 'SIM recharge due', detail: `Expires ${m.simExpiry}`, href: '/system-info', arrivedAt: addDays(m.simExpiry, -15), dueDate: m.simExpiry, severity: 'low', alertOnly: true })
  }

  // ---- contract: BG / insurance expiry 60 and 30 days ahead ----
  for (const c of x.contracts) {
    const check = (label: string, date: string) => {
      if (!date) return
      const left = daysBetween(asOf, date)
      if (left > 60) return
      out.push({
        id: `exp-${label}-${c.id}`,
        role: 'Project Head',
        module: 'Contract',
        title: `${label} ${left < 0 ? 'expired' : `expires in ${left} days`}: ${c.packageCode || c.contractName}`,
        detail: `Expiry ${date}${left <= 30 ? ' · renew now' : ' · 60-day notice'}`,
        href: `/contract-compliance/${c.id}`,
        arrivedAt: addDays(date, -60),
        dueDate: addDays(date, -30),
        severity: left <= 30 ? 'high' : 'medium',
        alertOnly: true,
      })
    }
    check('PBG', c.pbgExpiryDate)
    check('Insurance policy', c.insuranceExpiryDate)
  }

  return out
}

export function useWorkItems(): WorkItem[] {
  const lots = useCollection<Lot>('lots')
  const bens = useCollection<Beneficiary>('beneficiaries')
  const wos = useCollection<WorkOrder>('workOrders')
  const pos = useCollection<PurchaseOrder>('purchaseOrders')
  const dispatches = useCollection<Dispatch>('dispatches')
  const dockets = useCollection<Docket>('dockets')
  const payments = useCollection<PaymentFollowUp>('payments')
  const ipBills = useCollection<IpBill>('ipBills')
  const visits = useCollection<CmcVisit>('cmcVisits')
  const tickets = useCollection<ComplaintTicket>('tickets')
  const monitoring = useCollection<MonitoringRecord>('monitoring')
  const contracts = useContracts()
  const settings = useSettings()
  return useMemo(
    () => buildWorkItems({ lots, bens, wos, pos, dispatches, dockets, payments, ipBills, visits, tickets, monitoring, contracts, settings }),
    [lots, bens, wos, pos, dispatches, dockets, payments, ipBills, visits, tickets, monitoring, contracts, settings]
  )
}

/** Alerts = overdue work items + threshold alerts. Sorted most severe / oldest first. */
export function alertsFrom(items: WorkItem[], asOf = today()) {
  const rank = { high: 0, medium: 1, low: 2 }
  return items
    .filter((i) => i.alertOnly || bucketOf(i, asOf) === 'overdue')
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.dueDate.localeCompare(b.dueDate))
}
