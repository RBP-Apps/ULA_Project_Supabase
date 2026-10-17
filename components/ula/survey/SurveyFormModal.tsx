'use client'

import React, { useEffect, useState } from 'react'
import { Save, Send, CheckCircle2, Undo2, ClipboardCheck, Camera, PenLine, AlertTriangle, RotateCcw } from 'lucide-react'
import {
  Modal,
  FormSection,
  TextField,
  NumberField,
  DateField,
  SelectField,
  TextArea,
  CheckField,
  FileField,
  PhotoList,
  GateBox,
  NoteBanner,
  FileChip,
  Chip,
  reportSave,
  toast,
  useUserName,
} from '../ui'
import { SignaturePad } from './SignaturePad'
import { useBeneficiaries, useLotMap, updateBeneficiary } from '@/lib/ula/data'
import { deleteFile } from '@/lib/ula/files'
import {
  surveyGate,
  ROOF_TYPES,
  STRUCTURE_TYPES,
  ORIENTATIONS,
  SHADE_LEVELS,
  SURVEY_PHOTO_MIN,
  stageOf,
  nowIso,
  today,
  addDays,
  useSettings,
  fmtDate,
  fmtDateTime,
} from '@/lib/ula/workflow'
import type { SurveyData } from '@/lib/ula/types'

const RTS_NOTE = 'Existing rooftop solar found — household ineligible (Sec-1 cl. 1.2)'

