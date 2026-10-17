'use client'

import React, { useState, FormEvent, ChangeEvent } from 'react'
import {
  X,
  Upload,
  CheckCircle2,
  FileCheck2,
  Building,
  Shield,
  Layers,
} from 'lucide-react'
import { Contract } from '@/lib/types'
import { addDays, complianceItems } from '@/lib/contracts-store'

interface ContractFormModalProps {
  initial: Contract
  onClose: () => void
  onSave: (savedContract: Contract) => void
}

export function ContractFormModal({ initial, onClose, onSave }: ContractFormModalProps) {
  const [form, setForm] = useState<Contract>({ ...initial })

  const setField = (key: keyof Contract, value: string | number) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'contractValue') {
        next.pbgAmount = Math.round(Number(value) * 0.1)
      }
      if (key === 'loaDate') {
        next.inspectionDueDate = addDays(String(value), 21)
      }
      return next
    })
  }

  const handleFileUpload = (key: keyof Contract, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setField(key, file.name)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.contractName || !form.contractValue || !form.kwp) {
      alert('Please complete the mandatory contract fields.')
      return
    }

    const milestones = complianceItems(form)
    const completedCount = milestones.filter((m) => m.done).length
    const hasOverdue = milestones.some(
      (m) => !m.done && m.due && new Date(m.due) < new Date()
    )

    let computedStatus = form.overallStatus
    if (completedCount === 0) computedStatus = 'Not Started'
    else if (completedCount === milestones.length) computedStatus = 'Compliant'
    else if (hasOverdue) computedStatus = 'Overdue'
    else computedStatus = 'At Risk'

    const saved: Contract = {
      ...form,
      id: form.id || `CTR-${Date.now().toString().slice(-4)}`,
      pbgAmount: form.pbgAmount || Math.round(form.contractValue * 0.1),
      inspectionDueDate: form.inspectionDueDate || addDays(form.loaDate, 21),
      overallStatus: computedStatus,
      updatedAt: new Date().toISOString().slice(0, 10),
      createdAt: form.createdAt || new Date().toISOString().slice(0, 10),
    }

    onSave(saved)
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <form
        className="drawer-panel contract-modal-panel"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Contract Record</span>
            <h2>{initial.id ? `Edit: ${initial.contractName}` : 'Add New Contract Package'}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter CSPDCL work details, compliance requirements, and guarantee details.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="form-scroll">
          {/* Section: Basic Information */}
          <div className="form-section">
            <div className="form-section-title">
              <Building className="w-4 h-4 text-teal-600" />
              <h3>1. Basic Contract Information</h3>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Contract / Package Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. ULA Rooftop Solar — Package 3 (Raipur)"
                  value={form.contractName}
                  onChange={(e) => setField('contractName', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Package Code / Tender Ref *</span>
                <input
                  type="text"
                  placeholder="e.g. ULA-DURG-01"
                  value={form.packageCode}
                  onChange={(e) => setField('packageCode', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Executing Entity *</span>
                <select
                  value={form.entity}
                  onChange={(e) => setField('entity', e.target.value)}
                >
                  <option value="RBP Energy Ltd">RBP Energy Ltd</option>
                  <option value="RBP + Rotomag">RBP + Rotomag Consortium</option>
                  <option value="Rotomag Partner">Rotomag Partner</option>
                  <option value="CSPDCL In-House">CSPDCL In-House</option>
                </select>
              </label>

              <label className="field">
                <span>Contract Value (₹ INR) *</span>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="12500000"
                  value={form.contractValue || ''}
                  onChange={(e) => setField('contractValue', Number(e.target.value))}
                />
              </label>

              <label className="field">
                <span>Total Capacity (kWp) *</span>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="850"
                  value={form.kwp || ''}
                  onChange={(e) => setField('kwp', Number(e.target.value))}
                />
              </label>

              <label className="field">
                <span>Package Scheme</span>
                <input
                  type="text"
                  placeholder="PM Surya Ghar ULA rooftop package"
                  value={form.packageName}
                  onChange={(e) => setField('packageName', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Circle</span>
                <input
                  type="text"
                  placeholder="e.g. Durg / Raipur / Bilaspur"
                  value={form.circle}
                  onChange={(e) => setField('circle', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Division</span>
                <input
                  type="text"
                  placeholder="e.g. Durg Rural / Bhilai"
                  value={form.division}
                  onChange={(e) => setField('division', e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Section: LOA Details */}
          <div className="form-section">
            <div className="form-section-title">
              <FileCheck2 className="w-4 h-4 text-teal-600" />
              <h3>2. Letter of Award (LOA)</h3>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>LOA Number</span>
                <input
                  type="text"
                  placeholder="LOA/CSPDCL/2026/014"
                  value={form.loaNumber}
                  onChange={(e) => setField('loaNumber', e.target.value)}
                />
              </label>

              <label className="field">
                <span>LOA Issue Date</span>
                <input
                  type="date"
                  value={form.loaDate}
                  onChange={(e) => setField('loaDate', e.target.value)}
                />
              </label>

              <label className="field">
                <span>LOA Acceptance Date</span>
                <input
                  type="date"
                  value={form.loaAcceptanceDate}
                  onChange={(e) => setField('loaAcceptanceDate', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Acceptance Status</span>
                <select
                  value={form.loaAcceptanceStatus}
                  onChange={(e) => setField('loaAcceptanceStatus', e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </label>

              <label className="field upload-field">
                <span>LOA Document (PDF)</span>
                <div className="upload-box">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{form.loaDocument || 'Choose file...'}</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg"
                    onChange={(e) => handleFileUpload('loaDocument', e)}
                  />
                </div>
              </label>
            </div>
          </div>

          {/* Section: PBG & Agreement */}
          <div className="form-section">
            <div className="form-section-title">
              <Shield className="w-4 h-4 text-teal-600" />
              <h3>3. PBG & Agreement</h3>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>PBG Number</span>
                <input
                  type="text"
                  placeholder="PBG/2026/014"
                  value={form.pbgNumber}
                  onChange={(e) => setField('pbgNumber', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Expected PBG Amount (10%)</span>
                <input
                  type="text"
                  readOnly
                  value={
                    form.contractValue
                      ? `₹${Math.round(form.contractValue * 0.1).toLocaleString('en-IN')}`
                      : '—'
                  }
                  className="bg-slate-50 cursor-not-allowed"
                />
              </label>

              <label className="field">
                <span>PBG Issue Date</span>
                <input
                  type="date"
                  value={form.pbgIssueDate}
                  onChange={(e) => setField('pbgIssueDate', e.target.value)}
                />
              </label>

              <label className="field">
                <span>PBG Expiry Date</span>
                <input
                  type="date"
                  value={form.pbgExpiryDate}
                  onChange={(e) => setField('pbgExpiryDate', e.target.value)}
                />
              </label>

              <label className="field">
                <span>PBG Status</span>
                <select
                  value={form.pbgStatus}
                  onChange={(e) => setField('pbgStatus', e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Approved">Approved</option>
                </select>
              </label>

              <label className="field upload-field">
                <span>PBG Document</span>
                <div className="upload-box">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{form.pbgDocument || 'Choose file...'}</span>
                  <input type="file" accept=".pdf,.png,.jpg" onChange={(e) => handleFileUpload('pbgDocument', e)} />
                </div>
              </label>

              <label className="field">
                <span>Agreement Number</span>
                <input
                  type="text"
                  placeholder="AGR/2026/014"
                  value={form.agreementNumber}
                  onChange={(e) => setField('agreementNumber', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Agreement Date</span>
                <input
                  type="date"
                  value={form.agreementDate}
                  onChange={(e) => setField('agreementDate', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Agreement Status</span>
                <select
                  value={form.agreementStatus}
                  onChange={(e) => setField('agreementStatus', e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Signed">Signed</option>
                </select>
              </label>

              <label className="field">
                <span>Agreement Signed Date</span>
                <input type="date" value={form.signedDate} onChange={(e) => setField('signedDate', e.target.value)} />
              </label>

              <label className="field upload-field">
                <span>Signed Agreement</span>
                <div className="upload-box">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{form.agreementDocument || 'Choose file...'}</span>
                  <input type="file" accept=".pdf,.png,.jpg" onChange={(e) => handleFileUpload('agreementDocument', e)} />
                </div>
              </label>
            </div>
          </div>

          {/* Section: GTP & Drawings */}
          <div className="form-section">
            <div className="form-section-title">
              <Layers className="w-4 h-4 text-teal-600" />
              <h3>4. GTP, Drawings & Insurance</h3>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>GTP Status</span>
                <select
                  value={form.gtpStatus}
                  onChange={(e) => setField('gtpStatus', e.target.value)}
                >
                  <option value="Not Submitted">Not Submitted</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Revision Required">Revision Required</option>
                </select>
              </label>

              <label className="field">
                <span>GTP Approved Date</span>
                <input
                  type="date"
                  value={form.gtpApprovedDate}
                  onChange={(e) => setField('gtpApprovedDate', e.target.value)}
                />
              </label>

              <label className="field">
                <span>GTP Submitted Date</span>
                <input type="date" value={form.gtpSubmittedDate} onChange={(e) => setField('gtpSubmittedDate', e.target.value)} />
              </label>

              <label className="field">
                <span>GTP Approved By</span>
                <input type="text" placeholder="CSPDCL Technical Cell" value={form.gtpApprovedBy} onChange={(e) => setField('gtpApprovedBy', e.target.value)} />
              </label>

              <label className="field upload-field">
                <span>Approved GTP</span>
                <div className="upload-box">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{form.gtpDocument || 'Choose file...'}</span>
                  <input type="file" accept=".pdf,.png,.jpg" onChange={(e) => handleFileUpload('gtpDocument', e)} />
                </div>
              </label>

              <label className="field">
                <span>Drawings Status</span>
                <select
                  value={form.drawingStatus}
                  onChange={(e) => setField('drawingStatus', e.target.value)}
                >
                  <option value="Not Submitted">Not Submitted</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Revision Required">Revision Required</option>
                </select>
              </label>

              <label className="field">
                <span>Drawings Approved Date</span>
                <input type="date" value={form.drawingApprovedDate} onChange={(e) => setField('drawingApprovedDate', e.target.value)} />
              </label>

              <label className="field upload-field">
                <span>Approved Drawings</span>
                <div className="upload-box">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{form.drawingDocument || 'Choose file...'}</span>
                  <input type="file" accept=".pdf,.png,.jpg,.dwg" onChange={(e) => handleFileUpload('drawingDocument', e)} />
                </div>
              </label>

              <label className="field">
                <span>Insurance Provider</span>
                <input
                  type="text"
                  placeholder="e.g. New India Assurance"
                  value={form.insuranceProvider}
                  onChange={(e) => setField('insuranceProvider', e.target.value)}
                />
              </label>

              <label className="field">
                <span>Insurance Policy Number</span>
                <input type="text" placeholder="" value={form.insurancePolicyNumber} onChange={(e) => setField('insurancePolicyNumber', e.target.value)} />
              </label>

              <label className="field">
                <span>Policy Start Date</span>
                <input type="date" value={form.insuranceStartDate} onChange={(e) => setField('insuranceStartDate', e.target.value)} />
              </label>

              <label className="field">
                <span>Policy Expiry Date</span>
                <input type="date" value={form.insuranceExpiryDate} onChange={(e) => setField('insuranceExpiryDate', e.target.value)} />
              </label>

              <label className="field upload-field">
                <span>Insurance Policy (transit, storage, erection, third party)</span>
                <div className="upload-box">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{form.insuranceDocument || 'Choose file...'}</span>
                  <input type="file" accept=".pdf,.png,.jpg" onChange={(e) => handleFileUpload('insuranceDocument', e)} />
                </div>
              </label>

              <label className="field">
                <span>Insurance Status</span>
                <select
                  value={form.insuranceStatus}
                  onChange={(e) => setField('insuranceStatus', e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Active">Active</option>
                  <option value="Expired">Expired</option>
                </select>
              </label>

              <label className="field">
                <span>Inspection Call Status</span>
                <select
                  value={form.inspectionStatus}
                  onChange={(e) => setField('inspectionStatus', e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </label>

              <label className="field">
                <span>Inspection Call Reference</span>
                <input type="text" placeholder="" value={form.inspectionReference} onChange={(e) => setField('inspectionReference', e.target.value)} />
              </label>

              <label className="field">
                <span>Inspection Date</span>
                <input type="date" value={form.inspectionDate} onChange={(e) => setField('inspectionDate', e.target.value)} />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <CheckCircle2 className="w-4 h-4" />
            <span>Save Contract Record</span>
          </button>
        </div>
      </form>
    </div>
  )
}
