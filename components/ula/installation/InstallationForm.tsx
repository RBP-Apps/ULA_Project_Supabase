'use client'

import React, { useMemo, useState } from 'react'
import { Save, Send, Play, HardHat, ScanLine, Camera, FileSignature, Gauge, AlertTriangle } from 'lucide-react'
import {
  Modal,
  FormSection,
  CheckField,
  TextField,
  NumberField,
  DateField,
  TextArea,
  FileField,
  PhotoSlots,
  GateBox,
  Chip,
  NoteBanner,
  reportSave,
  confirmAction,
  useUserName,
} from '../ui'
import { updateBeneficiary, useLotMap, useIpMap } from '@/lib/ula/data'
import { INSTALL_CHECKLIST, INSTALL_PHOTOS, installationGate, nowIso, today, useSettings, fmtDate } from '@/lib/ula/workflow'
import type { Beneficiary, InstallationData } from '@/lib/ula/types'
import { lastQcEvent } from './QueueFilters'

/** Mobile-first installation checklist for one site. Read-only once submitted to QC. */
export function InstallationForm({ b, onClose }: { b: Beneficiary; onClose: () => void }) {
  const user = useUserName()
  const settings = useSettings()
  const lots = useLotMap()
  const ips = useIpMap()
  const [d, setD] = useState<InstallationData>(() => ({ ...b.installation, checklist: { ...b.installation.checklist }, photos: { ...b.installation.photos } }))
  const [serialText, setSerialText] = useState(b.installation.moduleSerialsScanned.join('\n'))
  const readOnly = b.installation.status === 'Submitted'
  const set = <K extends keyof InstallationData>(k: K, v: InstallationData[K]) => setD((x) => ({ ...x, [k]: v }))

  const scanned = useMemo(
    () => Array.from(new Set(serialText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))),
    [serialText]
  )
  const draft: InstallationData = { ...d, moduleSerialsScanned: scanned }
  const merged: Beneficiary = { ...b, installation: draft }
  const missing = installationGate(merged, settings)
  const matched = b.moduleSerials.filter((s) => scanned.includes(s))
  const unexpected = scanned.filter((s) => !b.moduleSerials.includes(s))
  const rejection = b.qc.status === 'Rejected' ? lastQcEvent(b, 'Rejected') : undefined

  const persist = (inst: InstallationData, action: string, msg: string, extra?: (x: Beneficiary) => Beneficiary) =>
    reportSave(
      updateBeneficiary(b.id, (x) => (extra ? extra({ ...x, installation: inst }) : { ...x, installation: inst }), user, action),
      msg
    )

  // Photos and the signed report are field evidence already written to IndexedDB: persist them at once.
  const persistEvidence = (patchInst: Partial<InstallationData>, action: string) => {
    setD((x) => ({ ...x, ...patchInst }))
    updateBeneficiary(b.id, (x) => ({ ...x, installation: { ...x.installation, ...patchInst } }), user, action)
  }

  const start = () => {
    const inst: InstallationData = { ...draft, status: 'In Progress', startedAt: d.startedAt || nowIso() }
    if (persist(inst, 'Installation started', `Installation started for ${b.name}`)) setD(inst)
  }

  const saveDraft = () => {
    const inst: InstallationData = { ...draft, status: d.status === 'Not Started' ? 'In Progress' : d.status, startedAt: d.startedAt || nowIso() }
    if (persist(inst, 'Installation checklist saved (draft)', 'Draft saved')) setD(inst)
  }

  const submit = () => {
    if (missing.length) return
    if (!confirmAction(`Submit installation of ${b.name} to QC? The checklist becomes read-only until QC reviews it.`)) return
    const inst: InstallationData = { ...draft, status: 'Submitted', submittedAt: nowIso(), startedAt: d.startedAt || nowIso() }
    const resubmit = b.qc.status === 'Rejected'
    if (
      persist(inst, resubmit ? 'Re-submitted to QC after rejection' : 'Submitted to QC', `${b.name} submitted to QC`, (x) => ({
        ...x,
        qc: { ...x.qc, status: 'Pending' },
      }))
    )
      onClose()
  }

  const lot = lots.get(b.lotId)

  return (
    <Modal
      size="wide"
      eyebrow={`${lot?.lotNo || ''} · ${b.appNo} · ${b.ipId ? ips.get(b.ipId)?.name || '' : 'No IP'}`}
      title={`Installation — ${b.name}`}
      subtitle={`${b.sanctionedKw} kW · ${b.address}`}
      onClose={onClose}
      footer={
        readOnly ? (
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <span className="muted" style={{ fontSize: 11, marginRight: 'auto' }}>
              {missing.length ? `${missing.length} item(s) pending` : 'Ready for QC'}
            </span>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            {d.status === 'Not Started' ? (
              <button type="button" className="primary-btn" onClick={start}>
                <Play className="w-4 h-4" /> Start installation
              </button>
            ) : (
              <>
                <button type="button" className="outline-btn" onClick={saveDraft}>
                  <Save className="w-4 h-4" /> Save draft
                </button>
                <button type="button" className="primary-btn" disabled={missing.length > 0} onClick={submit} title={missing.length ? 'Complete every field and photo first' : ''}>
                  <Send className="w-4 h-4" /> Submit to QC
                </button>
              </>
            )}
          </>
        )
      }
    >
      {rejection && (
        <div className="gate-box bad">
          <strong>
            <AlertTriangle className="w-4 h-4" /> Rejected by QC on {fmtDate(rejection.at)} ({rejection.by})
          </strong>
          <div style={{ marginTop: 4 }}>{rejection.remarks}</div>
        </div>
      )}
      {readOnly && <NoteBanner>Submitted to QC on {fmtDate(b.installation.submittedAt)}. Read-only until QC accepts or rejects it.</NoteBanner>}
      {d.status === 'Not Started' && !readOnly && <NoteBanner>Material for this site is acknowledged. Start the installation to unlock the checklist.</NoteBanner>}

      <fieldset disabled={readOnly || d.status === 'Not Started'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="stack">
        <FormSection title="Work checklist" icon={HardHat} aside={<Chip tone={INSTALL_CHECKLIST.every((c) => d.checklist[c]) ? 'good' : 'warn'}>{INSTALL_CHECKLIST.filter((c) => d.checklist[c]).length}/{INSTALL_CHECKLIST.length}</Chip>}>
          <div className="check-grid">
            {INSTALL_CHECKLIST.map((c) => (
              <CheckField key={c} label={c} checked={!!d.checklist[c]} onChange={(v) => set('checklist', { ...d.checklist, [c]: v })} />
            ))}
          </div>
        </FormSection>

        <FormSection title="Serial re-scan and data logger" icon={ScanLine}>
          <div className="form-grid">
            <label className="field span-2">
              <span>Module serials scanned at site (one per line) *</span>
              <textarea rows={4} value={serialText} onChange={(e) => setSerialText(e.target.value)} style={{ fontFamily: 'monospace' }} placeholder={b.moduleSerials.length ? 'Scan or type each module serial' : 'No module serials were dispatched against this site'} />
              <small className="hint">
                Dispatched: {b.moduleSerials.length} · matched: {matched.length}
                {b.moduleSerials.length - matched.length > 0 && ` · missing: ${b.moduleSerials.filter((s) => !scanned.includes(s)).join(', ')}`}
              </small>
              {unexpected.length > 0 && <small className="err">Not dispatched to this site: {unexpected.join(', ')}</small>}
            </label>
            <TextField
              label="Inverter serial (re-scan)"
              required
              value={d.inverterSerialScanned}
              onChange={(v) => set('inverterSerialScanned', v.trim())}
              error={d.inverterSerialScanned && d.inverterSerialScanned !== b.inverterSerial ? `Does not match dispatched serial ${b.inverterSerial || '(none)'}` : undefined}
              hint={b.inverterSerial ? `Dispatched: ${b.inverterSerial}` : 'No inverter serial dispatched'}
            />
            <DateField label="Installation date" required value={d.installedAt?.slice(0, 10) || ''} max={today()} onChange={(v) => set('installedAt', v)} />
            <TextField label="Data logger ID" required value={d.loggerId} onChange={(v) => set('loggerId', v)} />
            <TextField label="M2M SIM number" required value={d.simNo} onChange={(v) => set('simNo', v)} />
            <CheckField label="Data logger live (sending data)" checked={d.loggerLive} onChange={(v) => set('loggerLive', v)} />
          </div>
        </FormSection>

        <FormSection title="Post-installation geotagged photos" icon={Camera} aside={<Chip tone={INSTALL_PHOTOS.every((p) => d.photos[p]) ? 'good' : 'warn'}>{INSTALL_PHOTOS.filter((p) => d.photos[p]).length}/{INSTALL_PHOTOS.length}</Chip>}>
          <PhotoSlots slots={INSTALL_PHOTOS} value={d.photos} disabled={readOnly || d.status === 'Not Started'} onChange={(p) => persistEvidence({ photos: p }, 'Installation photos updated')} />
        </FormSection>

        <FormSection title="Report, handover and performance" icon={FileSignature}>
          <div className="form-grid">
            <FileField label="Installation report (signed by consumer and RBP)" required value={d.installReport} onChange={(f) => persistEvidence({ installReport: f }, f ? 'Installation report uploaded' : 'Installation report removed')} disabled={readOnly || d.status === 'Not Started'} />
            <NumberField label="PR reading (%)" required min={0} max={100} value={d.prReading} onChange={(v) => set('prReading', v)} hint={`Commissioning needs ≥ ${settings.minPrCommissioning}%`} error={d.prReading > 0 && d.prReading < settings.minPrCommissioning ? `Below ${settings.minPrCommissioning}% — check before submitting` : undefined} />
            <CheckField label="Consumer signed the installation report" checked={d.consumerSigned} onChange={(v) => set('consumerSigned', v)} />
            <CheckField label="Consumer trained on operation and safety" checked={d.trainingDone} onChange={(v) => set('trainingDone', v)} />
            <CheckField label="O&M manual and warranty card handed over (English and Hindi)" checked={d.omManualHanded} onChange={(v) => set('omManualHanded', v)} />
            <TextArea label="Remarks" span2 value={d.remarks} onChange={(v) => set('remarks', v)} />
          </div>
        </FormSection>
      </fieldset>

      {!readOnly && d.status !== 'Not Started' && <GateBox missing={missing} okText="All fields and photos complete — ready to submit to QC" />}
      <small className="muted">
        <Gauge className="w-3 h-3 inline" /> Site goes to QC only when every field and photo is filled.
      </small>
    </Modal>
  )
}
