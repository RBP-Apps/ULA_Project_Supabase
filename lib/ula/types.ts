// Data model for the CSPDCL ULA execution workflow.
// Beneficiary is the unit of record; Lot is the unit of time and billing.

export interface FileRef {
  id: string // key or storage path
  name: string
  size: number
  type: string
  uploadedAt: string // ISO
  url?: string // Supabase storage public URL
  lat?: number
  lng?: number
  capturedVia?: 'camera' | 'upload'
}

// ---------- Masters (Settings) ----------

export interface InstallationPartner {
  id: string
  name: string
  contactPerson: string
  mobile: string
  email: string
  districts: string[]
  ratePerKw: number // IP rate card, Rs per kW
  active: boolean
  createdAt: string
}

export interface Warehouse {
  id: string
  name: string
  kind: 'Central' | 'District'
  district: string
  address: string
}

export interface ItemMaster {
  code: string
  name: string
  unit: string
  category: 'Module' | 'Inverter' | 'Structure' | 'BOS' | 'Logger' | 'Other'
  serialised: boolean
}

export interface BomTemplate {
  id: string
  kw: number
  lines: { itemCode: string; qty: number }[]
}

export interface RateCard {
  kw: number
  rate: number // Rs excl. GST, per site
}

export interface SlaConfig {
  surveyDays: number // tender: 5 from allotment
  commissionDaysAfterReport: number // tender: 25 from feasibility report
  designTargetDay: number // D6
  materialReadyTargetDay: number // D7
  installEndTargetDay: number // D20
  qcHours: number // 24
  portalUploadWorkingDays: number // 2 (internal), 3 (Annex G)
  docketDays: number // 3 after lot commissioned
  cspdclInspectDays: number // Annex G: 5
  cspdclMeterDays: number // Annex G: 7
  cspdclCommissionDays: number // Annex G: 2
  ldPercentPerWeek: number // 1
  ldCapPercent: number // 10 of contract value
  workOrderAcceptHours: number // 24
  vehicleReceiveHours: number // 48
  paymentIdleDays: number // 7
  ticketCloseHours: number // 72
}

export interface Settings {
  rateCard: RateCard[]
  sla: SlaConfig
  districts: string[]
  circles: string[]
  divisions: string[]
  cmcSharePercent: number // 20
  minPrCommissioning: number // 75
  minCufCmc: number // 19
  // strict: field photos must be fresh camera captures with GPS; relaxed: allow office testing
  photoPolicy: 'strict' | 'relaxed'
}

// ---------- Lots & Beneficiaries ----------

export interface Lot {
  id: string
  lotNo: string
  contractId: string // package (Contract.id)
  allotmentLetterNo: string
  allotmentDate: string // D0 (YYYY-MM-DD)
  allotmentLetter?: FileRef
  district: string
  circle: string
  division: string
  listLocked: boolean
  lockedAt?: string
  feasibilityReportDate?: string // report sent to CSPDCL; 25-day clock starts
  feasibilityReportRef?: string
  materialReadyAt?: string
  materialReadyPartial?: boolean
  remarks: string
  createdAt: string
  createdBy: string
}

export type SurveyStatus = 'Pending' | 'Submitted' | 'Accepted' | 'Returned'
export type ApprovalStatus = 'Pending' | 'Submitted' | 'Approved' | 'Rejected'

export interface SurveyData {
  status: SurveyStatus
  surveyDate: string
  surveyor: string
  roofType: string
  usableArea: number
  shade: string
  orientation: string
  structureType: string
  existingRts: '' | 'No' | 'Yes'
  feasible: '' | 'Yes' | 'No'
  feasibilityRemarks: string
  consumerSigned: boolean
  photos: FileRef[]
  electricityBill?: FileRef
  signature?: FileRef
  submittedAt?: string
  acceptedAt?: string
  returnReason?: string
  // non-feasible sites go to CSPDCL review
  cspdclReview: '' | 'Pending' | 'Approved' | 'Rejected'
  cspdclReviewDate?: string
  cspdclReviewRemarks?: string
}

