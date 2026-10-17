'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Eye,
  Pencil,
  ClipboardList,
  Trash2,
  Filter,
} from 'lucide-react'
import { Contract } from '@/lib/types'
import {
  getStoredContracts,
  saveStoredContract,
  deleteStoredContract,
  blankContract,
  complianceItems,
} from '@/lib/contracts-store'
import { StatusPill } from './StatusPill'
import { ContractFormModal } from './ContractFormModal'
import { ComplianceDrawer } from './ComplianceDrawer'

export function ContractList() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [complianceDrawerOpen, setComplianceDrawerOpen] = useState(false)

  useEffect(() => {
    setContracts(getStoredContracts())
  }, [])

  const filteredContracts = contracts.filter((c) => {
    const matchesSearch =
      c.contractName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.packageCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.entity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.circle && c.circle.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesStatus =
      statusFilter === 'All' || c.overallStatus.toLowerCase() === statusFilter.toLowerCase()

    return matchesSearch && matchesStatus
  })

  // Metric counts
  const totalCount = contracts.length
  const compliantCount = contracts.filter((c) => c.overallStatus === 'Compliant').length
  const pendingCount = contracts.filter((c) =>
    complianceItems(c).some((item) => !item.done)
  ).length
  const atRiskCount = contracts.filter(
    (c) => c.overallStatus === 'At Risk' || c.overallStatus === 'Overdue'
  ).length

  const handleSaveContract = (saved: Contract) => {
    const updated = saveStoredContract(saved)
    setContracts(updated)
    setFormModalOpen(false)
  }

  const handleDeleteContract = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete contract "${name}"?`)) {
      const updated = deleteStoredContract(id)
      setContracts(updated)
    }
  }

  const openAddModal = () => {
    setActiveContract({ ...blankContract })
    setFormModalOpen(true)
  }

  const openEditModal = (c: Contract) => {
    setActiveContract(c)
    setFormModalOpen(true)
  }

  const openCompliance = (c: Contract) => {
    setActiveContract(c)
    setComplianceDrawerOpen(true)
  }

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            Project Setup & Governance
          </span>
          <h1>Contract & Compliance</h1>
          <p>
            Manage CSPDCL contract setup, LOA, PBG, agreement, GTP, engineering drawings, insurance,
            and inspection compliance.
          </p>
        </div>

        <button type="button" className="primary-btn" onClick={openAddModal}>
          <Plus className="w-4 h-4" />
          <span>Add Contract Package</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="stat-grid contract-stats">
        <button
          type="button"
          className="stat-card summary-card"
          onClick={() => setStatusFilter('All')}
        >
          <div className="stat-top">
            <span className="stat-label">Total Contracts</span>
            <div className="stat-icon teal">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">{totalCount}</strong>
          <div className="stat-foot">
            <span>All packages under execution</span>
          </div>
        </button>

        <button
          type="button"
          className="stat-card summary-card accent-blue"
          onClick={() => setStatusFilter('Compliant')}
        >
          <div className="stat-top">
            <span className="stat-label">Fully Compliant</span>
            <div className="stat-icon blue">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">{compliantCount}</strong>
          <div className="stat-foot">
            <span className="positive">All milestones cleared</span>
          </div>
        </button>

        <button
          type="button"
          className="stat-card summary-card accent-amber"
          onClick={() => setStatusFilter('At Risk')}
        >
          <div className="stat-top">
            <span className="stat-label">Compliance Pending</span>
            <div className="stat-icon amber">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">{pendingCount}</strong>
          <div className="stat-foot">
            <span>Awaiting document clearance</span>
          </div>
        </button>

        <button
          type="button"
          className="stat-card summary-card accent-rose"
          onClick={() => setStatusFilter('Overdue')}
        >
          <div className="stat-top">
            <span className="stat-label">At Risk / Overdue</span>
            <div className="stat-icon rose">
              <Clock3 className="w-4 h-4" />
            </div>
          </div>
          <strong className="stat-value">{atRiskCount}</strong>
          <div className="stat-foot">
            <span className="negative">Requires immediate action</span>
          </div>
        </button>
      </div>

      {/* Main Table Card */}
      <section className="card table-card">
        {/* Table Toolbar */}
        <div className="table-toolbar">
          <div className="search-box table-search">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by contract name, package code, entity, circle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="table-filter-group">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter contracts by status"
            >
              <option value="All">All Statuses</option>
              <option value="Compliant">Compliant</option>
              <option value="In Progress">In Progress</option>
              <option value="At Risk">At Risk</option>
              <option value="Overdue">Overdue</option>
              <option value="Not Started">Not Started</option>
            </select>
          </div>
        </div>

        {/* Table Wrap */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contract / Package</th>
                <th>Entity</th>
                <th>LOA Date</th>
                <th>Agreement</th>
                <th>PBG</th>
                <th>GTP</th>
                <th>Drawings</th>
                <th>Insurance</th>
                <th>Inspection</th>
                <th>Progress</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.map((c) => {
                const milestones = complianceItems(c)
                const doneCount = milestones.filter((m) => m.done).length
                const pct = Math.round((doneCount / milestones.length) * 100)

                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/contract-compliance/${c.id}`} className="contract-title-link">
                        <strong>{c.contractName}</strong>
                        <small>{c.packageCode} · {c.kwp} kWp</small>
                      </Link>
                    </td>
                    <td>
                      <span className="entity-chip">{c.entity}</span>
                    </td>
                    <td>{c.loaDate || '—'}</td>
                    <td><StatusPill value={c.agreementStatus} /></td>
                    <td><StatusPill value={c.pbgStatus} /></td>
                    <td><StatusPill value={c.gtpStatus} /></td>
                    <td><StatusPill value={c.drawingStatus} /></td>
                    <td><StatusPill value={c.insuranceStatus} /></td>
                    <td><StatusPill value={c.inspectionStatus} /></td>
                    <td>
                      <div className="progress-cell">
                        <div className="progress-track">
                          <div
                            className={`progress-fill ${pct === 100 ? 'good' : pct < 50 ? 'bad' : 'risk'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span>{pct}%</span>
                      </div>
                    </td>
                    <td><StatusPill value={c.overallStatus} /></td>
                    <td className="text-right">
                      <div className="row-actions">
                        <Link
                          href={`/contract-compliance/${c.id}`}
                          className="action-icon-btn"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="Edit Contract"
                          onClick={() => openEditModal(c)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="View Checklist"
                          onClick={() => openCompliance(c)}
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn danger"
                          title="Delete Contract"
                          onClick={() => handleDeleteContract(c.id, c.contractName)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredContracts.length === 0 && (
            <div className="empty-state">
              <FileCheck2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3>No contract packages found</h3>
              <p>Try adjusting your search criteria or add a new contract package.</p>
            </div>
          )}
        </div>
      </section>

      {/* Add / Edit Modal */}
      {formModalOpen && activeContract && (
        <ContractFormModal
          initial={activeContract}
          onClose={() => setFormModalOpen(false)}
          onSave={handleSaveContract}
        />
      )}

      {/* Compliance Drawer */}
      {complianceDrawerOpen && activeContract && (
        <ComplianceDrawer
          contract={activeContract}
          onClose={() => setComplianceDrawerOpen(false)}
        />
      )}
    </div>
  )
}
