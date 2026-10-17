'use client'

// Business rules for the CSPDCL ULA lot workflow (RfS CSPDCL/NIT/ULA-114.23 + Corrigendum-1).
// Pure functions over stored records: pages derive every status, count and date from here.

import type {
  Beneficiary,
  Lot,
  Settings,
  SlaConfig,
  PurchaseOrder,
  Dispatch,
  InstallationData,
} from './types'
import type { Contract } from '../types'
import { readKey, writeKey, useKey } from './storage'

// ---------------- dates ----------------

export function today(): string {
  const d = new Date()
  return toYmd(d)
}

export function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s: string): Date | null {
  if (!s) return null
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s)
  return isNaN(d.getTime()) ? null : d
}

export function addDays(date: string, days: number): string {
  const d = parseYmd(date)
  if (!d) return ''
  d.setDate(d.getDate() + days)
  return toYmd(d)
}

/** Working days exclude Sundays (public holidays are not modelled). */
export function addWorkingDays(date: string, days: number): string {
  const d = parseYmd(date)
  if (!d) return ''
  let left = days
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0) left--
  }
  return toYmd(d)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = parseYmd(a.slice(0, 10))
  const db = parseYmd(b.slice(0, 10))
  if (!da || !db) return 0
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

export function workingDaysBetween(a: string, b: string): number {
  const da = parseYmd(a.slice(0, 10))
  const db = parseYmd(b.slice(0, 10))
  if (!da || !db || db <= da) return 0
  let n = 0
  const d = new Date(da)
  while (d < db) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0) n++
  }
  return n
}

export function hoursSince(iso: string): number {
  const d = parseYmd(iso)
  if (!d) return 0
  return (Date.now() - d.getTime()) / 3_600_000
}