export interface DesignData {
  status: ApprovalStatus
  layout: string
  structureType: string
  designType: string // site-specific or standard design type
  tool: '' | 'PVsyst' | 'Helioscope' | 'Other'
  expectedYield: number // kWh/yr
  simulationReport?: FileRef
  submittedAt?: string
  approvedBy: string
  approvedAt?: string
  remarks: string
}

export interface InstallationData {
  status: 'Not Started' | 'In Progress' | 'Submitted'
  startedAt?: string
  installedAt?: string
  submittedAt?: string
  checklist: Record<string, boolean>
  moduleSerialsScanned: string[]
  inverterSerialScanned: string
  loggerId: string
  simNo: string
  loggerLive: boolean
  photos: Record<string, FileRef | undefined> // fixed photo list
  installReport?: FileRef
  consumerSigned: boolean
  prReading: number
  trainingDone: boolean
  omManualHanded: boolean
  remarks: string
}

export interface QcEvent {
  at: string
  result: 'Passed' | 'Rejected'
  by: string
  remarks: string
  physicalVisit: boolean
}

export interface QcData {
  status: 'Pending' | 'Passed' | 'Rejected'
  history: QcEvent[]
}

export interface PortalData {
  fields: Record<string, boolean> // portal field upload status
  uploadedAt?: string
  uploadedBy: string
  netMeterAppliedDate: string
  remarks: string
}

export interface CommissioningData {
  inspectionDate: string
  aeName: string
  jir?: FileRef
  jirSignedConsumer: boolean
  jirSignedAe: boolean
  jirSignedRbp: boolean
  meterInstalledDate: string
  certificate?: FileRef
  certificateSigned: boolean
  prAtCommissioning: number
  commissionedDate: string
  warrantyCertificate?: FileRef
  remarks: string
}

export interface Beneficiary {
  id: string
  lotId: string
  appNo: string // PM Surya Ghar application number (unique)
  name: string
  address: string
  mobile: string
  consumerNo: string
  sanctionedKw: number
  district: string
  division: string
  subDivision: string
  aeName: string
  workOrderId?: string
  ipId?: string
  // material
  moduleMake: string
  moduleWp: number
  almmModel: string
  moduleSerials: string[] // locked at dispatch
  inverterMake: string
  inverterSerial: string
  dispatchId?: string
  dispatchedAt?: string
  received?: { at: string; by: string; shortage: string; damage: string; photos: FileRef[] }
  survey: SurveyData
  design: DesignData
  installation: InstallationData
  qc: QcData
  portal: PortalData
  commissioning: CommissioningData
  createdAt: string
  updatedAt: string
}

// ---------- Work orders ----------

export interface WorkOrder {
  id: string
  woNo: string
  lotId: string
  ipId: string
  beneficiaryIds: string[]
  cluster: string
  issuedAt: string
  dueDate: string
  status: 'Issued' | 'Accepted' | 'Declined' | 'Closed'
  acceptedAt?: string
  remarks: string
}

// ---------- Purchase & stock ----------

export interface PurchaseOrder {
  id: string
  poNo: string
  lotId: string // '' = general stock
  vendor: string
  lines: { itemCode: string; qty: number; rate: number }[]
  raisedAt: string
  expectedDate: string
  status: 'Requested' | 'PO Raised' | 'Inspection Called' | 'Inspected' | 'Received' | 'Cancelled'
  inspection?: { calledAt: string; date: string; result: 'Cleared' | 'Failed' | ''; remarks: string }
  grn?: {
    grnNo: string
    date: string
    warehouseId: string
    received: { itemCode: string; qty: number }[]
    almmModel: string
    dcrCertificate?: FileRef
    cellInvoice?: FileRef
    remarks: string
  }
  remarks: string
}

export interface StockMove {
  id: string
  date: string
  itemCode: string
  warehouseId: string
  qty: number // + in, - out
  refType: 'GRN' | 'Dispatch' | 'Adjustment' | 'Opening'
  refId: string
  remarks: string
}

// ---------- Dispatch ----------

