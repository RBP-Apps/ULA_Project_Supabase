'use client'

import React from 'react'
import {
  X,
  CheckCircle2,
  Clock3,
  FileText,
  AlertTriangle,
  User,
  Calendar,
} from 'lucide-react'
import { Contract } from '@/lib/types'
import { complianceItems } from '@/lib/contracts-store'
import { StatusPill } from './StatusPill'

interface ComplianceDrawerProps {
  contract: Contract
  onClose: () => void
}

export function ComplianceDrawer({ contract, onClose }: ComplianceDrawerProps) {
  const items = complianceItems(contract)
  const doneCount = items.filter((i) => i.done).length
  const pct = Math.round((doneCount / items.length) * 100)

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel compliance-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Compliance Checklist</span>
            <h2>{contract.contractName}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Package: {contract.packageCode} · Entity: {contract.entity}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close checklist"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="compliance-progress">
          <div className="compliance-progress-text">
            <strong>{pct}% Compliant</strong>
            <span>
              {doneCount} of {items.length} milestones cleared
            </span>
          </div>
          <div className="progress-track large">
            <span
              className={`progress-fill ${pct === 100 ? 'good' : pct < 50 ? 'bad' : 'risk'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist List */}
        <div className="checklist-scroll">
          {items.map((item, index) => (
            <div className={`check-row ${item.done ? 'is-done' : 'is-pending'}`} key={index}>
              <div className={`check-icon-wrap ${item.done ? 'done' : 'pending'}`}>
                {item.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Clock3 className="w-5 h-5 text-amber-600" />
                )}
              </div>

              <div className="check-body">
                <div className="check-title-row">
                  <strong>{item.label}</strong>
                  <StatusPill value={item.done ? 'Completed' : 'Pending'} />
                </div>

                <div className="check-meta-row">
                  <span className="check-meta-item">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Due: {item.due || 'TBD'}
                  </span>
                  {item.date && (
                    <span className="check-meta-item text-emerald-700">
                      Completed: {item.date}
                    </span>
                  )}
                  {item.responsible && (
                    <span className="check-meta-item">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {item.responsible}
                    </span>
                  )}
                </div>

                {item.doc && (
                  <div className="check-doc-link">
                    <FileText className="w-3 h-3 text-teal-600" />
                    <span>{item.doc}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="drawer-footer">
          <button type="button" className="primary-btn w-full justify-center" onClick={onClose}>
            Close Checklist
          </button>
        </div>
      </aside>
    </div>
  )
}
