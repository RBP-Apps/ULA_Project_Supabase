import { Contract, ComplianceMilestone } from './types'
import { saveContract, deleteContract, fetchContracts } from './supabase/repository'

// Forward declaration / lazy notify
function notifyStorageChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'))
  }
}

export function addDays(date: string, days: number): string {
  if (!date) return ''
  try {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export const blankContract: Contract = {
  id: '',
  contractName: '',
  packageCode: '',
  entity: 'RBP',
  contractValue: 0,
  kwp: 0,
  packageName: '',
  circle: '',
  division: '',
  loaNumber: '',
  loaDate: '',
  loaAcceptanceDate: '',
  loaAcceptanceStatus: 'Pending',
  loaDocument: '',
  pbgNumber: '',
  pbgAmount: 0,
  pbgIssueDate: '',
  pbgExpiryDate: '',
  pbgStatus: 'Pending',
  pbgDocument: '',
  agreementNumber: '',
  agreementDate: '',
  agreementStatus: 'Pending',
  signedDate: '',
  agreementDocument: '',
  gtpStatus: 'Not Submitted',
  gtpSubmittedDate: '',
  gtpApprovedDate: '',
  gtpApprovedBy: '',
  gtpRemarks: '',
  gtpDocument: '',
  drawingStatus: 'Not Submitted',
  drawingSubmittedDate: '',
  drawingApprovedDate: '',
  drawingApprovedBy: '',
  drawingRemarks: '',
  drawingDocument: '',
  insurancePolicyNumber: '',
  insuranceProvider: '',
  insuranceStartDate: '',
  insuranceExpiryDate: '',
  insuranceStatus: 'Pending',
  insuranceDocument: '',
  inspectionReference: '',
  inspectionDate: '',
  inspectionDueDate: '',
  inspectionStatus: 'Pending',
  inspectionRemarks: '',
  overallStatus: 'Not Started',
  createdAt: '',
  updatedAt: '',
}

export const initialContracts: Contract[] = []

export const STORAGE_KEY_CONTRACTS = 'surya-setu-contracts'
export const DUMMY_CONTRACT_IDS = ['CTR-001', 'CTR-002', 'CTR-003']

export function getStoredContracts(): Contract[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONTRACTS)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      // Purge any legacy dummy records from user's localStorage
      const cleaned = parsed.filter((c: Contract) => !DUMMY_CONTRACT_IDS.includes(c.id))
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY_CONTRACTS, JSON.stringify(cleaned))
      }
      return cleaned
    }
    return []
  } catch {
    return []
  }
}

export function clearAllContracts(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_CONTRACTS)
    } catch (e) {
      console.error('Error clearing contracts from localStorage', e)
    }
  }
}

export function saveStoredContract(contract: Contract): Contract[] {
  const current = getStoredContracts()
  const exists = current.some((c) => c.id === contract.id)
  const updated = exists
    ? current.map((c) => (c.id === contract.id ? contract : c))
    : [contract, ...current]

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_CONTRACTS, JSON.stringify(updated))
    } catch (e) {
      console.error('Error saving contract to localStorage', e)
    }
  }

  // Persist to Supabase PostgreSQL database
  saveContract(contract)
    .then(() => notifyStorageChange())
    .catch((err) => console.error('Error saving contract to Supabase:', err))

  return updated
}

export function deleteStoredContract(id: string): Contract[] {
  const current = getStoredContracts()
  const updated = current.filter((c) => c.id !== id)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_CONTRACTS, JSON.stringify(updated))
    } catch (e) {
      console.error('Error deleting contract from localStorage', e)
    }
  }

  // Delete from Supabase PostgreSQL database
  deleteContract(id)
    .then(() => notifyStorageChange())
    .catch((err) => console.error('Error deleting contract from Supabase:', err))

  return updated
}

// Initial background sync with Supabase PostgreSQL
if (typeof window !== 'undefined') {
  fetchContracts()
    .then((dbContracts) => {
      if (Array.isArray(dbContracts)) {
        localStorage.setItem(STORAGE_KEY_CONTRACTS, JSON.stringify(dbContracts))
        notifyStorageChange()
      }
    })
    .catch((e) => console.warn('Supabase contract initial fetch warning:', e))
}

export function complianceItems(c: Contract): ComplianceMilestone[] {
  return [
    {
      label: 'LOA Accepted',
      done: c.loaAcceptanceStatus === 'Accepted',
      due: addDays(c.loaDate, 3),
      date: c.loaAcceptanceDate,
      doc: c.loaDocument,
      responsible: 'Contractor',
    },
    {
      label: 'PBG Submitted (10%)',
      done: c.pbgStatus === 'Submitted' || c.pbgStatus === 'Approved',
      due: addDays(c.loaDate, 10), // PBG within 10 days of LOA
      date: c.pbgIssueDate,
      doc: c.pbgDocument,
      responsible: 'Finance Cell',
    },
    {
      label: 'Agreement Executed',
      done: c.agreementStatus === 'Signed',
      due: addDays(c.loaDate, 21),
      date: c.signedDate,
      doc: c.agreementDocument,
      responsible: 'CSPDCL Legal',
    },
    {
      label: 'GTP Approved',
      done: c.gtpStatus === 'Approved',
      due: addDays(c.loaDate, 10),
      date: c.gtpApprovedDate,
      doc: c.gtpDocument,
      responsible: 'CSPDCL Technical Cell',
    },
    {
      label: 'Engineering Drawings Approved',
      done: c.drawingStatus === 'Approved',
      due: addDays(c.loaDate, 14),
      date: c.drawingApprovedDate,
      doc: c.drawingDocument,
      responsible: 'SE Projects',
    },
    {
      label: 'Comprehensive Insurance Active',
      done: c.insuranceStatus === 'Active',
      due: addDays(c.loaDate, 15),
      date: c.insuranceStartDate,
      doc: c.insuranceDocument,
      responsible: 'Insurance Partner',
    },
    {
      label: 'Inspection Call Submitted',
      done: c.inspectionStatus === 'Completed' || c.inspectionStatus === 'Scheduled',
      due: c.inspectionDueDate || addDays(c.loaDate, 21),
      date: c.inspectionDate,
      responsible: 'Quality Inspector',
    },
  ]
}
