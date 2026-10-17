'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, ArrowRight, Ban } from 'lucide-react'
import { Modal, FileChip, Chip, ProgressBar, NoteBanner } from './ui'
import { StatusPill } from '@/components/contracts/StatusPill'
import { useBeneficiaries, useLotMap, useIpMap, usePurchaseOrders, useDispatches } from '@/lib/ula/data'
import { useCollection } from '@/lib/ula/storage'
import type { ActivityLog, FileRef } from '@/lib/ula/types'
import {
  completeness,
  completenessPct,
  stageOf,
  STAGE_TONE,
  STAGE_ROUTE,
  fmtDate,
  fmtDateTime,
  siteDueDate,
  useSettings,
  annexGSteps,
  daysBetween,
  today,
} from '@/lib/ula/workflow'

/** Full beneficiary record: identity, stage, 22-item completeness, documents and history. */
export function BeneficiaryDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const bens = useBeneficiaries()
  const lots = useLotMap()
  const ips = useIpMap()
  const pos = usePurchaseOrders()
  const dispatches = useDispatches()
  const activity = useCollection<ActivityLog>('activity')
  const settings = useSettings()
  const b = bens.find((x) => x.id === id)

  const items = useMemo(() => {
    if (!b) return []
    return completeness(
      b,
      {
        lotPos: pos.filter((p) => p.lotId === b.lotId && p.status === 'Received'),
        dispatch: dispatches.find((d) => d.id === b.dispatchId),
      },
      settings
    )
  }, [b, pos, dispatches, settings])

  if (!b) {
    return (
      <Modal title="Beneficiary not found" onClose={onClose} drawer>
        <p className="muted">This record no longer exists.</p>
      </Modal>
    )
  }

  const lot = lots.get(b.lotId)
  const stage = stageOf(b)
  const pct = completenessPct(items)
  const due = lot ? siteDueDate(b, lot, settings.sla) : ''
  const history = activity.filter((a) => a.entityId === b.id)
  const steps = annexGSteps(b, settings.sla)

  const docs: [string, FileRef | undefined][] = [
    ['Electricity bill', b.survey.electricityBill],
    ['Consumer signature (survey)', b.survey.signature],
    ['Simulation report', b.design.simulationReport],
    ['Installation report', b.installation.installReport],
    ['JIR', b.commissioning.jir],
    ['Commissioning certificate', b.commissioning.certificate],
    ['Warranty certificate', b.commissioning.warrantyCertificate],
  ]

  return (
    <Modal
      drawer
      eyebrow={`Application ${b.appNo}`}
      title={b.name}
      subtitle={`${lot?.lotNo || 'Unknown lot'} · ${b.sanctionedKw} kW · ${b.district || '—'}`}
      onClose={onClose}
      footer={
        <>
          <Link href={STAGE_ROUTE[stage]} className="primary-btn" onClick={onClose}>
            Open {stage} queue <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </>
      }
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <StatusPill value={STAGE_TONE[stage]} />
          <strong style={{ fontSize: 13 }}>{stage}</strong>
        </div>
        {due && stage !== 'Commissioned' && stage !== 'Dropped' && <Chip tone={daysBetween(today(), due) < 0 ? 'bad' : 'info'}>Due {fmtDate(due)}</Chip>}
      </div>

      <NoteBanner>
        <Ban className="w-3.5 h-3.5 inline mr-1" />
        No money may be collected from the beneficiary (Sec-1 cl. 2.4). Payments are tracked only against the lot from MNRE / CSPDCL.
      </NoteBanner>

      <div className="kv-grid">
        {(
          [
            ['Consumer (BP) no.', b.consumerNo],
            ['Mobile', b.mobile],
            ['Address', b.address],
            ['Division / Sub-division', `${b.division || '—'} / ${b.subDivision || '—'}`],
            ['AE', b.aeName],
            ['Installation partner', b.ipId ? ips.get(b.ipId)?.name : 'Not assigned'],
            ['Module serials', b.moduleSerials.length ? b.moduleSerials.join(', ') : '—'],
            ['Inverter serial', b.inverterSerial],
            ['Logger / SIM', b.installation.loggerId ? `${b.installation.loggerId} / ${b.installation.simNo}` : '—'],
            ['QC', b.qc.status],
            ['Portal upload', fmtDateTime(b.portal.uploadedAt)],
            ['Commissioned', fmtDate(b.commissioning.commissionedDate)],
          ] as [string, string | undefined][]
        ).map(([k, v]) => (
          <div className="kv" key={k}>
            <span>{k}</span>
            <strong>{v || '—'}</strong>
          </div>
        ))}
      </div>

      <div className="form-section">
        <div className="section-title">
          <div>
            <h3>Billing checklist (22 items)</h3>
            <p>Every item must be complete before the lot can be billed.</p>
          </div>
          <ProgressBar pct={pct} />
        </div>
        <div className="stack" style={{ gap: 4 }}>
          {items.map((it) => (
            <div key={it.key} className="row" style={{ fontSize: 11, color: it.done ? '#17715f' : '#3b535d', flexWrap: 'nowrap' }}>
              {it.done ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0 text-slate-300" />}
              <span style={{ flex: 1 }}>{it.label}</span>
              <small className="muted">{it.stage}</small>
            </div>
          ))}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="form-section">
          <div className="section-title">
            <h3>Annex G timers</h3>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {steps.map((s) => (
              <div key={s.step} className="row" style={{ fontSize: 11, justifyContent: 'space-between' }}>
                <span>
                  {s.step} <small className="muted">({s.side})</small>
                </span>
                <Chip tone={s.overBy > 0 ? 'bad' : s.end ? 'good' : 'info'}>
                  {s.usedWorkingDays}/{s.allowedWorkingDays} working days{s.overBy > 0 ? ` · ${s.overBy} over` : ''}
                </Chip>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="form-section">
        <div className="section-title">
          <h3>Documents</h3>
        </div>
        <div className="row">
          {docs.filter(([, f]) => f).length === 0 && <span className="muted" style={{ fontSize: 11 }}>No documents yet.</span>}
          {docs.map(([label, f]) =>
            f ? (
              <div key={label} className="stack" style={{ gap: 2 }}>
                <small className="muted">{label}</small>
                <FileChip file={f} />
              </div>
            ) : null
          )}
        </div>
      </div>

      <div className="form-section">
        <div className="section-title">
          <h3>History</h3>
        </div>
        {history.length === 0 ? (
          <span className="muted" style={{ fontSize: 11 }}>No activity recorded.</span>
        ) : (
          <div className="timeline">
            {history.slice(0, 40).map((h) => (
              <div className="timeline-item" key={h.id}>
                <time>{fmtDateTime(h.at)}</time>
                <span>
                  {h.action} <small className="muted">— {h.by}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