export function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = parseYmd(s)
  if (!d) return s
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(s?: string): string {
  if (!s) return '—'
  const d = parseYmd(s)
  if (!d) return s
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtInr(n: number): string {
  if (!isFinite(n)) return '₹0'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function fmtInrShort(n: number): string {
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`
  return fmtInr(n)
}

export function nowIso() {
  return new Date().toISOString()
}

// ---------------- settings ----------------

export const DEFAULT_SLA: SlaConfig = {
  surveyDays: 5,
  commissionDaysAfterReport: 25,
  designTargetDay: 6,
  materialReadyTargetDay: 7,
  installEndTargetDay: 20,
  qcHours: 24,
  portalUploadWorkingDays: 2,
  docketDays: 3,
  cspdclInspectDays: 5,
  cspdclMeterDays: 7,
  cspdclCommissionDays: 2,
  ldPercentPerWeek: 1,
  ldCapPercent: 10,
  workOrderAcceptHours: 24,
  vehicleReceiveHours: 48,
  paymentIdleDays: 7,
  ticketCloseHours: 72,
}

// L1 rate card from the PDF (Rs per site, excl. GST). Editable in Settings.
export const DEFAULT_SETTINGS: Settings = {
  rateCard: [
    { kw: 1, rate: 50370 },
    { kw: 2, rate: 88670 },
  ],
  sla: DEFAULT_SLA,
  districts: [],
  circles: [],
  divisions: [],
  cmcSharePercent: 20,
  minPrCommissioning: 75,
  minCufCmc: 19,
  photoPolicy: 'strict',
}

function mergeSettings(s: Partial<Settings> | null): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(s || {}),
    sla: { ...DEFAULT_SLA, ...((s && s.sla) || {}) },
    rateCard: s?.rateCard?.length ? s.rateCard : DEFAULT_SETTINGS.rateCard,
  }
}

let mergedCache: { src: unknown; value: Settings } | null = null

export function getSettings(): Settings {
  const raw = readKey<Partial<Settings> | null>('settings', null)
  if (mergedCache && mergedCache.src === raw) return mergedCache.value
  const value = mergeSettings(raw)
  mergedCache = { src: raw, value }
  return value
}

export function saveSettings(s: Settings): boolean {
  return writeKey('settings', s)
}

export function useSettings(): Settings {
  const raw = useKey<Partial<Settings> | null>('settings', null)
  if (mergedCache && mergedCache.src === raw) return mergedCache.value
  const value = mergeSettings(raw)
  mergedCache = { src: raw, value }
  return value
}

// ---------------- rates & values ----------------

/** Site value excl. GST from the rate card; other sizes are prorated from the nearest slab. */
export function siteValue(kw: number, settings: Settings): number {
  if (!kw) return 0
  const exact = settings.rateCard.find((r) => r.kw === kw)
  if (exact) return exact.rate
  const sorted = [...settings.rateCard].sort((a, b) => Math.abs(a.kw - kw) - Math.abs(b.kw - kw))
  const near = sorted[0]
  return near ? Math.round((near.rate / near.kw) * kw) : 0
}

// ---------------- beneficiary factory ----------------

export const INSTALL_CHECKLIST = [
  'Structure erected and anchored',
  'Modules mounted',
  'Inverter installed',
  'ACDB installed',
  'DCDB installed',
  'Earthing done (3 pits)',
  'Lightning arrester (LA) installed',
  'Cabling and conduits complete',
  'Data logger installed',
  'Danger and caution signage fixed',
]

export const INSTALL_PHOTOS = [
  'Array (full view)',
  'Structure',
  'Inverter',
  'ACDB / DCDB',
  'Earthing',
  'Grid connection point',
  'Beneficiary with plant',
]

export const SURVEY_PHOTO_MIN = 3 // roof, available space, shade obstacles

export const PORTAL_FIELDS = [
  'Installation details',
  'Installation photos',
  'Module and inverter serials',
  'DCR certificate',
  'Electricity bill',
]

export const ROOF_TYPES = ['RCC flat', 'Sloped RCC', 'Tin / metal sheet', 'Asbestos', 'Tiled', 'Other']
export const STRUCTURE_TYPES = ['Standard elevated (GI)', 'Low-rise (RCC)', 'Sloped-roof mount', 'Custom']
export const ORIENTATIONS = ['South', 'South-East', 'South-West', 'East', 'West', 'Flat / tilt frame']
export const SHADE_LEVELS = ['No shade', 'Minor (< 10%)', 'Moderate (10–25%)', 'Heavy (> 25%)']

export function blankInstallation(): InstallationData {
  return {
    status: 'Not Started',
    checklist: {},
    moduleSerialsScanned: [],
    inverterSerialScanned: '',
    loggerId: '',
    simNo: '',
    loggerLive: false,
    photos: {},
    consumerSigned: false,
    prReading: 0,
    trainingDone: false,
    omManualHanded: false,
    remarks: '',
  }
}

export function blankBeneficiary(p: Partial<Beneficiary> & { id: string; lotId: string }): Beneficiary {
  const now = nowIso()
  return {
    appNo: '',
    name: '',
    address: '',
    mobile: '',
    consumerNo: '',
    sanctionedKw: 0,
    district: '',
    division: '',
    subDivision: '',
    aeName: '',
    moduleMake: '',
    moduleWp: 0,
    almmModel: '',
    moduleSerials: [],
    inverterMake: '',
    inverterSerial: '',
    survey: {
      status: 'Pending',
      surveyDate: '',
      surveyor: '',
      roofType: '',
      usableArea: 0,
      shade: '',
      orientation: '',
      structureType: '',
      existingRts: '',
      feasible: '',
      feasibilityRemarks: '',
      consumerSigned: false,
      photos: [],
      cspdclReview: '',
    },
    design: {
      status: 'Pending',
      layout: '',
      structureType: '',
      designType: '',
      tool: '',
      expectedYield: 0,
      approvedBy: '',
      remarks: '',
    },
    installation: blankInstallation(),
    qc: { status: 'Pending', history: [] },
    portal: { fields: {}, uploadedBy: '', netMeterAppliedDate: '', remarks: '' },
    commissioning: {
      inspectionDate: '',
      aeName: '',
      jirSignedConsumer: false,
      jirSignedAe: false,
      jirSignedRbp: false,
      meterInstalledDate: '',
      certificateSigned: false,
      prAtCommissioning: 0,
      commissionedDate: '',
      remarks: '',
    },
    createdAt: now,
    updatedAt: now,
    ...p,
  }
}

// ---------------- stages ----------------

export const STAGES = [
  'Survey',
  'CSPDCL Review',
  'Design',
  'Awaiting Dispatch',
  'In Transit',
  'Installation',
  'QC',
  'Portal Update',
  'Inspection',
  'Commissioning',
  'Commissioned',
  'Dropped',
] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_ROUTE: Record<Stage, string> = {
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
  Commissioned: '/invoicing',
  Dropped: '/survey',
}

export function isSurveyFeasibleCleared(b: Beneficiary) {
  if (b.survey.status !== 'Accepted') return false
  if (b.survey.feasible === 'Yes') return true
  return b.survey.cspdclReview === 'Approved'
}

export function jirComplete(b: Beneficiary) {
  const c = b.commissioning
  return !!(c.inspectionDate && c.jir && c.jirSignedConsumer && c.jirSignedAe && c.jirSignedRbp)
}

export function isCommissioned(b: Beneficiary, settings?: Settings) {
  const c = b.commissioning
  const minPr = settings?.minPrCommissioning ?? 75
  return !!(
    jirComplete(b) &&
    c.meterInstalledDate &&
    c.certificate &&
    c.certificateSigned &&
    c.commissionedDate &&
    c.prAtCommissioning >= minPr
  )
}

export function stageOf(b: Beneficiary): Stage {
  const s = b.survey
  if (s.cspdclReview === 'Rejected' || s.existingRts === 'Yes') {
    if (s.status === 'Accepted') return 'Dropped'
  }
  if (s.status !== 'Accepted') return 'Survey'
  if (s.feasible === 'No' && s.cspdclReview !== 'Approved') return 'CSPDCL Review'
  if (b.design.status !== 'Approved') return 'Design'
  if (!b.dispatchedAt) return 'Awaiting Dispatch'
  if (!b.received) return 'In Transit'
  if (b.installation.status !== 'Submitted') return 'Installation'
  if (b.qc.status !== 'Passed') return 'QC'
  if (!b.portal.uploadedAt) return 'Portal Update'
  if (!jirComplete(b)) return 'Inspection'
  if (!isCommissioned(b)) return 'Commissioning'
  return 'Commissioned'
}

export const STAGE_TONE: Record<Stage, string> = {
  Survey: 'Pending',
  'CSPDCL Review': 'Under Review',
  Design: 'In Progress',
  'Awaiting Dispatch': 'Pending',
  'In Transit': 'In Progress',
  Installation: 'In Progress',
  QC: 'Under Review',
  'Portal Update': 'Submitted',
  Inspection: 'Scheduled',
  Commissioning: 'Scheduled',
  Commissioned: 'Completed',
  Dropped: 'Rejected',
}

// ---------------- gates (return list of missing items; empty = gate open) ----------------

export function surveyGate(b: Beneficiary): string[] {
  const s = b.survey
  const m: string[] = []
  if (!s.surveyDate) m.push('Survey date')
  if (!s.roofType) m.push('Roof type')
  if (!s.usableArea) m.push('Usable roof area')
  if (!s.shade) m.push('Shade assessment')
  if (!s.orientation) m.push('Orientation')
  if (!s.structureType) m.push('Structure type')
  if (!s.existingRts) m.push('Existing rooftop solar declaration')
  if (!s.feasible) m.push('Feasibility decision')
  if (s.feasible === 'No' && !s.feasibilityRemarks.trim()) m.push('Reason for non-feasibility')
  if (!s.electricityBill) m.push('Latest electricity bill')
  if (s.photos.length < SURVEY_PHOTO_MIN) m.push(`At least ${SURVEY_PHOTO_MIN} geotagged pre-installation photos`)
  if (!s.consumerSigned || !s.signature) m.push('Consumer signature')
  return m
}

export function designGate(b: Beneficiary): string[] {
  const d = b.design
  const m: string[] = []
  if (!d.layout.trim()) m.push('Layout description')
  if (!d.structureType) m.push('Structure type')
  if (!d.tool) m.push('Simulation tool')
  if (!d.simulationReport) m.push('Simulation report upload')
  return m
}

export function installationGate(b: Beneficiary, settings?: Settings): string[] {
  const i = b.installation
  const m: string[] = []
  INSTALL_CHECKLIST.forEach((c) => {
    if (!i.checklist[c]) m.push(c)
  })
  const missingSerials = b.moduleSerials.filter((s) => !i.moduleSerialsScanned.includes(s))
  if (!b.moduleSerials.length) m.push('Module serials not dispatched against this beneficiary')
  else if (missingSerials.length) m.push(`${missingSerials.length} module serial(s) not re-scanned`)
  const foreign = i.moduleSerialsScanned.filter((s) => s && !b.moduleSerials.includes(s))
  if (foreign.length) m.push(`${foreign.length} scanned serial(s) were not dispatched to this site`)
  if (!b.inverterSerial || i.inverterSerialScanned !== b.inverterSerial) m.push('Inverter serial re-scan')
  if (!i.loggerId.trim()) m.push('Data logger ID')
  if (!i.simNo.trim()) m.push('SIM number')
  if (!i.loggerLive) m.push('Data logger live confirmation')
  INSTALL_PHOTOS.forEach((p) => {
    if (!i.photos[p]) m.push(`Photo: ${p}`)
  })
  if (!i.installReport) m.push('Installation report (signed)')
  if (!i.consumerSigned) m.push('Consumer signature on installation report')
  if (!(i.prReading > 0)) m.push('PR reading')
  if (!i.trainingDone) m.push('Consumer training')
  if (!i.omManualHanded) m.push('O&M manual and warranty card handed over')
  if (!i.installedAt) m.push('Installation date')
  void settings
  return m
}

export function portalGate(b: Beneficiary): string[] {
  const m: string[] = []
  PORTAL_FIELDS.forEach((f) => {
    if (!b.portal.fields[f]) m.push(f)
  })
  if (!b.portal.netMeterAppliedDate) m.push('Net-meter application date')
  return m
}

export function jirGate(b: Beneficiary): string[] {
  const c = b.commissioning
  const m: string[] = []
  if (!c.inspectionDate) m.push('CSPDCL inspection date')
  if (!c.aeName.trim()) m.push('AE name')
  if (!c.jir) m.push('JIR scan')
  if (!c.jirSignedConsumer) m.push('JIR signed by consumer')
  if (!c.jirSignedAe) m.push('JIR signed by AE')
  if (!c.jirSignedRbp) m.push('JIR signed by RBP')
  return m
}

export function commissioningGate(b: Beneficiary, settings: Settings): string[] {
  const c = b.commissioning
  const m: string[] = []
  if (!jirComplete(b)) m.push('JIR not complete')
  if (!c.meterInstalledDate) m.push('Net-meter installation date')
  if (!c.certificate) m.push('Commissioning certificate (portal-generated)')
  if (!c.certificateSigned) m.push('Certificate signed by CSPDCL official')
  if (!(c.prAtCommissioning >= settings.minPrCommissioning))
    m.push(`PR at commissioning ≥ ${settings.minPrCommissioning}%`)
  if (!c.commissionedDate) m.push('Commissioning date')
  return m
}

// ---------------- 22-item completeness (needed before the lot can be billed) ----------------

export interface ChecklistItem {
  key: string
  label: string
  stage: string
  done: boolean
}

export interface CompletenessCtx {
  lotPos?: PurchaseOrder[] // received POs of this lot (for DCR certificate)
  dispatch?: Dispatch
}

export function completeness(b: Beneficiary, ctx: CompletenessCtx = {}, settings?: Settings): ChecklistItem[] {
  const s = b.survey
  const i = b.installation
  const c = b.commissioning
  const dcr = (ctx.lotPos || []).some((p) => p.grn?.dcrCertificate)
  return [
    { key: 'identity', label: 'Name, address, mobile, consumer no., application no., kW', stage: 'Lot allotment', done: !!(b.name && b.address && b.mobile && b.consumerNo && b.appNo && b.sanctionedKw) },
    { key: 'admin', label: 'District, division, sub-division, AE name', stage: 'Lot allotment', done: !!(b.district && b.division && b.subDivision && b.aeName) },
    { key: 'bill', label: 'Latest electricity bill', stage: 'Survey', done: !!s.electricityBill },
    { key: 'rts', label: 'No existing rooftop solar (declaration)', stage: 'Survey', done: s.existingRts === 'No' },
    { key: 'roof', label: 'Roof type, area, shade, orientation, structure', stage: 'Survey', done: !!(s.roofType && s.usableArea && s.shade && s.orientation && s.structureType) },
    { key: 'prephotos', label: 'Pre-installation geotagged photos', stage: 'Survey', done: s.photos.length >= SURVEY_PHOTO_MIN },
    { key: 'surveysign', label: 'Consumer signature on survey', stage: 'Survey', done: s.consumerSigned && !!s.signature },
    { key: 'simulation', label: 'Simulation report and approval', stage: 'Design', done: !!b.design.simulationReport && b.design.status === 'Approved' },
    { key: 'modules', label: 'Module serials, make, Wp, ALMM model', stage: 'Dispatch', done: b.moduleSerials.length > 0 && !!(b.moduleMake && b.moduleWp && b.almmModel) },
    { key: 'inverter', label: 'Inverter serial and make', stage: 'Dispatch', done: !!(b.inverterSerial && b.inverterMake) },
    { key: 'dcr', label: 'DCR certificate (module supplier PO, cell GST invoice)', stage: 'GRN', done: dcr },
    { key: 'challan', label: 'Delivery challan and tax invoice reference', stage: 'Dispatch', done: !!(ctx.dispatch?.challanNo && ctx.dispatch?.invoiceNo) },
    { key: 'logger', label: 'Data logger ID and SIM number', stage: 'Installation', done: !!(i.loggerId && i.simNo) },
    { key: 'postphotos', label: 'Post-installation geotagged photos (fixed list)', stage: 'Installation', done: INSTALL_PHOTOS.every((p) => i.photos[p]) },
    { key: 'installreport', label: 'Installation report signed by consumer and RBP', stage: 'Installation', done: !!i.installReport && i.consumerSigned },
    { key: 'training', label: 'Training done, O&M manual and warranty card handed over', stage: 'Installation', done: i.trainingDone && i.omManualHanded },
    { key: 'qc', label: 'QC result: passed', stage: 'QC', done: b.qc.status === 'Passed' },
    { key: 'portal', label: 'Portal upload and net-meter application dates', stage: 'Portal sync', done: !!(b.portal.uploadedAt && b.portal.netMeterAppliedDate) },
    { key: 'jir', label: 'JIR signed by consumer, AE and RBP', stage: 'Inspection', done: jirComplete(b) },
    { key: 'meter', label: 'Net-meter installation date', stage: 'Inspection', done: !!c.meterInstalledDate },
    { key: 'certificate', label: 'Commissioning certificate (signed) and PR reading', stage: 'Commissioning', done: isCommissioned(b, settings) },
    { key: 'warranty', label: 'Warranty certificate and Annex I DCR undertaking', stage: 'Docket', done: !!c.warrantyCertificate && dcr && b.moduleSerials.length > 0 },
  ]
}

export function completenessPct(items: ChecklistItem[]) {
  return items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0
}

// ---------------- lot clock, value and LD ----------------

export interface LotSummary {
  lot: Lot
  sites: number
  activeSites: number // excluding dropped
  kw: number
  value: number
  commissioned: number
  commissionedValue: number
  unfinishedValue: number
  d5: string
  dueDate: string
  daysLeft: number
  surveyPending: number
  stageCounts: Record<Stage, number>
  overdue: boolean
  ldWeeks: number
  ldAmount: number
  allCommissioned: boolean
  status: 'Allotted' | 'In Execution' | 'Overdue' | 'Commissioned'
}

/** Due date for the lot: feasibility report date + 25 days; before the report, D0 + 5 + 25. */
export function lotDueDate(lot: Lot, sla: SlaConfig) {
  if (lot.feasibilityReportDate) return addDays(lot.feasibilityReportDate, sla.commissionDaysAfterReport)
  return addDays(lot.allotmentDate, sla.surveyDays + sla.commissionDaysAfterReport)
}

/** Per-site due date: reviewed (non-feasible then approved) sites run 25 days from CSPDCL approval. */
export function siteDueDate(b: Beneficiary, lot: Lot, sla: SlaConfig) {
  if (b.survey.feasible === 'No' && b.survey.cspdclReview === 'Approved' && b.survey.cspdclReviewDate)
    return addDays(b.survey.cspdclReviewDate, sla.commissionDaysAfterReport)
  return lotDueDate(lot, sla)
}

export function summarizeLot(lot: Lot, all: Beneficiary[], settings: Settings, asOf = today()): LotSummary {
  const list = all.filter((b) => b.lotId === lot.id)
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>
  let kw = 0
  let value = 0
  let commissioned = 0
  let commissionedValue = 0
  let surveyPending = 0
  list.forEach((b) => {
    const st = stageOf(b)
    stageCounts[st]++
    if (st === 'Dropped') return
    kw += b.sanctionedKw || 0
    const v = siteValue(b.sanctionedKw, settings)
    value += v
    if (st === 'Commissioned') {
      commissioned++
      commissionedValue += v
    }
    if (st === 'Survey') surveyPending++
  })
  const activeSites = list.length - stageCounts.Dropped
  const sla = settings.sla
  const d5 = addDays(lot.allotmentDate, sla.surveyDays)
  const dueDate = lotDueDate(lot, sla)
  const daysLeft = daysBetween(asOf, dueDate)
  const allCommissioned = activeSites > 0 && commissioned === activeSites
  const unfinishedValue = value - commissionedValue
  const overdue = !allCommissioned && daysLeft < 0
  // LD: 1% of the value still unfinished, for every week (part week = a week) past the due date.
  // Computed per site so that LD already accrued stays when a late site is later commissioned.
  let ldAmount = 0
  let ldWeeks = 0
  list.forEach((b) => {
    if (stageOf(b) === 'Dropped') return
    const due = siteDueDate(b, lot, sla)
    const end = isCommissioned(b, settings) ? b.commissioning.commissionedDate : asOf
    const late = daysBetween(due, end)
    if (late <= 0) return
    const weeks = Math.ceil(late / 7)
    ldWeeks = Math.max(ldWeeks, weeks)
    ldAmount += (siteValue(b.sanctionedKw, settings) * sla.ldPercentPerWeek * weeks) / 100
  })
  const status: LotSummary['status'] = allCommissioned
    ? 'Commissioned'
    : overdue
      ? 'Overdue'
      : list.length && stageCounts.Survey < list.length
        ? 'In Execution'
        : 'Allotted'
  return {
    lot,
    sites: list.length,
    activeSites,
    kw,
    value,
    commissioned,
    commissionedValue,
    unfinishedValue,
    d5,
    dueDate,
    daysLeft,
    surveyPending,
    stageCounts,
    overdue,
    ldWeeks,
    ldAmount,
    allCommissioned,
    status,
  }
}

/** Total LD for a package, capped at ldCapPercent of contract value. */
export function packageLd(contract: Contract | undefined, lots: LotSummary[], sla: SlaConfig) {
  const raw = lots.reduce((s, l) => s + l.ldAmount, 0)
  const cap = contract ? (contract.contractValue * sla.ldCapPercent) / 100 : Infinity
  return { raw, cap, applied: Math.min(raw, cap) }
}

/**
 * LD catch-up tracker (Sec-4 cl. 8.1): LD on a delayed lot is refundable if that lot is completed
 * and the next lot of the same package also finishes on time, up to 30.04.2027.
 * "Completed on" = latest commissioning date of the lot's active sites.
 */
export const LD_REFUND_DEADLINE = '2027-04-30'

export interface LdRefundRow {
  lot: LotSummary
  completedOn: string
  nextLot?: LotSummary
  nextCompletedOn: string
  status: 'Refund eligible' | 'Awaiting next lot' | 'Not eligible' | 'Lot still open'
  reason: string
}

export function lotCompletedOn(s: LotSummary, all: Beneficiary[], settings?: Settings) {
  if (!s.allCommissioned) return ''
  return all
    .filter((b) => b.lotId === s.lot.id && isCommissioned(b, settings))
    .map((b) => b.commissioning.commissionedDate)
    .sort()
    .pop() || ''
}

export function ldRefundTracker(summaries: LotSummary[], all: Beneficiary[], settings: Settings): LdRefundRow[] {
  const rows: LdRefundRow[] = []
  // a lot was "delayed" if it is still past due or it completed after its due date
  for (const s of summaries) {
    const completedOn = lotCompletedOn(s, all, settings)
    const delayed = s.overdue || (completedOn && completedOn > s.dueDate)
    if (!delayed) continue
    const next = summaries
      .filter((x) => x.lot.contractId === s.lot.contractId && x.lot.id !== s.lot.id && x.lot.allotmentDate > s.lot.allotmentDate)
      .sort((a, b) => a.lot.allotmentDate.localeCompare(b.lot.allotmentDate))[0]
    const nextCompletedOn = next ? lotCompletedOn(next, all, settings) : ''
    let status: LdRefundRow['status']
    let reason: string
    if (!completedOn) {
      status = 'Lot still open'
      reason = 'Delayed lot not yet fully commissioned'
    } else if (!next) {
      status = 'Awaiting next lot'
      reason = 'No later lot allotted in this package yet'
    } else if (!nextCompletedOn) {
      status = next.overdue ? 'Not eligible' : 'Awaiting next lot'
      reason = next.overdue ? `Next lot ${next.lot.lotNo} is past its due date` : `Next lot ${next.lot.lotNo} due ${next.dueDate}`
    } else if (nextCompletedOn <= next.dueDate && nextCompletedOn <= LD_REFUND_DEADLINE) {
      status = 'Refund eligible'
      reason = `Next lot ${next.lot.lotNo} finished on time (${nextCompletedOn})`
    } else {
      status = 'Not eligible'
      reason = `Next lot ${next.lot.lotNo} finished late (${nextCompletedOn})`
    }
    rows.push({ lot: s, completedOn, nextLot: next, nextCompletedOn, status, reason })
  }
  return rows
}

// ---------------- Annex G timers (CSPDCL side) ----------------

export interface AnnexStep {
  step: string
  start: string
  end: string
  allowedWorkingDays: number
  usedWorkingDays: number
  overBy: number
  side: 'RBP' | 'CSPDCL'
}

export function annexGSteps(b: Beneficiary, sla: SlaConfig, asOf = today()): AnnexStep[] {
  const out: AnnexStep[] = []
  const inst = b.installation.installedAt?.slice(0, 10)
  const upload = b.portal.uploadedAt?.slice(0, 10)
  const insp = b.commissioning.inspectionDate
  const meter = b.commissioning.meterInstalledDate
  const comm = b.commissioning.commissionedDate
  const mk = (step: string, start: string | undefined, end: string | undefined, allowed: number, side: 'RBP' | 'CSPDCL') => {
    if (!start) return
    const used = workingDaysBetween(start, end || asOf)
    out.push({ step, start, end: end || '', allowedWorkingDays: allowed, usedWorkingDays: used, overBy: Math.max(0, used - allowed), side })
  }
  mk('Portal upload after installation', inst, upload, 3, 'RBP')
  mk('CSPDCL inspection after upload', upload, insp, sla.cspdclInspectDays, 'CSPDCL')
  mk('Net-meter installation after inspection', insp, meter, sla.cspdclMeterDays, 'CSPDCL')
  mk('Commissioning after metering', meter, comm, sla.cspdclCommissionDays, 'CSPDCL')
  return out
}

// ---------------- misc helpers ----------------

export function lotLabel(lot?: Lot) {
  return lot ? `${lot.lotNo}${lot.district ? ` · ${lot.district}` : ''}` : '—'
}

export function sum(nums: number[]) {
  return nums.reduce((a, b) => a + (Number(b) || 0), 0)
}

/** CSV download built entirely in the browser. */
export function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined || v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Parse CSV or tab-separated text (Excel copy-paste) into rows. Handles quoted fields. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/)[0] || ''
  const delim = firstLine.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQ) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else inQ = false
      } else field += ch
    } else if (ch === '"') inQ = true
    else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows.map((r) => r.map((c) => c.trim()))
}