export function SurveyFormModal({ id, onClose }: { id: string; onClose: () => void }) {
  const bens = useBeneficiaries()
  const lots = useLotMap()
  const settings = useSettings()
  const user = useUserName()
  const b = bens.find((x) => x.id === id)
  const [s, setS] = useState<SurveyData | null>(b ? b.survey : null)
  const [sigMode, setSigMode] = useState<'pad' | 'upload'>('pad')

  useEffect(() => {
    if (b && !s) setS(b.survey)
  }, [b, s])

  if (!b || !s) {
    return (
      <Modal title="Beneficiary not found" onClose={onClose}>
        <p className="muted">This record no longer exists.</p>
      </Modal>
    )
  }

  const lot = lots.get(b.lotId)
  const editable = s.status === 'Pending' || s.status === 'Returned'
  const reviewing = b.survey.status === 'Submitted'
  const missing = surveyGate({ ...b, survey: s })
  const due = lot ? addDays(lot.allotmentDate, settings.sla.surveyDays) : ''
  const canReopen = b.survey.status === 'Accepted' && b.design.status !== 'Approved' && b.design.status !== 'Submitted' && !b.dispatchId

  const set = <K extends keyof SurveyData>(k: K, v: SurveyData[K]) =>
    setS((x) => {
      if (!x) return x
      const next = { ...x, [k]: v }
      if (k === 'existingRts' && v === 'Yes') {
        next.feasible = 'No'
        if (!next.feasibilityRemarks.trim()) next.feasibilityRemarks = RTS_NOTE
      }
      return next
    })

  /** Files are written immediately so the stored record never points at a removed file. */
  const setFile = (patchS: Partial<SurveyData>) => {
    const next = { ...s, ...patchS }
    setS(next)
    updateBeneficiary(b.id, (x) => ({ ...x, survey: { ...x.survey, ...patchS } }), user)
  }

  const persist = (next: SurveyData, msg: string, action: string) => {
    if (reportSave(updateBeneficiary(b.id, (x) => ({ ...x, survey: next }), user, action), msg)) {
      setS(next)
      return true
    }
    return false
  }

  const saveDraft = () => persist({ ...s, surveyor: s.surveyor || user }, 'Survey draft saved', 'Survey draft saved')

  const submit = () => {
    if (missing.length) return toast(`Cannot submit — ${missing.length} item(s) missing`, 'error')
    if (persist({ ...s, surveyor: s.surveyor || user, status: 'Submitted', submittedAt: nowIso(), returnReason: undefined }, 'Survey submitted for review', 'Survey submitted')) onClose()
  }

  const accept = () => {
    const gate = surveyGate(b)
    if (gate.length) return toast('Stored survey is incomplete; return it to the surveyor.', 'error')
    const next: SurveyData = { ...b.survey, status: 'Accepted', acceptedAt: nowIso(), cspdclReview: b.survey.feasible === 'No' && b.survey.existingRts !== 'Yes' ? 'Pending' : b.survey.cspdclReview }
    const msg =
      b.survey.existingRts === 'Yes'
        ? 'Survey accepted — site dropped (existing rooftop solar)'
        : b.survey.feasible === 'No'
          ? 'Survey accepted — site sent for CSPDCL review (not feasible)'
          : 'Survey accepted — site moves to Design'
    if (persist(next, msg, `Survey accepted${b.survey.feasible === 'No' ? ' (not feasible)' : ''}`)) onClose()
  }

  const returnSurvey = () => {
    const reason = window.prompt('Reason for returning this survey to the surveyor:')
    if (!reason?.trim()) return
    if (persist({ ...b.survey, status: 'Returned', returnReason: reason.trim() }, 'Survey returned to surveyor', `Survey returned: ${reason.trim()}`)) onClose()
  }

  const reopen = () => {
    const reason = window.prompt('Reason for reopening this accepted survey:')
    if (!reason?.trim()) return
    persist({ ...b.survey, status: 'Returned', returnReason: reason.trim(), acceptedAt: undefined, cspdclReview: '', cspdclReviewDate: undefined, cspdclReviewRemarks: undefined }, 'Survey reopened for correction', `Survey reopened: ${reason.trim()}`)
  }

  return (
    <Modal
      size="wide"
      eyebrow={`${lot?.lotNo || ''} · Application ${b.appNo}`}
      title={`Survey — ${b.name}`}
      subtitle={`${b.sanctionedKw} kW · ${b.address} · ${b.mobile} · consumer ${b.consumerNo}`}
      onClose={onClose}
      footer={
        <>
          <span style={{ marginRight: 'auto' }} className="row">
            <Chip tone={s.status === 'Accepted' ? 'good' : s.status === 'Returned' ? 'bad' : s.status === 'Submitted' ? 'info' : 'warn'}>{s.status}</Chip>
            <small className="muted">Stage: {stageOf(b)}</small>
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
          {editable && (
            <>
              <button type="button" className="outline-btn" onClick={saveDraft}>
                <Save className="w-4 h-4" /> Save draft
              </button>
              <button type="button" className="primary-btn" onClick={submit} disabled={missing.length > 0} title={missing.length ? 'Complete every required item first' : ''}>
                <Send className="w-4 h-4" /> Submit survey
              </button>
            </>
          )}
          {reviewing && (
            <>
              <button type="button" className="danger-btn" onClick={returnSurvey}>
                <Undo2 className="w-4 h-4" /> Return
              </button>
              <button type="button" className="primary-btn" onClick={accept}>
                <CheckCircle2 className="w-4 h-4" /> Accept survey
              </button>
            </>
          )}
          {canReopen && (
            <button type="button" className="outline-btn" onClick={reopen}>
              <RotateCcw className="w-4 h-4" /> Reopen
            </button>
          )}
        </>
      }
    >
      {s.status === 'Returned' && s.returnReason && (
        <div className="gate-box bad">
          <strong>
            <AlertTriangle className="w-4 h-4" /> Returned: {s.returnReason}
          </strong>
        </div>
      )}
      {due && s.status !== 'Accepted' && (
        <NoteBanner>
          Feasibility and survey report due {fmtDate(due)} (lot D0 + {settings.sla.surveyDays} days, Corr-1 cl. 1.5).
          {today() > due ? ' This survey is past the tender limit.' : ''}
        </NoteBanner>
      )}
      {editable && <GateBox missing={missing} okText="All survey items captured — ready to submit" />}
      {reviewing && <NoteBanner>Submitted {fmtDateTime(s.submittedAt)} by {s.surveyor || 'surveyor'}. Review photos and details, then accept or return.</NoteBanner>}

      <FormSection title="Site assessment" icon={ClipboardCheck}>
        <div className="form-grid">
          <DateField label="Survey date" required value={s.surveyDate} max={today()} onChange={(v) => set('surveyDate', v)} disabled={!editable} />
          <TextField label="Surveyor" value={s.surveyor} placeholder={user} onChange={(v) => set('surveyor', v)} disabled={!editable} />
          <SelectField label="Roof type" required value={s.roofType} options={ROOF_TYPES} onChange={(v) => set('roofType', v)} disabled={!editable} />
          <NumberField label="Usable roof area (sq m)" required min={0} value={s.usableArea} onChange={(v) => set('usableArea', v)} disabled={!editable} hint={b.sanctionedKw ? `Typically ~10 sq m per kW → ${b.sanctionedKw * 10} sq m` : undefined} />
          <SelectField label="Shade" required value={s.shade} options={SHADE_LEVELS} onChange={(v) => set('shade', v)} disabled={!editable} />
          <SelectField label="Orientation" required value={s.orientation} options={ORIENTATIONS} onChange={(v) => set('orientation', v)} disabled={!editable} />
          <SelectField label="Structure type" required value={s.structureType} options={STRUCTURE_TYPES} onChange={(v) => set('structureType', v)} disabled={!editable} />
          <SelectField
            label="Existing rooftop solar?"
            required
            value={s.existingRts}
            options={['No', 'Yes']}
            onChange={(v) => set('existingRts', v as SurveyData['existingRts'])}
            disabled={!editable}
            error={s.existingRts === 'Yes' ? 'Ineligible — household already has rooftop solar' : undefined}
          />
          <SelectField
            label="Feasible?"
            required
            value={s.feasible}
            options={['Yes', 'No']}
            onChange={(v) => set('feasible', v as SurveyData['feasible'])}
            disabled={!editable || s.existingRts === 'Yes'}
            hint={s.feasible === 'No' && s.existingRts !== 'Yes' ? 'Non-feasible sites go to CSPDCL for review' : undefined}
          />
          <TextArea label={s.feasible === 'No' ? 'Reason not feasible *' : 'Feasibility remarks'} value={s.feasibilityRemarks} onChange={(v) => set('feasibilityRemarks', v)} disabled={!editable} />
        </div>
      </FormSection>

      <FormSection title="Electricity bill">
        <FileField label="Latest electricity bill" required value={s.electricityBill} onChange={(f) => setFile({ electricityBill: f })} disabled={!editable} accept={['.pdf', 'image/']} />
      </FormSection>

      <FormSection title={`Pre-installation geotagged photos (roof, space, shade obstacles — min ${SURVEY_PHOTO_MIN})`} icon={Camera}>
        <PhotoList value={s.photos} min={SURVEY_PHOTO_MIN} disabled={!editable} onChange={(p) => setFile({ photos: p })} />
      </FormSection>

      <FormSection
        title="Consumer signature"
        icon={PenLine}
        aside={
          editable && !s.signature ? (
            <select className="filter-select" value={sigMode} onChange={(e) => setSigMode(e.target.value as 'pad' | 'upload')} aria-label="Signature method">
              <option value="pad">Sign on screen</option>
              <option value="upload">Upload signed sheet</option>
            </select>
          ) : undefined
        }
      >
        {s.signature ? (
          <div className="row">
            <FileChip
              file={s.signature}
              disabled={!editable}
              onRemove={() => {
                deleteFile(s.signature!.id)
                setFile({ signature: undefined, consumerSigned: false })
              }}
            />
          </div>
        ) : !editable ? (
          <span className="muted" style={{ fontSize: 11 }}>No signature captured.</span>
        ) : sigMode === 'pad' ? (
          <SignaturePad onSaved={(f) => setFile({ signature: f, consumerSigned: true })} />
        ) : (
          <FileField label="Signed survey sheet / signature image" value={undefined} accept={['image/', '.pdf']} onChange={(f) => f && setFile({ signature: f, consumerSigned: true })} />
        )}
        <CheckField label="Consumer has signed the survey" checked={s.consumerSigned} onChange={(v) => set('consumerSigned', v)} disabled={!editable} />
      </FormSection>
    </Modal>
  )
}
