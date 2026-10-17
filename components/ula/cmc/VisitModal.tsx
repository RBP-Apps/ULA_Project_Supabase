'use client'

import React, { useState } from 'react'
import { Save } from 'lucide-react'
import { Modal, SelectField, DateField, NumberField, TextArea, CheckField, FormSection, PhotoList, GateBox, reportSave, toast, useUserName } from '../ui'
import { upsert, newId, logActivity } from '@/lib/ula/storage'
import { today, useSettings } from '@/lib/ula/workflow'
import type { Beneficiary, CmcVisit } from '@/lib/ula/types'
import { CMC_CHECKS, CMC_QUARTERS, quarterDue, visitFor } from './cmc-logic'

export function VisitModal({
  sites,
  visits,
  initial,
  preset,
  onClose,
}: {
  sites: Beneficiary[]
  visits: CmcVisit[]
  initial?: CmcVisit
  preset?: { beneficiaryId: string; quarter: number }
  onClose: () => void
}) {
  const settings = useSettings()
  const user = useUserName()
  const [v, setV] = useState<CmcVisit>(
    initial || {
      id: '',
      beneficiaryId: preset?.beneficiaryId || '',
      quarter: preset?.quarter || 0,
      visitDate: today(),
      cleaning: false,
      checks: {},
      pr: 0,
      cuf: 0,
      photos: [],
      by: user,
      remarks: '',
    }
  )
  const site = sites.find((s) => s.id === v.beneficiaryId)

  const save = () => {
    const errs: string[] = []
    if (!site) errs.push('Select a commissioned site')
    if (!(v.quarter >= 1 && v.quarter <= CMC_QUARTERS)) errs.push('Select the CMC quarter')
    if (!v.visitDate) errs.push('Visit date')
    if (site && v.visitDate && v.visitDate < site.commissioning.commissionedDate) errs.push('Visit date is before commissioning')
    if (v.visitDate > today()) errs.push('Visit date cannot be in the future')
    if (site && v.quarter && visitFor(visits, site.id, v.quarter) && visitFor(visits, site.id, v.quarter)!.id !== v.id) errs.push(`Q${v.quarter} visit already logged for this site`)
    if (!v.cleaning) errs.push('Module cleaning must be done on every quarterly visit')
    if (!(v.pr > 0 && v.pr <= 100)) errs.push('PR % (0–100)')
    if (!(v.cuf > 0 && v.cuf <= 100)) errs.push('CUF % (0–100)')
    if (!v.photos.length) errs.push('At least one geotagged visit photo')
    if (errs.length) return toast(`Cannot save: ${errs.join('; ')}`, 'error')
    const isNew = !v.id
    const rec = { ...v, id: v.id || newId('CMV') }
    if (reportSave(upsert('cmcVisits', rec), `Q${rec.quarter} visit saved for ${site!.name}`)) {
      logActivity(user, 'Beneficiary', rec.beneficiaryId, `CMC Q${rec.quarter} visit ${isNew ? 'logged' : 'edited'} (PR ${rec.pr}%, CUF ${rec.cuf}%)`)
      onClose()
    }
  }

  const low = (v.pr > 0 && v.pr < settings.minPrCommissioning) || (v.cuf > 0 && v.cuf < settings.minCufCmc)

  return (
    <Modal
      eyebrow="CMC & Service"
      title={initial ? 'Edit CMC visit' : 'Log quarterly CMC visit'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> Save visit
          </button>
        </>
      }
    >
      <div className="form-grid">
        <SelectField
          label="Site"
          required
          disabled={!!initial}
          value={v.beneficiaryId}
          onChange={(id) => setV({ ...v, beneficiaryId: id })}
          options={sites.map((s) => ({ value: s.id, label: `${s.appNo} — ${s.name}` }))}
        />
        <SelectField
          label="CMC quarter"
          required
          disabled={!!initial}
          value={v.quarter ? String(v.quarter) : ''}
          onChange={(q) => setV({ ...v, quarter: Number(q) })}
          options={Array.from({ length: CMC_QUARTERS }, (_, i) => ({
            value: String(i + 1),
            label: `Q${i + 1}${site ? ` — ends ${quarterDue(site.commissioning.commissionedDate, i + 1)}` : ''}${site && visitFor(visits, site.id, i + 1) ? ' (logged)' : ''}`,
          }))}
        />
        <DateField label="Visit date" required value={v.visitDate} max={today()} onChange={(d) => setV({ ...v, visitDate: d })} />
        <div />
        <NumberField label="PR %" required value={v.pr} min={0} max={100} onChange={(n) => setV({ ...v, pr: n })} hint={`Minimum ${settings.minPrCommissioning}%`} />
        <NumberField label="CUF %" required value={v.cuf} min={0} max={100} onChange={(n) => setV({ ...v, cuf: n })} hint={`Minimum ${settings.minCufCmc}%`} />
      </div>
      {low && <GateBox missing={['Site below PR / CUF threshold — the lot’s CMC bill for this quarter will be blocked; raise a complaint ticket for corrective action.']} okText="" title="Performance below tender threshold" />}
      <FormSection title="Checks">
        <CheckField label="Module cleaning done" checked={v.cleaning} onChange={(c) => setV({ ...v, cleaning: c })} />
        <div className="check-grid">
          {CMC_CHECKS.map((c) => (
            <CheckField key={c} label={c} checked={!!v.checks[c]} onChange={(x) => setV({ ...v, checks: { ...v.checks, [c]: x } })} />
          ))}
        </div>
      </FormSection>
      <FormSection title="Visit photos (geotagged)">
        <PhotoList value={v.photos} onChange={(p) => setV({ ...v, photos: p })} min={1} />
      </FormSection>
      <TextArea label="Remarks" value={v.remarks} onChange={(r) => setV({ ...v, remarks: r })} />
    </Modal>
  )
}
