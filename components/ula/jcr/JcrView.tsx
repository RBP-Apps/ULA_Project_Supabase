'use client'

import React, { useMemo, useState } from 'react'
import { ClipboardCheck, Eye, FileSignature, Download, Save } from 'lucide-react'
import {
  PageHeader,
  MiniStat,
  Tabs,
  Modal,
  EmptyBlock,
  Chip,
  GateBox,
  NoteBanner,
  FormSection,
  DateField,
  TextField,
  TextArea,
  FileField,
  CheckField,
  usePaged,
  Pager,
  reportSave,
  useUserName,
} from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { useBeneficiaries, useLots, useLotMap, updateBeneficiary } from '@/lib/ula/data'
import { useCollection } from '@/lib/ula/storage'
import { stageOf, jirGate, jirComplete, annexGSteps, useSettings, fmtDate, fmtDateTime, downloadCsv, today } from '@/lib/ula/workflow'
import type { Beneficiary, CommissioningData, Docket } from '@/lib/ula/types'
import { QueueToolbar, matchesBen, isLotBilled } from './common'

const TABS = ['Pending inspection', 'JIR complete', 'Delay evidence'] as const
type Tab = (typeof TABS)[number]

export function JcrView() {
  const bens = useBeneficiaries()
  const lots = useLots()
  const lotMap = useLotMap()
  const dockets = useCollection<Docket>('dockets')
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('Pending inspection')
  const [q, setQ] = useState('')
  const [lotId, setLotId] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)

  const pending = useMemo(() => bens.filter((b) => stageOf(b) === 'Inspection'), [bens])
  const done = useMemo(() => bens.filter((b) => jirComplete(b) && stageOf(b) !== 'Dropped'), [bens])
  const delays = useMemo(
    () =>
      bens
        .map((b) => ({ b, steps: annexGSteps(b, settings.sla).filter((s) => s.side === 'CSPDCL' && s.overBy > 0) }))
        .filter((r) => r.steps.length),
    [bens, settings.sla]
  )

  const inspectStep = (b: Beneficiary) => annexGSteps(b, settings.sla).find((s) => s.step === 'CSPDCL inspection after upload')
  const overdueInspect = pending.filter((b) => (inspectStep(b)?.overBy || 0) > 0).length

  const filt = (b: Beneficiary) => (!lotId || b.lotId === lotId) && matchesBen(b, q)
  const pendingRows = pending.filter(filt)
  const doneRows = done.filter(filt)
  const delayRows = delays.filter((r) => filt(r.b))
  const pPend = usePaged(pendingRows, 25)
  const pDone = usePaged(doneRows, 25)
  const pDelay = usePaged(delayRows, 25)

  const exportDelays = () =>
    downloadCsv(`cspdcl-delay-evidence-${today()}.csv`, [
      ['Lot', 'Application No', 'Beneficiary', 'Step', 'Started', 'Completed', 'Allowed working days', 'Used working days', 'Over by'],
      ...delayRows.flatMap((r) =>
        r.steps.map((s) => [lotMap.get(r.b.lotId)?.lotNo, r.b.appNo, r.b.name, s.step, s.start, s.end || 'Pending', s.allowedWorkingDays, s.usedWorkingDays, s.overBy])
      ),
    ])

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="CSPDCL Process · Stage 11a"
        title="JCR Status — Inspection & JIR"
        description="Record CSPDCL inspection and the Joint Inspection Report signed by consumer, AE and RBP. Annex G gives CSPDCL 5 working days after portal upload; overruns are logged as delay evidence."
      />

      <div className="mini-stats">
        <MiniStat label="Awaiting inspection / JIR" value={pending.length} onClick={() => setTab('Pending inspection')} active={tab === 'Pending inspection'} />
        <MiniStat label="Inspection beyond Annex G" value={overdueInspect} tone={overdueInspect ? 'bad' : undefined} hint={`> ${settings.sla.cspdclInspectDays} working days after upload`} />
        <MiniStat label="JIR complete" value={done.length} tone="good" onClick={() => setTab('JIR complete')} active={tab === 'JIR complete'} />
        <MiniStat label="Sites with CSPDCL delays" value={delays.length} tone={delays.length ? 'warn' : undefined} onClick={() => setTab('Delay evidence')} active={tab === 'Delay evidence'} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ 'Pending inspection': pending.length, 'JIR complete': done.length, 'Delay evidence': delays.length }} />

      <section className="card table-card">
        <QueueToolbar q={q} setQ={setQ} lotId={lotId} setLotId={setLotId} lots={lots}>
          {tab === 'Delay evidence' && (
            <button type="button" className="outline-btn" onClick={exportDelays} disabled={!delayRows.length}>
              <Download className="w-3.5 h-3.5" /> Export for EoT
            </button>
          )}
        </QueueToolbar>

        {tab === 'Pending inspection' &&
          (pendingRows.length === 0 ? (
            <EmptyBlock icon={ClipboardCheck} title="No sites awaiting inspection" text="Sites arrive here once their portal upload is recorded in Portal Update." />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Beneficiary</th>
                      <th>Lot</th>
                      <th>Portal upload</th>
                      <th>Annex G inspection timer</th>
                      <th>JIR progress</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pPend.slice.map((b) => {
                      const st = inspectStep(b)
                      const missing = jirGate(b)
                      return (
                        <tr key={b.id}>
                          <td>
                            <div className="cell-title">
                              <strong>{b.name}</strong>
                              <small>
                                {b.appNo} · {b.sanctionedKw} kW · {b.subDivision || b.district}
                              </small>
                            </div>
                          </td>
                          <td>{lotMap.get(b.lotId)?.lotNo || '—'}</td>
                          <td>{fmtDateTime(b.portal.uploadedAt)}</td>
                          <td>
                            {st ? (
                              <Chip tone={st.overBy > 0 ? 'bad' : st.usedWorkingDays >= st.allowedWorkingDays - 1 ? 'warn' : 'info'}>
                                {st.usedWorkingDays}/{st.allowedWorkingDays} working days{st.overBy ? ` · ${st.overBy} over (CSPDCL)` : ''}
                              </Chip>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{missing.length ? <Chip tone="warn">{missing.length} item(s) missing</Chip> : <Chip tone="good">Complete</Chip>}</td>
                          <td className="text-right">
                            <div className="row-actions">
                              <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" className="primary-btn btn-sm" onClick={() => setEdit(b.id)}>
                                <FileSignature className="w-3 h-3" /> Record JIR
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...pPend} />
            </>
          ))}

        {tab === 'JIR complete' &&
          (doneRows.length === 0 ? (
            <EmptyBlock title="No completed JIRs yet" />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Beneficiary</th>
                      <th>Lot</th>
                      <th>Inspection date</th>
                      <th>AE</th>
                      <th>Current stage</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pDone.slice.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <div className="cell-title">
                            <strong>{b.name}</strong>
                            <small>{b.appNo}</small>
                          </div>
                        </td>
                        <td>{lotMap.get(b.lotId)?.lotNo || '—'}</td>
                        <td>{fmtDate(b.commissioning.inspectionDate)}</td>
                        <td>{b.commissioning.aeName}</td>
                        <td>
                          <Chip tone={stageOf(b) === 'Commissioned' ? 'good' : 'info'}>{stageOf(b)}</Chip>
                        </td>
                        <td className="text-right">
                          <div className="row-actions">
                            <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {!isLotBilled(dockets, b.lotId) && (
                              <button type="button" className="outline-btn btn-sm" onClick={() => setEdit(b.id)}>
                                Edit JIR
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager {...pDone} />
            </>
          ))}

        {tab === 'Delay evidence' && (
          <>
            <div style={{ padding: '12px 18px 0' }}>
              <NoteBanner>
                Every CSPDCL-side step that exceeded its Annex G working days (inspection {settings.sla.cspdclInspectDays}, metering {settings.sla.cspdclMeterDays}, commissioning {settings.sla.cspdclCommissionDays}). Use the export when requesting extension of time. Working days exclude Sundays only; public holidays are not modelled.
              </NoteBanner>
            </div>
            {delayRows.length === 0 ? (
              <EmptyBlock title="No CSPDCL-side delays recorded" />
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Beneficiary</th>
                        <th>Lot</th>
                        <th>Step</th>
                        <th>Started</th>
                        <th>Completed</th>
                        <th>Days used / allowed</th>
                        <th>Over by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pDelay.slice.flatMap((r) =>
                        r.steps.map((s) => (
                          <tr key={r.b.id + s.step}>
                            <td>
                              <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(r.b.id)}>
                                <strong>{r.b.name}</strong>
                                <small>{r.b.appNo}</small>
                              </button>
                            </td>
                            <td>{lotMap.get(r.b.lotId)?.lotNo}</td>
                            <td>{s.step}</td>
                            <td>{fmtDate(s.start)}</td>
                            <td>{s.end ? fmtDate(s.end) : <Chip tone="warn">Still pending</Chip>}</td>
                            <td>
                              {s.usedWorkingDays} / {s.allowedWorkingDays}
                            </td>
                            <td>
                              <Chip tone="bad">{s.overBy} working day(s)</Chip>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager {...pDelay} />
              </>
            )}
          </>
        )}
      </section>

      {edit && <JirModal id={edit} onClose={() => setEdit(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </div>
  )
}

function JirModal({ id, onClose }: { id: string; onClose: () => void }) {
  const bens = useBeneficiaries()
  const settings = useSettings()
  const user = useUserName()
  const b = bens.find((x) => x.id === id)
  const [c, setC] = useState<CommissioningData | null>(b ? { ...b.commissioning, aeName: b.commissioning.aeName || b.aeName } : null)
  if (!b || !c) return null
  const set = <K extends keyof CommissioningData>(k: K, v: CommissioningData[K]) => setC({ ...c, [k]: v })
  const draft: Beneficiary = { ...b, commissioning: c }
  const missing = jirGate(draft)
  const step = annexGSteps(draft, settings.sla).find((s) => s.step === 'CSPDCL inspection after upload')
  const uploadDay = b.portal.uploadedAt?.slice(0, 10) || ''

  const save = () => {
    if (c.inspectionDate && uploadDay && c.inspectionDate < uploadDay) return void alert('Inspection date cannot be before the portal upload date.')
    if (c.inspectionDate && c.inspectionDate > today()) return void alert('Inspection date cannot be in the future.')
    const ok = updateBeneficiary(id, (x) => ({ ...x, commissioning: c }), user, missing.length ? 'JIR details saved (incomplete)' : `JIR completed — inspected ${c.inspectionDate} by AE ${c.aeName}`)
    if (reportSave(ok, missing.length ? 'JIR details saved — still incomplete' : 'JIR complete — site moves to commissioning')) onClose()
  }

  return (
    <Modal
      eyebrow={`Application ${b.appNo}`}
      title={`CSPDCL inspection & JIR — ${b.name}`}
      subtitle={`Portal upload ${fmtDateTime(b.portal.uploadedAt)} · ${b.sanctionedKw} kW`}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> {missing.length ? 'Save progress' : 'Save — JIR complete'}
          </button>
        </>
      }
    >
      {step && (
        <div className={`gate-box ${step.overBy > 0 ? 'bad' : 'ok'}`}>
          <strong>
            Annex G: CSPDCL inspection within {step.allowedWorkingDays} working days of upload — {step.usedWorkingDays} used
            {step.overBy > 0 ? ` (${step.overBy} over, logged as CSPDCL delay evidence)` : ''}
          </strong>
        </div>
      )}
      <FormSection title="Inspection">
        <div className="form-grid">
          <DateField label="CSPDCL inspection date" required value={c.inspectionDate} min={uploadDay} max={today()} onChange={(v) => set('inspectionDate', v)} />
          <TextField label="AE name" required value={c.aeName} onChange={(v) => set('aeName', v)} hint={b.aeName ? `From allotment list: ${b.aeName}` : undefined} />
          <FileField label="JIR scan (signed)" required span2 value={c.jir} onChange={(f) => set('jir', f)} />
        </div>
      </FormSection>
      <FormSection title="JIR signatures">
        <div className="check-grid">
          <CheckField label="Signed by consumer" checked={c.jirSignedConsumer} onChange={(v) => set('jirSignedConsumer', v)} />
          <CheckField label="Signed by AE of sub-division" checked={c.jirSignedAe} onChange={(v) => set('jirSignedAe', v)} />
          <CheckField label="Signed by RBP" checked={c.jirSignedRbp} onChange={(v) => set('jirSignedRbp', v)} />
        </div>
      </FormSection>
      <TextArea label="Remarks" value={c.remarks} onChange={(v) => set('remarks', v)} />
      <GateBox missing={missing} okText="JIR complete — the site will move to net-metering and commissioning." />
    </Modal>
  )
}
