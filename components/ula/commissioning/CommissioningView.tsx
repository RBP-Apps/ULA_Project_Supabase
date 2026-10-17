'use client'

import React, { useMemo, useState } from 'react'
import { PackageCheck, Eye, Save, BadgeCheck } from 'lucide-react'
import {
  PageHeader,
  MiniStat,
  Tabs,
  Modal,
  EmptyBlock,
  Chip,
  GateBox,
  FormSection,
  DateField,
  NumberField,
  TextArea,
  FileField,
  CheckField,
  NoteBanner,
  usePaged,
  Pager,
  reportSave,
  useUserName,
} from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { useBeneficiaries, useLots, useLotMap, updateBeneficiary } from '@/lib/ula/data'
import { useCollection } from '@/lib/ula/storage'
import { stageOf, commissioningGate, annexGSteps, useSettings, fmtDate, today, siteDueDate, daysBetween } from '@/lib/ula/workflow'
import type { Beneficiary, CommissioningData, Docket } from '@/lib/ula/types'
import { QueueToolbar, matchesBen, isLotBilled } from '../jcr/common'

const TABS = ['Pending', 'Commissioned', 'Annex G timers'] as const
type Tab = (typeof TABS)[number]

export function CommissioningView() {
  const bens = useBeneficiaries()
  const lots = useLots()
  const lotMap = useLotMap()
  const dockets = useCollection<Docket>('dockets')
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('Pending')
  const [q, setQ] = useState('')
  const [lotId, setLotId] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)

  const pending = useMemo(() => bens.filter((b) => stageOf(b) === 'Commissioning'), [bens])
  const commissioned = useMemo(() => bens.filter((b) => stageOf(b) === 'Commissioned'), [bens])
  const timed = useMemo(() => bens.filter((b) => ['Inspection', 'Commissioning', 'Commissioned'].includes(stageOf(b))), [bens])

  const filt = (b: Beneficiary) => (!lotId || b.lotId === lotId) && matchesBen(b, q)
  const pRows = usePaged(pending.filter(filt), 25)
  const cRows = usePaged(commissioned.filter(filt), 25)
  const tRows = usePaged(timed.filter(filt), 25)

  const lowPr = commissioned.filter((b) => b.commissioning.prAtCommissioning < settings.minPrCommissioning).length
  const kwDone = commissioned.reduce((a, b) => a + b.sanctionedKw, 0)
  const meterLate = pending.filter((b) => annexGSteps(b, settings.sla).some((s) => s.side === 'CSPDCL' && s.overBy > 0 && !s.end)).length

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="CSPDCL Process · Stage 11b"
        title="Inspection & Commissioning"
        description="Net-meter installation, portal-generated commissioning certificate signed by CSPDCL, and PR at commissioning (≥ 75%). A site counts as commissioned only with signed JIR and certificate uploaded."
      />

      <div className="mini-stats">
        <MiniStat label="Awaiting meter / certificate" value={pending.length} onClick={() => setTab('Pending')} active={tab === 'Pending'} />
        <MiniStat label="CSPDCL step overdue" value={meterLate} tone={meterLate ? 'bad' : undefined} hint="Annex G metering / commissioning" />
        <MiniStat label="Commissioned sites" value={commissioned.length} tone="good" hint={`${kwDone} kW`} onClick={() => setTab('Commissioned')} active={tab === 'Commissioned'} />
        <MiniStat label="Minimum PR" value={`${settings.minPrCommissioning}%`} hint={lowPr ? `${lowPr} below threshold` : 'Sec-5 cl. 12.8'} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Pending: pending.length, Commissioned: commissioned.length }} />

      <section className="card table-card">
        <QueueToolbar q={q} setQ={setQ} lotId={lotId} setLotId={setLotId} lots={lots} />

        {tab === 'Pending' &&
          (pRows.total === 0 ? (
            <EmptyBlock icon={PackageCheck} title="No sites awaiting commissioning" text="Sites arrive here after the JIR is complete in JCR Status." />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Beneficiary</th>
                      <th>Lot / due</th>
                      <th>Inspected</th>
                      <th>Meter installed</th>
                      <th>Certificate</th>
                      <th>PR</th>
                      <th>Missing</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pRows.slice.map((b) => {
                      const lot = lotMap.get(b.lotId)
                      const due = lot ? siteDueDate(b, lot, settings.sla) : ''
                      const missing = commissioningGate(b, settings)
                      const c = b.commissioning
                      return (
                        <tr key={b.id}>
                          <td>
                            <div className="cell-title">
                              <strong>{b.name}</strong>
                              <small>
                                {b.appNo} · {b.sanctionedKw} kW
                              </small>
                            </div>
                          </td>
                          <td>
                            <div className="cell-title">
                              <strong>{lot?.lotNo || '—'}</strong>
                              {due && <small style={{ color: daysBetween(today(), due) < 0 ? '#c2484d' : undefined }}>Due {fmtDate(due)}</small>}
                            </div>
                          </td>
                          <td>{fmtDate(c.inspectionDate)}</td>
                          <td>{c.meterInstalledDate ? fmtDate(c.meterInstalledDate) : <Chip tone="warn">Pending</Chip>}</td>
                          <td>{c.certificate ? <Chip tone={c.certificateSigned ? 'good' : 'warn'}>{c.certificateSigned ? 'Signed' : 'Unsigned'}</Chip> : <Chip>Not uploaded</Chip>}</td>
                          <td>{c.prAtCommissioning ? `${c.prAtCommissioning}%` : '—'}</td>
                          <td>
                            <Chip tone="warn">{missing.length} item(s)</Chip>
                          </td>
                          <td className="text-right">
                            <div className="row-actions">
                              <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" className="primary-btn btn-sm" onClick={() => setEdit(b.id)}>
                                <BadgeCheck className="w-3 h-3" /> Commission
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...pRows} />
            </>
          ))}

        {tab === 'Commissioned' &&
          (cRows.total === 0 ? (
            <EmptyBlock title="No commissioned sites yet" />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Beneficiary</th>
                      <th>Lot</th>
                      <th>Meter installed</th>
                      <th>Commissioned</th>
                      <th>PR at commissioning</th>
                      <th>Warranty cert.</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cRows.slice.map((b) => {
                      const c = b.commissioning
                      const billed = isLotBilled(dockets, b.lotId)
                      return (
                        <tr key={b.id}>
                          <td>
                            <div className="cell-title">
                              <strong>{b.name}</strong>
                              <small>
                                {b.appNo} · {b.sanctionedKw} kW
                              </small>
                            </div>
                          </td>
                          <td>{lotMap.get(b.lotId)?.lotNo || '—'}</td>
                          <td>{fmtDate(c.meterInstalledDate)}</td>
                          <td>{fmtDate(c.commissionedDate)}</td>
                          <td>
                            <Chip tone={c.prAtCommissioning >= settings.minPrCommissioning ? 'good' : 'bad'}>{c.prAtCommissioning}%</Chip>
                          </td>
                          <td>{c.warrantyCertificate ? <Chip tone="good">Uploaded</Chip> : <Chip tone="warn">Missing — needed for docket</Chip>}</td>
                          <td className="text-right">
                            <div className="row-actions">
                              <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {billed ? (
                                <Chip>Docket submitted</Chip>
                              ) : (
                                <button type="button" className="outline-btn btn-sm" onClick={() => setEdit(b.id)}>
                                  Edit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...cRows} />
            </>
          ))}

        {tab === 'Annex G timers' &&
          (tRows.total === 0 ? (
            <EmptyBlock title="No sites past portal upload yet" />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Beneficiary</th>
                      <th>Lot</th>
                      <th>Upload → inspection</th>
                      <th>Inspection → meter</th>
                      <th>Meter → commissioning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tRows.slice.map((b) => {
                      const steps = annexGSteps(b, settings.sla)
                      const cell = (name: string) => {
                        const s = steps.find((x) => x.step === name)
                        if (!s) return <span className="muted">Not started</span>
                        return (
                          <Chip tone={s.overBy > 0 ? 'bad' : s.end ? 'good' : 'info'}>
                            {s.usedWorkingDays}/{s.allowedWorkingDays} wd{s.overBy ? ` · +${s.overBy}` : ''}
                            {s.end ? '' : ' · running'}
                          </Chip>
                        )
                      }
                      return (
                        <tr key={b.id}>
                          <td>
                            <div className="cell-title">
                              <strong>{b.name}</strong>
                              <small>{b.appNo}</small>
                            </div>
                          </td>
                          <td>{lotMap.get(b.lotId)?.lotNo}</td>
                          <td>{cell('CSPDCL inspection after upload')}</td>
                          <td>{cell('Net-meter installation after inspection')}</td>
                          <td>{cell('Commissioning after metering')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...tRows} />
            </>
          ))}
      </section>

      {edit && <CommissionModal id={edit} onClose={() => setEdit(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </div>
  )
}

function CommissionModal({ id, onClose }: { id: string; onClose: () => void }) {
  const bens = useBeneficiaries()
  const settings = useSettings()
  const user = useUserName()
  const b = bens.find((x) => x.id === id)
  const [c, setC] = useState<CommissioningData | null>(b ? { ...b.commissioning } : null)
  const [err, setErr] = useState('')
  if (!b || !c) return null
  const already = !!b.commissioning.commissionedDate
  const set = <K extends keyof CommissioningData>(k: K, v: CommissioningData[K]) => setC({ ...c, [k]: v })
  const missing = commissioningGate({ ...b, commissioning: c }, settings)
  const prLow = c.prAtCommissioning > 0 && c.prAtCommissioning < settings.minPrCommissioning

  const validDates = () => {
    if (c.meterInstalledDate && c.meterInstalledDate < c.inspectionDate) return 'Meter installation cannot be before the inspection date.'
    if (c.commissionedDate && c.meterInstalledDate && c.commissionedDate < c.meterInstalledDate) return 'Commissioning date cannot be before meter installation.'
    if ((c.meterInstalledDate && c.meterInstalledDate > today()) || (c.commissionedDate && c.commissionedDate > today())) return 'Dates cannot be in the future.'
    if (c.prAtCommissioning > 100 || c.prAtCommissioning < 0) return 'PR must be between 0 and 100%.'
    return ''
  }

  // Draft save keeps the site un-commissioned unless it was already commissioned (edit).
  const saveDraft = () => {
    const e = validDates()
    setErr(e)
    if (e) return
    const next = already ? c : { ...c, commissionedDate: '' }
    if (already && missing.length) return setErr('A commissioned record cannot be saved with missing items.')
    if (reportSave(updateBeneficiary(id, (x) => ({ ...x, commissioning: next }), user, already ? 'Commissioning record edited' : 'Commissioning details saved (pending)'), 'Saved')) onClose()
  }

  const markCommissioned = () => {
    const e = validDates()
    setErr(e)
    if (e || missing.length) return
    const ok = updateBeneficiary(id, (x) => ({ ...x, commissioning: c }), user, `Commissioned on ${c.commissionedDate} — PR ${c.prAtCommissioning}%`)
    if (reportSave(ok, `${b.name} commissioned`)) onClose()
  }

  return (
    <Modal
      eyebrow={`Application ${b.appNo}`}
      title={`Net metering & commissioning — ${b.name}`}
      subtitle={`JIR inspected ${fmtDate(c.inspectionDate)} by AE ${c.aeName || '—'}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="outline-btn" onClick={saveDraft}>
            <Save className="w-4 h-4" /> {already ? 'Save changes' : 'Save draft'}
          </button>
          {!already && (
            <button type="button" className="primary-btn" disabled={missing.length > 0} onClick={markCommissioned} title={missing.length ? 'Complete every item first' : ''}>
              <BadgeCheck className="w-4 h-4" /> Mark commissioned
            </button>
          )}
        </>
      }
    >
      <FormSection title="Net metering">
        <div className="form-grid">
          <DateField label="Net-meter installation date" required value={c.meterInstalledDate} min={c.inspectionDate} max={today()} onChange={(v) => set('meterInstalledDate', v)} />
        </div>
      </FormSection>
      <FormSection title="Commissioning certificate">
        <div className="form-grid">
          <FileField label="Portal-generated commissioning certificate" required value={c.certificate} onChange={(f) => set('certificate', f)} />
          <div className="field">
            <span>&nbsp;</span>
            <CheckField label="Signed by CSPDCL official" checked={c.certificateSigned} onChange={(v) => set('certificateSigned', v)} />
          </div>
          <NumberField
            label="PR at commissioning (%)"
            required
            min={0}
            max={100}
            value={c.prAtCommissioning}
            onChange={(v) => set('prAtCommissioning', v)}
            error={prLow ? `Below the ${settings.minPrCommissioning}% minimum (Sec-5 cl. 12.8) — site cannot be commissioned` : undefined}
            hint={`Minimum ${settings.minPrCommissioning}%`}
          />
          <DateField label="Commissioning date" required value={c.commissionedDate} min={c.meterInstalledDate} max={today()} onChange={(v) => set('commissionedDate', v)} />
        </div>
      </FormSection>
      <FormSection title="For the lot docket">
        <div className="form-grid">
          <FileField label="Warranty certificate" value={c.warrantyCertificate} onChange={(f) => set('warrantyCertificate', f)} hint="Not needed to commission, but required before the lot can be billed." />
        </div>
      </FormSection>
      <TextArea label="Remarks" value={c.remarks} onChange={(v) => set('remarks', v)} />
      {err && (
        <div className="gate-box bad">
          <strong>{err}</strong>
        </div>
      )}
      {already ? (
        <NoteBanner>This site is already commissioned. Edits are logged; they are locked once the lot docket is submitted.</NoteBanner>
      ) : (
        <GateBox missing={missing} okText="All commissioning evidence present — ready to mark commissioned." />
      )}
    </Modal>
  )
}
