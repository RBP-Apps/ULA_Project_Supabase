'use client'

import React, { useState } from 'react'
import { Save, Lock } from 'lucide-react'
import { Modal, TextField, NumberField, NoteBanner, FormSection, reportSave, useUserName } from '../ui'
import { useBeneficiaries } from '@/lib/ula/data'
import { upsert, newId, logActivity } from '@/lib/ula/storage'
import { blankBeneficiary, nowIso } from '@/lib/ula/workflow'
import type { Beneficiary, Lot } from '@/lib/ula/types'

/** Add a beneficiary to an unlocked lot, or edit one. Once the list is locked only the admin mapping can change. */
export function BeneficiaryFormModal({ lot, initial, onClose }: { lot: Lot; initial?: Beneficiary; onClose: () => void }) {
  const all = useBeneficiaries()
  const user = useUserName()
  const [b, setB] = useState<Beneficiary>(
    initial || blankBeneficiary({ id: '', lotId: lot.id, district: lot.district, division: lot.division })
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const locked = lot.listLocked
  const set = <K extends keyof Beneficiary>(k: K, v: Beneficiary[K]) => setB((x) => ({ ...x, [k]: v }))

  const submit = () => {
    const e: Record<string, string> = {}
    if (!locked) {
      if (!b.appNo.trim()) e.appNo = 'Required'
      else if (all.some((x) => x.id !== b.id && x.appNo.trim().toLowerCase() === b.appNo.trim().toLowerCase()))
        e.appNo = 'This application number already exists'
      if (!b.name.trim()) e.name = 'Required'
      if (!b.address.trim()) e.address = 'Required'
      if (!/^\d{10}$/.test(b.mobile.replace(/\D/g, '').slice(-10))) e.mobile = 'Enter a 10-digit mobile number'
      if (!b.consumerNo.trim()) e.consumerNo = 'Required'
      if (!(b.sanctionedKw > 0)) e.sanctionedKw = 'Must be greater than 0'
    }
    if (!b.district.trim()) e.district = 'Required'
    setErrors(e)
    if (Object.keys(e).length) return
    const isNew = !b.id
    const saved = { ...b, id: b.id || newId('BEN'), updatedAt: nowIso() }
    if (reportSave(upsert('beneficiaries', saved), isNew ? `${saved.name} added to ${lot.lotNo}` : `${saved.name} updated`)) {
      logActivity(user, 'Beneficiary', saved.id, isNew ? `Added manually to ${lot.lotNo}` : locked ? 'Admin mapping updated' : 'Details edited')
      onClose()
    }
  }

  return (
    <Modal
      eyebrow={`Lot ${lot.lotNo}`}
      title={initial ? `Edit ${initial.name}` : 'Add beneficiary'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> Save
          </button>
        </>
      }
    >
      {locked && (
        <NoteBanner>
          <Lock className="w-3.5 h-3.5 inline" /> The beneficiary list for this lot is locked (Sec-1 cl. 2.4): identity fields cannot be changed. Only district / division / sub-division / AE mapping can be corrected.
        </NoteBanner>
      )}
      <FormSection title="Identity (from CSPDCL list)">
        <div className="form-grid">
          <TextField label="PM Surya Ghar application no." required value={b.appNo} onChange={(v) => set('appNo', v)} error={errors.appNo} disabled={locked} />
          <TextField label="Beneficiary name" required value={b.name} onChange={(v) => set('name', v)} error={errors.name} disabled={locked} />
          <TextField label="Mobile" required value={b.mobile} onChange={(v) => set('mobile', v)} error={errors.mobile} disabled={locked} />
          <TextField label="Consumer (BP) no." required value={b.consumerNo} onChange={(v) => set('consumerNo', v)} error={errors.consumerNo} disabled={locked} />
          <NumberField label="Sanctioned kW" required value={b.sanctionedKw} onChange={(v) => set('sanctionedKw', v)} error={errors.sanctionedKw} disabled={locked} min={0} />
          <TextField label="Address" required span2 value={b.address} onChange={(v) => set('address', v)} error={errors.address} disabled={locked} />
        </div>
      </FormSection>
      <FormSection title="Administrative mapping">
        <div className="form-grid">
          <TextField label="District" required value={b.district} onChange={(v) => set('district', v)} error={errors.district} />
          <TextField label="Division" value={b.division} onChange={(v) => set('division', v)} />
          <TextField label="Sub-division" value={b.subDivision} onChange={(v) => set('subDivision', v)} />
          <TextField label="AE name" value={b.aeName} onChange={(v) => set('aeName', v)} />
        </div>
      </FormSection>
    </Modal>
  )
}
