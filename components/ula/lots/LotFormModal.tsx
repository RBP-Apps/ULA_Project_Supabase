'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Save, BriefcaseBusiness } from 'lucide-react'
import { Modal, TextField, DateField, SelectField, TextArea, FileField, FormSection, NoteBanner, reportSave, useUserName } from '../ui'
import { useContracts, useLots } from '@/lib/ula/data'
import { upsert, newId, logActivity } from '@/lib/ula/storage'
import { nowIso, useSettings, addDays } from '@/lib/ula/workflow'
import type { Lot } from '@/lib/ula/types'

export function LotFormModal({ initial, onClose, onSaved }: { initial?: Lot; onClose: () => void; onSaved?: (lot: Lot) => void }) {
  const contracts = useContracts()
  const lots = useLots()
  const settings = useSettings()
  const user = useUserName()
  const [form, setForm] = useState<Lot>(
    initial || {
      id: '',
      lotNo: '',
      contractId: contracts.length === 1 ? contracts[0].id : '',
      allotmentLetterNo: '',
      allotmentDate: '',
      district: '',
      circle: '',
      division: '',
      listLocked: false,
      remarks: '',
      createdAt: '',
      createdBy: '',
    }
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof Lot>(k: K, v: Lot[K]) => setForm((f) => ({ ...f, [k]: v }))

  const contract = contracts.find((c) => c.id === form.contractId)

  const submit = () => {
    const e: Record<string, string> = {}
    if (!form.lotNo.trim()) e.lotNo = 'Lot number is required'
    else if (lots.some((l) => l.id !== form.id && l.lotNo.trim().toLowerCase() === form.lotNo.trim().toLowerCase()))
      e.lotNo = 'A lot with this number already exists'
    if (!form.contractId) e.contractId = 'Select the package this lot belongs to'
    if (!form.allotmentLetterNo.trim()) e.allotmentLetterNo = 'Allotment letter number is required'
    if (!form.allotmentDate) e.allotmentDate = 'Allotment date (D0) is required'
    if (!form.district.trim()) e.district = 'District is required'
    setErrors(e)
    if (Object.keys(e).length) return
    const isNew = !form.id
    const saved: Lot = {
      ...form,
      id: form.id || newId('LOT'),
      lotNo: form.lotNo.trim(),
      circle: form.circle || contract?.circle || '',
      createdAt: form.createdAt || nowIso(),
      createdBy: form.createdBy || user,
    }
    if (reportSave(upsert('lots', saved), isNew ? `Lot ${saved.lotNo} created — clock started from ${saved.allotmentDate}` : `Lot ${saved.lotNo} updated`)) {
      logActivity(user, 'Lot', saved.id, isNew ? 'Lot created' : 'Lot details edited')
      onSaved?.(saved)
      onClose()
    }
  }

  const districtOpts = settings.districts.length ? settings.districts : undefined

  return (
    <Modal
      eyebrow="Lot allotment"
      title={form.id ? `Edit lot ${initial?.lotNo}` : 'Register new lot'}
      subtitle="Lot clock starts on the allotment date (D0): feasibility report due D5, commissioning due report date + 25 days."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> Save lot
          </button>
        </>
      }
    >
      {contracts.length === 0 && (
        <NoteBanner>
          No contract package exists yet. Create one in <Link href="/contract-compliance" className="underline">Contract &amp; Compliance</Link> first — every lot belongs to a package.
        </NoteBanner>
      )}
      <FormSection title="Allotment" icon={BriefcaseBusiness}>
        <div className="form-grid">
          <TextField label="Lot number" required value={form.lotNo} onChange={(v) => set('lotNo', v)} placeholder="e.g. RPR-LOT-01" error={errors.lotNo} />
          <SelectField
            label="Package (contract)"
            required
            value={form.contractId}
            onChange={(v) => set('contractId', v)}
            options={contracts.map((c) => ({ value: c.id, label: `${c.packageCode || c.id} — ${c.contractName}` }))}
            error={errors.contractId}
          />
          <TextField label="Allotment letter no." required value={form.allotmentLetterNo} onChange={(v) => set('allotmentLetterNo', v)} error={errors.allotmentLetterNo} />
          <DateField
            label="Allotment date (D0)"
            required
            value={form.allotmentDate}
            onChange={(v) => set('allotmentDate', v)}
            error={errors.allotmentDate}
            hint={form.allotmentDate ? `Feasibility report due ${addDays(form.allotmentDate, settings.sla.surveyDays)}` : undefined}
            disabled={!!initial?.listLocked}
          />
          {districtOpts ? (
            <SelectField label="District" required value={form.district} onChange={(v) => set('district', v)} options={districtOpts} error={errors.district} />
          ) : (
            <TextField label="District" required value={form.district} onChange={(v) => set('district', v)} error={errors.district} hint="Add districts in Settings to get a dropdown" />
          )}
          <TextField label="Circle" value={form.circle} onChange={(v) => set('circle', v)} placeholder={contract?.circle || ''} />
          <TextField label="Division" value={form.division} onChange={(v) => set('division', v)} />
          <FileField label="Allotment letter" value={form.allotmentLetter} onChange={(f) => set('allotmentLetter', f)} />
          <TextArea label="Remarks" span2 value={form.remarks} onChange={(v) => set('remarks', v)} />
        </div>
      </FormSection>
    </Modal>
  )
}