export interface Dispatch {
  id: string
  dispatchNo: string
  lotId: string
  ipId: string
  warehouseId: string
  cluster: string
  route: string
  beneficiaryIds: string[]
  plannedDate: string
  status: 'Planned' | 'Approved' | 'Dispatched' | 'Received'
  approvedBy?: string
  approvedAt?: string
  vehicleNo: string
  driverMobile: string
  challanNo: string
  invoiceNo: string
  ewayBillNo: string
  dispatchedAt?: string
  receivedAt?: string
  remarks: string
}

// ---------- Docket, payment ----------

export interface Docket {
  id: string
  lotId: string
  invoiceNo: string
  invoiceDate: string
  invoiceAmount: number // excl. GST
  gstPercent: number
  status: 'Draft' | 'Printed' | 'Submitted'
  copies: number
  submittedAt?: string
  inwardNo: string
  office: string
  remarks: string
}

export type PaymentSource = 'CFA (MNRE)' | 'SFA + District share (CSPDCL)'

export interface PaymentFollowUp {
  id: string
  lotId: string
  expected: { source: PaymentSource; amount: number }[]
  movements: { id: string; desk: string; date: string; remarks: string }[]
  queries: { id: string; raisedAt: string; query: string; reply: string; repliedAt?: string }[]
  receipts: {
    id: string
    date: string
    source: PaymentSource
    gross: number
    tds: number
    ld: number
    otherDeduction: number
    net: number
    utr: string
  }[]
  writeOff?: { amount: number; approvedBy: string; date: string; reason: string }
  closed: boolean
}

export interface IpBill {
  id: string
  billNo: string
  ipId: string
  beneficiaryIds: string[]
  billDate: string
  gross: number
  deductions: { id: string; reason: 'Rework' | 'Shortage' | 'Damage' | 'Other'; amount: number; note: string }[]
  status: 'Draft' | 'Submitted' | 'Approved' | 'Paid' | 'Rejected'
  submittedAt?: string
  approvedAt?: string
  approvedBy?: string
  paidAt?: string
  paymentRef: string
  remarks: string
}

// ---------- CMC & monitoring ----------

export interface CmcVisit {
  id: string
  beneficiaryId: string
  quarter: number // 1..20
  visitDate: string
  cleaning: boolean
  checks: Record<string, boolean>
  pr: number
  cuf: number
  photos: FileRef[]
  by: string
  remarks: string
}

export interface ComplaintTicket {
  id: string
  ticketNo: string
  beneficiaryId: string
  source: 'Consumer' | 'CSPDCL' | 'Monitoring'
  description: string
  openedAt: string
  status: 'Open' | 'In Progress' | 'Closed'
  closedAt?: string
  resolution: string
}

export interface CmcBill {
  id: string
  lotId: string
  quarter: number // 1..20
  amount: number
  billDate: string
  aeVerified: boolean
  status: 'Draft' | 'Submitted' | 'Paid'
  remarks: string
}

export interface MonitoringRecord {
  id: string // = beneficiaryId
  simExpiry: string
  lastDataAt: string
  firstDataAt: string
  generation: { month: string; kwh: number }[] // YYYY-MM
  todayKwh: number
}

export interface HandoverRecord {
  id: string // = beneficiaryId
  warrantyDeedDate: string
  deed?: FileRef
  remarks: string
}

// ---------- Users & roles ----------

export type UlaRole =
  | 'Director / Management'
  | 'Project Head'
  | 'Project Coordinator'
  | 'Survey team / IP surveyor'
  | 'Engineering'
  | 'Purchase / Stores'
  | 'Dispatch team'
  | 'IP (Installation Partner)'
  | 'QC team'
  | 'Portal / Sync team'
  | 'Liaison team (district)'
  | 'Billing / Accounts'
  | 'O&M team'

export interface RoleAssignment {
  id: string // user email (lowercase)
  name: string
  role: UlaRole
  ipId?: string
  active: boolean
  allowedPages?: string[]
}

export interface ActivityLog {
  id: string
  at: string
  by: string
  entity: string // e.g. 'Beneficiary'
  entityId: string
  action: string
}
