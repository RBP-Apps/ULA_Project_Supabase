'use client'

import React, { useState } from 'react'
import { Save, UploadCloud, FileText } from 'lucide-react'
import { Modal, FormSection, CheckField, DateField, TextArea, GateBox, NoteBanner, FileChip, reportSave, confirmAction, useUserName } from '../ui'
import { updateBeneficiary, useLotMap } from '@/lib/ula/data'
import { PORTAL_FIELDS, portalGate, nowIso, today, fmtDateTime } from '@/lib/ula/workflow'
import type { Beneficiary, PortalData } from '@/lib/ula/types'

export function markUploaded(p: PortalData, user: string): PortalData {
  return { ...p, uploadedAt: nowIso(), uploadedBy: user }
}

/** Portal field upload status for one site. "Upload done" starts the Annex G clock on CSPDCL's side. */
export function PortalForm({ b, onClose }: { b: Beneficiary; onClose: () => void }) {
  const user = useUserName()
  const lots = useLotMap()
  const [p, setP] = useState<PortalData>({ ...b.portal, fields: { ...b.portal.fields } })
  const done = !!b.portal.uploadedAt
  const missing = portalGate({ ...b, portal: p })

  const save = () => {
    if (reportSave(updateBeneficiary(b.id, (x) => ({ ...x, portal: p }), user, 'Portal upload status saved'), 'Portal status saved')) onClose()
  }
  const complete = () => {
    if (missing.length) return
    if (!confirmAction(`Mark portal upload done for ${b.name}? This starts CSPDCL's Annex G inspection clock.`)) return
    if (reportSave(updateBeneficiary(b.id, (x) => ({ ...x, portal: markUploaded(p, user) }), user, 'Portal upload completed — Annex G clock started'), `${b.name} uploaded on National Portal`)) onClose()
  }

  return (
    <Modal
      eyebrow={`${lots.get(b.lotId)?.lotNo || ''} · Portal application ${b.appNo}`}
      title={`Portal update — ${b.name}`}
      subtitle={`Consumer ${b.consumerNo} · ${b.sanctionedKw} kW · modules ${b.moduleSerials.length} · inverter ${b.inverterSerial || '—'}`}
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="outline-btn" onClick={save}>
              <Save className="w-4 h-4" /> Save progress
            </button>
            <button type="button" className="primary-btn" disabled={missing.length > 0} onClick={complete}>
              <UploadCloud className="w-4 h-4" /> Mark portal upload done
            </button>
          </>
        )
      }
    >
      {done && (
        <NoteBanner>
          Uploaded {fmtDateTime(b.portal.uploadedAt)} by {b.portal.uploadedBy}. Changes now happen on the CSPDCL side (JCR Status).
        </NoteBanner>
      )}
      <FormSection title="National Portal fields uploaded" icon={UploadCloud}>
        <div className="check-grid">
          {PORTAL_FIELDS.map((f) => (
            <CheckField key={f} label={f} disabled={done} checked={!!p.fields[f]} onChange={(v) => setP({ ...p, fields: { ...p.fields, [f]: v } })} />
          ))}
        </div>
      </FormSection>
      <FormSection title="Source documents in this system" icon={FileText}>
        <div className="row">
          {b.survey.electricityBill ? <FileChip file={b.survey.electricityBill} /> : <span className="chip warn">Electricity bill missing</span>}
          {b.installation.installReport ? <FileChip file={b.installation.installReport} /> : <span className="chip warn">Installation report missing</span>}
        </div>
      </FormSection>
      <div className="form-grid">
        <DateField label="Net-meter application date" required value={p.netMeterAppliedDate} max={today()} disabled={done} onChange={(v) => setP({ ...p, netMeterAppliedDate: v })} />
        <TextArea label="Remarks" span2 value={p.remarks} disabled={done} onChange={(v) => setP({ ...p, remarks: v })} />
      </div>
      {!done && <GateBox missing={missing} okText="All portal fields uploaded and net-meter applied" />}
    </Modal>
  )
}
