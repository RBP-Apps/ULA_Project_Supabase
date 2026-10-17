'use client'

import React from 'react'
import {
  SolarPanel,
  Building2,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
} from 'lucide-react'

export function AuthBrandPanel() {
  return (
    <aside className="auth-brand-side">
      <div className="auth-brand-content">
        {/* Brand Logo & Title */}
        <div className="auth-brand-header">
          <div className="auth-brand-mark">
            <SolarPanel className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="auth-brand-title">
              surya<span>setu</span>
            </h1>
            <p className="auth-brand-subtitle">CSPDCL ULA Project Control Room</p>
          </div>
        </div>

        {/* Hero Tagline */}
        <div className="auth-hero-copy">
          <div className="auth-badge">
            <span className="live-dot" />
            <span>Government Project Workspace</span>
          </div>
          <h2 className="auth-hero-headline">
            One connected view of every solar milestone.
          </h2>
          <p className="auth-hero-desc">
            Coordinate field surveys, beneficiary lots, EPC materials, compliance milestones,
            JCR submission, and commissioning for CSPDCL projects.
          </p>
        </div>

        {/* Project KPI Highlights */}
        <div className="auth-highlights-grid">
          <div className="auth-highlight-card">
            <div className="highlight-icon">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <strong className="highlight-val">114.23 MW</strong>
              <span className="highlight-lbl">ULA rooftop tender capacity</span>
            </div>
          </div>

          <div className="auth-highlight-card">
            <div className="highlight-icon">
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <strong className="highlight-val">30-day</strong>
              <span className="highlight-lbl">Lot clock with live LD</span>
            </div>
          </div>

          <div className="auth-highlight-card">
            <div className="highlight-icon">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <strong className="highlight-val">100% Audit</strong>
              <span className="highlight-lbl">Compliance Tracking</span>
            </div>
          </div>

          <div className="auth-highlight-card">
            <div className="highlight-icon">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <strong className="highlight-val">JIR &amp; Docket</strong>
              <span className="highlight-lbl">Gated billing per lot</span>
            </div>
          </div>
        </div>

        {/* Footer Authority */}
        <div className="auth-brand-footer">
          <Building2 className="w-4 h-4 text-slate-400" />
          <span>Chhattisgarh State Power Distribution Company Limited (CSPDCL)</span>
        </div>
      </div>
    </aside>
  )
}
