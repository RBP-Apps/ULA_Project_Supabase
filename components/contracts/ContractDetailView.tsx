'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Pencil,
  FileCheck2,
  Calendar,
  Building,
  CheckCircle2,
  Clock3,
  FileText,
  Shield,
  Layers,
  ExternalLink,
} from 'lucide-react'
import { Contract } from '@/lib/types'
import { complianceItems, addDays } from '@/lib/contracts-store'
import { StatusPill } from './StatusPill'
import { ContractFormModal } from './ContractFormModal'

interface ContractDetailViewProps {
  contract: Contract
  onUpdate: (updated: Contract) => void
}

export function ContractDetailView({ contract, onUpdate }: ContractDetailViewProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('Overview')
  const [isEditOpen, setIsEditOpen] = useState(false)

  const items = complianceItems(contract)
  const doneCount = items.filter((i) => i.done).length
  const pct = Math.round((doneCount / items.length) * 100)

  const tabs = [
    'Overview',
    'LOA',
    'PBG',
    'Agreement',
    'GTP',
    'Drawings',
    'Insurance',
    'Inspection Call',
    'Compliance',
  ]

  const getFieldsForTab = (tab: string): [string, string | number][] => {
    switch (tab) {
      case 'LOA':
        return [
          ['LOA Number', contract.loaNumber || '—'],
          ['LOA Date', contract.loaDate || '—'],
          ['Acceptance Due Date', addDays(contract.loaDate, 3) || '—'],
          ['LOA Acceptance Date', contract.loaAcceptanceDate || '—'],
          ['Acceptance Status', contract.loaAcceptanceStatus],
          ['Document File', contract.loaDocument || 'No document uploaded'],
        ]
      case 'PBG':
        return [
          ['PBG Number', contract.pbgNumber || '—'],
          ['PBG Amount (10%)', `₹${contract.pbgAmount.toLocaleString('en-IN')}`],
          ['Issue Date', contract.pbgIssueDate || '—'],
          ['Expiry Date', contract.pbgExpiryDate || '—'],
          ['PBG Status', contract.pbgStatus],
          ['PBG Document', contract.pbgDocument || 'No guarantee document'],
        ]
      case 'Agreement':
        return [
          ['Agreement Number', contract.agreementNumber || '—'],
          ['Agreement Date', contract.agreementDate || '—'],
          ['Signed Date', contract.signedDate || '—'],
          ['Agreement Status', contract.agreementStatus],
          ['Executed Copy', contract.agreementDocument || 'Not uploaded'],
        ]
      case 'GTP':
        return [
          ['GTP Status', contract.gtpStatus],
          ['Submission Date', contract.gtpSubmittedDate || '—'],
          ['Approval Date', contract.gtpApprovedDate || '—'],
          ['Approving Authority', contract.gtpApprovedBy || 'CSPDCL Technical Cell'],
          ['Remarks', contract.gtpRemarks || 'No remarks recorded'],
          ['Approved GTP Document', contract.gtpDocument || '—'],
        ]
      case 'Drawings':
        return [
          ['Drawings Status', contract.drawingStatus],
          ['Submission Date', contract.drawingSubmittedDate || '—'],
          ['Approval Date', contract.drawingApprovedDate || '—'],
          ['Approved By', contract.drawingApprovedBy || 'SE (Projects) CSPDCL'],
          ['Remarks', contract.drawingRemarks || '—'],
          ['Drawings File', contract.drawingDocument || '—'],
        ]
      case 'Insurance':
        return [
          ['Insurance Provider', contract.insuranceProvider || '—'],
          ['Policy Number', contract.insurancePolicyNumber || '—'],
          ['Effective Start Date', contract.insuranceStartDate || '—'],
          ['Policy Expiry Date', contract.insuranceExpiryDate || '—'],
          ['Policy Status', contract.insuranceStatus],
          ['Insurance Policy Doc', contract.insuranceDocument || '—'],
        ]
      case 'Inspection Call':
        return [
          ['Inspection Reference', contract.inspectionReference || '—'],
          ['Inspection Due Date', contract.inspectionDueDate || addDays(contract.loaDate, 21) || '—'],
          ['Inspection Conducted Date', contract.inspectionDate || '—'],
          ['Inspection Status', contract.inspectionStatus],
          ['Inspection Remarks', contract.inspectionRemarks || '—'],
        ]
      default:
        return [
          ['Contract ID', contract.id],
          ['Contract / Package Name', contract.contractName],
          ['Package Code', contract.packageCode],
          ['Executing Entity', contract.entity],
          ['Total Contract Value', `₹${contract.contractValue.toLocaleString('en-IN')}`],
          ['Allocated Capacity', `${contract.kwp} kWp`],
          ['Circle / Division', `${contract.circle || '—'} / ${contract.division || '—'}`],
          ['LOA Number', contract.loaNumber || '—'],
          ['Overall Status', contract.overallStatus],
          ['Created On', contract.createdAt || '—'],
          ['Last Updated', contract.updatedAt || '—'],
        ]
    }
  }

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="page-heading">
        <div>
          <Link href="/contract-compliance" className="back-link">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Contracts</span>
          </Link>
          <h1 className="mt-2">{contract.contractName}</h1>
          <p>
            {contract.packageName || 'ULA rooftop solar package'} · {contract.entity} · Ref:{' '}
            {contract.packageCode}
          </p>
        </div>

        <div className="heading-actions">
          <StatusPill value={contract.overallStatus} />
          <button
            type="button"
            className="primary-btn"
            onClick={() => setIsEditOpen(true)}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit Contract</span>
          </button>
        </div>
      </div>

      {/* Hero Progress Card */}
      <section className="detail-hero card">
        <div className="detail-hero-top">
          <div>
            <span className="eyebrow">Milestone Clearance</span>
            <strong className="detail-percent">{pct}%</strong>
          </div>
          <span className="detail-milestone-count">
            {doneCount} of {items.length} requirements verified
          </span>
        </div>
        <div className="progress-track large">
          <span
            className={`progress-fill ${pct === 100 ? 'good' : pct < 50 ? 'bad' : 'risk'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {/* Tabs */}
      <div className="detail-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <section className="detail-card card">
        <div className="card-head">
          <div>
            <h2>{activeTab} Details</h2>
            <p>Verification parameters and audit records for {activeTab}</p>
          </div>
        </div>

        {activeTab === 'Compliance' ? (
          <div className="checklist-container">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`check-row ${item.done ? 'is-done' : 'is-pending'}`}
              >
                <span className={`check-icon-wrap ${item.done ? 'done' : 'pending'}`}>
                  {item.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Clock3 className="w-5 h-5 text-amber-600" />
                  )}
                </span>
                <div className="check-body">
                  <div className="check-title-row">
                    <strong>{item.label}</strong>
                    <StatusPill value={item.done ? 'Completed' : 'Pending'} />
                  </div>
                  <small className="text-slate-500">
                    Due: {item.due || 'Not scheduled'} ·{' '}
                    {item.date ? `Completed on ${item.date}` : 'Action required'}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="detail-grid">
            {getFieldsForTab(activeTab).map(([label, val]) => (
              <div className="detail-field-box" key={label}>
                <span className="detail-field-label">{label}</span>
                <strong className="detail-field-value">{val}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {isEditOpen && (
        <ContractFormModal
          initial={contract}
          onClose={() => setIsEditOpen(false)}
          onSave={(saved) => {
            onUpdate(saved)
            setIsEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
