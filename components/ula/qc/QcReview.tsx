'use client'

import React, { useState } from 'react'
import { CheckCircle2, XCircle, CheckSquare, Square, Camera } from 'lucide-react'
import { Modal, FormSection, PhotoSlots, Thumb, FileChip, CheckField, TextArea, Chip, toast, reportSave, confirmAction, useUserName } from '../ui'
import { updateBeneficiary, useLotMap, useIpMap } from '@/lib/ula/data'
import { INSTALL_CHECKLIST, INSTALL_PHOTOS, nowIso, fmtDate, fmtDateTime, useSettings, hoursSince } from '@/lib/ula/workflow'
import type { Beneficiary, QcEvent } from '@/lib/ula/types'

/** Photos beside the checklist; accept or reject with reason. Read-only unless the site is waiting at QC. */
export function QcReview({ b, onClose }: { b: Beneficiary; onClose: () => void }) {
  const user = useUserName()
  const settings = useSettings()
  const lots = useLotMap()
  const ips = useIpMap()
  const [reason, setReason] = useState('')
  const [visit, setVisit] = useState(false)
  const [reasonErr, setReasonErr] = useState('')
  const i = b.installation
  const pending = i.status === 'Submitted' && b.qc.status === 'Pending'

  const missingSerials = b.moduleSerials.filter((s) => !i.moduleSerialsScanned.includes(s))
  const extraSerials = i.moduleSerialsScanned.filter((s) => !b.moduleSerials.includes(s))
  const invOk = !!b.inverterSerial && i.inverterSerialScanned === b.inverterSerial
  const prOk = i.prReading >= settings.minPrCommissioning

  const record = (result: QcEvent['result']) => {
    const ev: QcEvent = { at: nowIso(), result, by: user, remarks: reason.trim(), physicalVisit: visit }
    return updateBeneficiary(
      b.id,
      (x) => ({
        ...x,
        qc: { status: result, history: [...x.qc.history, ev] },
        // a rejection sends the site back to the IP's installation queue
        installation: result === 'Rejected' ? { ...x.installation, status: 'In Progress' } : x.installation,
      }),
      user,
      result === 'Passed' ? `QC passed${visit ? ' (physical visit)' : ''}` : `QC rejected: ${reason.trim()}`
    )
  }

  const accept = () => {
    if (!confirmAction(`Pass QC for ${b.name}? The site moves to Portal Update and becomes eligible for IP billing.`)) return
    if (reportSave(record('Passed'), `QC passed — ${b.name} sent to Portal Update`)) onClose()
  }
  const reject = () => {
    if (!reason.trim()) {
      setReasonErr('Give the reason so the IP knows what to fix')
      toast('Rejection needs a reason', 'error')
      return
    }
    if (reportSave(record('Rejected'), `QC rejected — ${b.name} returned to the IP`)) onClose()
  }

  const Tick = ({ ok }: { ok: boolean }) => (ok ? <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Square className="w-3.5 h-3.5 text-rose-500 shrink-0" />)
  const overdue = pending && i.submittedAt && hoursSince(i.submittedAt) > settings.sla.qcHours

  return (
    <Modal
      size="wide"
      eyebrow={`${lots.get(b.lotId)?.lotNo || ''} · ${b.appNo} · ${b.ipId ? ips.get(b.ipId)?.name || '' : 'No IP'}`}
      title={`QC review — ${b.name}`}
      subtitle={`Submitted ${fmtDateTime(i.submittedAt)} · installed ${fmtDate(i.installedAt)} · ${b.sanctionedKw} kW`}
      onClose={onClose}
      footer={
        pending ? (
          <>
            {overdue && <Chip tone="bad">Over {settings.sla.qcHours} h since submission</Chip>}
            <span style={{ marginRight: 'auto' }} />
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="danger-btn" onClick={reject}>
              <XCircle className="w-4 h-4" /> Reject to IP
            </button>
            <button type="button" className="primary-btn" onClick={accept}>
              <CheckCircle2 className="w-4 h-4" /> Accept
            </button>
          </>
        ) : (
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <div className="ula-grid-2">
        <div className="stack">
          <FormSection title="Post-installation photos" icon={Camera}>
            <PhotoSlots slots={INSTALL_PHOTOS} value={i.photos} onChange={() => undefined} disabled />
          </FormSection>
          <FormSection title={`Pre-installation survey photos (${b.survey.photos.length})`} icon={Camera}>
            {b.survey.photos.length ? (
              <div className="photo-grid">
                {b.survey.photos.map((p) => (
                  <div key={p.id} className="photo-slot filled">
                    <Thumb file={p} />
                    <span className="meta">
                      {fmtDateTime(p.uploadedAt)}
                      {p.lat !== undefined ? ` · ${p.lat.toFixed(5)}, ${p.lng?.toFixed(5)}` : ' · no GPS'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 11 }}>No survey photos.</span>
            )}
          </FormSection>
        </div>

        <div className="stack">
          <FormSection title="Checklist as filled by IP">
            <div className="stack" style={{ gap: 4 }}>
              {INSTALL_CHECKLIST.map((c) => (
                <div key={c} className="row" style={{ fontSize: 11, flexWrap: 'nowrap' }}>
                  <Tick ok={!!i.checklist[c]} /> {c}
                </div>
              ))}
            </div>
          </FormSection>
          <FormSection title="Captured data">
            <div className="stack" style={{ gap: 5, fontSize: 11 }}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Tick ok={b.moduleSerials.length > 0 && !missingSerials.length && !extraSerials.length} /> Module serials: {i.moduleSerialsScanned.length} scanned / {b.moduleSerials.length} dispatched
                {missingSerials.length > 0 && <Chip tone="bad">missing {missingSerials.join(', ')}</Chip>}
                {extraSerials.length > 0 && <Chip tone="bad">unexpected {extraSerials.join(', ')}</Chip>}
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Tick ok={invOk} /> Inverter: {i.inverterSerialScanned || '—'} (dispatched {b.inverterSerial || '—'})
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Tick ok={!!(i.loggerId && i.simNo && i.loggerLive)} /> Logger {i.loggerId || '—'} · SIM {i.simNo || '—'} · {i.loggerLive ? 'live' : 'not live'}
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Tick ok={prOk} /> PR reading {i.prReading || 0}% (min {settings.minPrCommissioning}%)
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Tick ok={!!i.installReport && i.consumerSigned} /> Installation report {i.consumerSigned ? 'signed by consumer' : 'not signed'}
              </div>
              {i.installReport && <FileChip file={i.installReport} />}
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Tick ok={i.trainingDone && i.omManualHanded} /> Training {i.trainingDone ? 'done' : 'pending'} · O&amp;M manual {i.omManualHanded ? 'handed over' : 'pending'}
              </div>
              {i.remarks && <div className="muted">IP remarks: {i.remarks}</div>}
            </div>
          </FormSection>

          {b.qc.history.length > 0 && (
            <FormSection title="QC history">
              <div className="timeline">
                {[...b.qc.history].reverse().map((h, k) => (
                  <div className="timeline-item" key={k}>
                    <time>{fmtDateTime(h.at)}</time>
                    <span>
                      <Chip tone={h.result === 'Passed' ? 'good' : 'bad'}>{h.result}</Chip> {h.remarks} <small className="muted">— {h.by}{h.physicalVisit ? ' · physical visit' : ''}</small>
                    </span>
                  </div>
                ))}
              </div>
            </FormSection>
          )}

          {pending && (
            <FormSection title="Decision">
              <CheckField label="Sample physical visit done for this site" checked={visit} onChange={setVisit} />
              <TextArea
                label="Remarks / rejection reason"
                value={reason}
                onChange={(v) => {
                  setReason(v)
                  setReasonErr('')
                }}
                error={reasonErr}
                hint="Required when rejecting"
              />
            </FormSection>
          )}
        </div>
      </div>
    </Modal>
  )
}
