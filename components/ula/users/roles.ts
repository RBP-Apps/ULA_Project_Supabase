'use client'

import { useAuth } from '@/lib/auth-context'
import { getById, useCollection } from '@/lib/ula/storage'
import type { RoleAssignment, UlaRole } from '@/lib/ula/types'

export const ULA_ROLES: UlaRole[] = [
  'Director / Management',
  'Project Head',
  'Project Coordinator',
  'Survey team / IP surveyor',
  'Engineering',
  'Purchase / Stores',
  'Dispatch team',
  'IP (Installation Partner)',
  'QC team',
  'Portal / Sync team',
  'Liaison team (district)',
  'Billing / Accounts',
  'O&M team',
]

// Role matrix from the process-flow PDF ("Roles, dashboards and escalation").
export const ROLE_MATRIX: { role: UlaRole; sees: string; can: string; escalatesTo: string }[] = [
  { role: 'Director / Management', sees: 'Everything; package and lot dashboard; LD exposure; receivables', can: 'Approve write-offs, rate changes, IP onboarding', escalatesTo: 'None' },
  { role: 'Project Head', sees: 'All lots and stages', can: 'Approve dispatch plans; reassign IPs; request extension of time', escalatesTo: 'Director' },
  { role: 'Project Coordinator', sees: 'Lot register, beneficiary list', can: 'Create lots, import lists, issue IP work orders', escalatesTo: 'Project Head' },
  { role: 'Survey team / IP surveyor', sees: 'Assigned sites', can: 'Fill survey, upload pre-installation photos', escalatesTo: 'Project Coordinator' },
  { role: 'Engineering', sees: 'Surveyed sites', can: 'Upload design and simulation; mark approval', escalatesTo: 'Project Head' },
  { role: 'Purchase / Stores', sees: 'Lot BOMs, stock, POs', can: 'Raise PR and PO, record inspection and GRN, issue Material Ready', escalatesTo: 'Director' },
  { role: 'Dispatch team', sees: 'Material Ready lots and approved plans', can: 'Create DC, invoice, e-way bill; scan serials', escalatesTo: 'Project Head' },
  { role: 'IP (Installation Partner)', sees: 'Only its own work orders, through the mobile app', can: 'Acknowledge material, install, scan, photograph, collect signatures', escalatesTo: 'Project Coordinator' },
  { role: 'QC team', sees: 'Installed sites', can: 'Accept or reject with reason', escalatesTo: 'Project Head' },
  { role: 'Portal / Sync team', sees: 'QC-passed sites', can: 'Update portal fields and statuses', escalatesTo: 'Project Head' },
  { role: 'Liaison team (district)', sees: 'Sites awaiting inspection, meter, commissioning; dockets in transit', can: 'Record CSPDCL dates, JIR, certificates, file movement', escalatesTo: 'Project Head' },
  { role: 'Billing / Accounts', sees: 'Commissioned lots, payments, IP bills', can: 'Build docket, raise invoice, record receipts, approve IP bills', escalatesTo: 'Director' },
  { role: 'O&M team', sees: 'Commissioned sites', can: 'Log CMC visits, close complaints, upload PR and CUF', escalatesTo: 'Project Head' },
]

/** Role assignment for an email (stored in the 'roles' collection keyed by lowercase email). */
export function getRoleFor(email: string | undefined | null): RoleAssignment | undefined {
  if (!email) return undefined
  return getById<RoleAssignment>('roles', email.trim().toLowerCase())
}

/** Role assignment of the signed-in user, reactive to changes. Inactive assignments are returned as-is (check .active). */
export function useMyRole(): RoleAssignment | undefined {
  const { user } = useAuth()
  const roles = useCollection<RoleAssignment>('roles')
  const key = user?.email?.trim().toLowerCase()
  return key ? roles.find((r) => r.id === key) : undefined
}
