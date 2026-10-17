import { LucideIcon } from 'lucide-react'

export type Status =
  | 'Pending'
  | 'Accepted'
  | 'Submitted'
  | 'Signed'
  | 'Approved'
  | 'Not Submitted'
  | 'Under Review'
  | 'Rejected'
  | 'Revision Required'
  | 'Active'
  | 'Expired'
  | 'Completed'
  | 'Scheduled'
  | 'Overdue'
  | 'Compliant'
  | 'At Risk'
  | 'In Progress'
  | 'Not Started'

export interface User {
  id: string
  name: string
  email: string
  role: string
  entity: string
  mobile?: string
  avatar?: string
}

export interface Contract {
  id: string
  contractName: string
  packageCode: string
  entity: string
  contractValue: number
  kwp: number
  packageName: string
  circle: string
  division: string
  // LOA
  loaNumber: string
  loaDate: string
  loaAcceptanceDate: string
  loaAcceptanceStatus: Status
  loaDocument: string
  // PBG
  pbgNumber: string
  pbgAmount: number
  pbgIssueDate: string
  pbgExpiryDate: string
  pbgStatus: Status
  pbgDocument?: string
  // Agreement
  agreementNumber: string
  agreementDate: string
  agreementStatus: Status
  signedDate: string
  agreementDocument?: string
  // GTP
  gtpStatus: Status
  gtpSubmittedDate: string
  gtpApprovedDate: string
  gtpApprovedBy: string
  gtpRemarks: string
  gtpDocument: string
  // Drawings
  drawingStatus: Status
  drawingSubmittedDate: string
  drawingApprovedDate: string
  drawingApprovedBy: string
  drawingRemarks: string
  drawingDocument: string
  // Insurance
  insurancePolicyNumber: string
  insuranceProvider: string
  insuranceStartDate: string
  insuranceExpiryDate: string
  insuranceStatus: Status
  insuranceDocument: string
  // Inspection
  inspectionReference: string
  inspectionDate: string
  inspectionDueDate: string
  inspectionStatus: Status
  inspectionRemarks: string
  // Meta
  overallStatus: Status
  createdAt: string
  updatedAt: string
}

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  group: string
  badge?: string
}

export interface ComplianceMilestone {
  label: string
  done: boolean
  due: string
  date: string
  doc?: string
  responsible?: string
}
