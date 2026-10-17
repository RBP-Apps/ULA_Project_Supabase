'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { BarChart3, Eye, Send, CheckCircle2, XCircle, Layers, Save, AlertTriangle } from 'lucide-react'
import {
  PageHeader,
  MiniStat,
  Tabs,
  EmptyBlock,
  Chip,
  DaysChip,
  Modal,
  FormSection,
  TextField,
  NumberField,
  SelectField,
  TextArea,
  FileField,
  FileChip,
  GateBox,
  NoteBanner,
  usePaged,
  Pager,
  reportSave,
  toast,
  confirmAction,
  useUserName,
} from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { QueueFilters, applyQueueFilter, EMPTY_FILTER } from '../survey/QueueFilters'
import { useBeneficiaries, useLots, useIps, useIpMap, useLotMap, updateBeneficiary, updateBeneficiaries } from '@/lib/ula/data'
import { designGate, stageOf, STRUCTURE_TYPES, useSettings, addDays, daysBetween, today, fmtDate, fmtDateTime, nowIso } from '@/lib/ula/workflow'
import type { Beneficiary, DesignData } from '@/lib/ula/types'

const TABS = ['To design', 'Awaiting approval', 'Approved'] as const
type Tab = (typeof TABS)[number]
const TOOLS = ['PVsyst', 'Helioscope', 'Other']

export function DesignView() {
  const all = useBeneficiaries()
  const lots = useLots()
  const lotMap = useLotMap()
  const ips = useIps()
  const ipMap = useIpMap()
  const settings = useSettings()
  const user = useUserName()
  const [tab, setTab] = useState<Tab>('To design')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [bulk, setBulk] = useState(false)

  const buckets = useMemo(() => {
    const toDesign: Beneficiary[] = []
    const awaiting: Beneficiary[] = []
    const approved: Beneficiary[] = []
    all.forEach((b) => {
      const st = stageOf(b)
      if (st === 'Design') (b.design.status === 'Submitted' ? awaiting : toDesign).push(b)
      else if (b.design.status === 'Approved' && st !== 'Dropped') approved.push(b)
    })
    return { toDesign, awaiting, approved }
  }, [all])

  useEffect(() => setSelected(new Set()), [tab])

  const target = (b: Beneficiary) => {
    const lot = lotMap.get(b.lotId)
    return lot ? addDays(lot.allotmentDate, settings.sla.designTargetDay) : ''
  }
  const current = tab === 'To design' ? buckets.toDesign : tab === 'Awaiting approval' ? buckets.awaiting : buckets.approved
  const rows = applyQueueFilter(current, filter).sort((a, b) => target(a).localeCompare(target(b)))
  const paged = usePaged(rows, 25)
  const lateCount = buckets.toDesign.concat(buckets.awaiting).filter((b) => today() > target(b)).length

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const allOn = paged.slice.length > 0 && paged.slice.every((b) => selected.has(b.id))
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      paged.slice.forEach((b) => (allOn ? n.delete(b.id) : n.add(b.id)))
      return n
    })
  const selectedBens = all.filter((b) => selected.has(b.id))

  const openBulk = () => {
    const kws = new Set(selectedBens.map((b) => b.sanctionedKw))
    if (kws.size > 1) return toast('A standard design type applies to sites of the same kW — select sites of one size only.', 'error')
    setBulk(true)
  }

  const bulkApprove = () => {
    const ready = selectedBens.filter((b) => b.design.status === 'Submitted' && designGate(b).length === 0)
    if (!ready.length) return toast('No selected design is ready for approval', 'error')
    if (!confirmAction(`Approve ${ready.length} simulation report(s) as Engineer-in-Charge (${user})? Approved sites become eligible for dispatch.`)) return
    const at = nowIso()
    if (reportSave(updateBeneficiaries(ready.map((b) => b.id), (b) => ({ ...b, design: { ...b.design, status: 'Approved', approvedBy: user, approvedAt: at } }), user, 'Design and simulation approved'), `${ready.length} design(s) approved`))
      setSelected(new Set())
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Execution · Stage 3"
        title="Design & Simulation"
        description="Layout and structure per site, PVsyst / Helioscope shading and yield simulation, and Engineer-in-Charge approval (Sec-1 cl. 2.6, 2.8). Approval gates dispatch."
      />

      <div className="mini-stats">
        <MiniStat label="To design" value={buckets.toDesign.length} active={tab === 'To design'} onClick={() => setTab('To design')} />
        <MiniStat label="Awaiting Engineer-in-Charge" value={buckets.awaiting.length} tone={buckets.awaiting.length ? 'warn' : undefined} active={tab === 'Awaiting approval'} onClick={() => setTab('Awaiting approval')} />
        <MiniStat label={`Past D${settings.sla.designTargetDay} target`} value={lateCount} tone={lateCount ? 'bad' : 'good'} />
        <MiniStat label="Approved (cleared for dispatch)" value={buckets.approved.length} tone="good" active={tab === 'Approved'} onClick={() => setTab('Approved')} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ 'To design': buckets.toDesign.length, 'Awaiting approval': buckets.awaiting.length, Approved: buckets.approved.length }} />

      <section className="card table-card">
        <QueueFilters value={filter} onChange={setFilter} lots={lots.filter((l) => l.listLocked)} ips={ips} beneficiaries={current}>
          {tab === 'To design' && (
            <button type="button" className="outline-btn" disabled={!selected.size} onClick={openBulk}>
              <Layers className="w-4 h-4" /> Apply standard design ({selected.size})
            </button>
          )}
          {tab === 'Awaiting approval' && (
            <button type="button" className="primary-btn" disabled={!selected.size} onClick={bulkApprove}>
              <CheckCircle2 className="w-4 h-4" /> Approve selected ({selected.size})
            </button>
          )}
        </QueueFilters>
        {rows.length === 0 ? (
          <EmptyBlock icon={BarChart3} title={current.length ? 'Nothing matches these filters' : `Nothing in “${tab}”`} text={tab === 'To design' ? 'Sites arrive here once their survey is accepted (and, if not feasible, approved by CSPDCL).' : undefined} />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {tab !== 'Approved' && (
                      <th>
                        <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all on page" />
                      </th>
                    )}
                    <th>Application / Name</th>
                    <th>Lot</th>
                    <th>kW</th>
                    <th>Survey</th>
                    <th>Design type / tool</th>
                    <th>{tab === 'Approved' ? 'Approved' : `D${settings.sla.designTargetDay} target`}</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((b) => {
                    const t = target(b)
                    return (
                      <tr key={b.id}>
                        {tab !== 'Approved' && (
                          <td>
                            <input type="checkbox" checked={selected.has(b.id)} onChange={(e) => toggle(b.id, e.target.checked)} aria-label={`Select ${b.name}`} />
                          </td>
                        )}
                        <td>
                          <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                            <strong>{b.name}</strong>
                            <small>
                              {b.appNo} · {b.ipId ? ipMap.get(b.ipId)?.name : 'No IP'}
                            </small>
                          </button>
                        </td>
                        <td>{lotMap.get(b.lotId)?.lotNo}</td>
                        <td>{b.sanctionedKw}</td>
                        <td>
                          <small>
                            {b.survey.roofType || '—'} · {b.survey.usableArea || 0} m² · {b.survey.shade || '—'}
                          </small>
                        </td>
                        <td>
                          {b.design.designType || '—'}
                          {b.design.tool && <small className="muted"> · {b.design.tool}</small>}
                        </td>
                        <td>
                          {tab === 'Approved' ? (
                            <small>
                              {fmtDate(b.design.approvedAt)} · {b.design.approvedBy}
                            </small>
                          ) : (
                            <div className="cell-title">
                              <strong>{fmtDate(t)}</strong>
                              <DaysChip days={daysBetween(today(), t)} />
                            </div>
                          )}
                        </td>
                        <td>
                          <Chip tone={b.design.status === 'Approved' ? 'good' : b.design.status === 'Rejected' ? 'bad' : b.design.status === 'Submitted' ? 'info' : 'warn'}>{b.design.status}</Chip>
                        </td>
                        <td className="text-right">
                          <div className="row-actions">
                            <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="primary-btn btn-sm" onClick={() => setOpen(b.id)}>
                              <BarChart3 className="w-3 h-3" /> {tab === 'Awaiting approval' ? 'Review' : tab === 'Approved' ? 'Open' : 'Design'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>

      {open && <DesignFormModal id={open} onClose={() => setOpen(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
      {bulk && (
        <BulkDesignModal
          bens={selectedBens}
          onClose={(done) => {
            setBulk(false)
            if (done) setSelected(new Set())
          }}
        />
      )}
    </div>
  )
}

// ---------------- single-site design ----------------

function DesignFormModal({ id, onClose }: { id: string; onClose: () => void }) {
  const all = useBeneficiaries()
  const lotMap = useLotMap()
  const user = useUserName()
  const b = all.find((x) => x.id === id)
  const [d, setD] = useState<DesignData | null>(b ? { ...b.design, structureType: b.design.structureType || b.survey.structureType } : null)

  if (!b || !d) {
    return (
      <Modal title="Beneficiary not found" onClose={onClose}>
        <p className="muted">This record no longer exists.</p>
      </Modal>
    )
  }
  const editable = d.status === 'Pending' || d.status === 'Rejected'
  const reviewing = b.design.status === 'Submitted'
  const missing = designGate({ ...b, design: d })
  const set = <K extends keyof DesignData>(k: K, v: DesignData[K]) => setD((x) => (x ? { ...x, [k]: v } : x))
  const canReopen = b.design.status === 'Approved' && !b.dispatchId
  const shared = d.simulationReport ? all.filter((x) => x.id !== b.id && x.design.simulationReport?.id === d.simulationReport!.id).length : 0

  const persist = (next: DesignData, msg: string, action: string) => {
    if (reportSave(updateBeneficiary(b.id, (x) => ({ ...x, design: next }), user, action), msg)) {
      setD(next)
      return true
    }
    return false
  }
  const setReport = (f: DesignData['simulationReport']) => {
    const next = { ...d, simulationReport: f }
    setD(next)
    updateBeneficiary(b.id, (x) => ({ ...x, design: { ...x.design, simulationReport: f } }), user)
  }

  const submit = () => {
    if (missing.length) return toast(`Cannot submit — ${missing.length} item(s) missing`, 'error')
    if (persist({ ...d, status: 'Submitted', submittedAt: nowIso() }, 'Design submitted to Engineer-in-Charge', 'Design submitted for approval')) onClose()
  }
  const approve = () => {
    if (designGate(b).length) return toast('Stored design is incomplete', 'error')
    if (persist({ ...b.design, status: 'Approved', approvedBy: user, approvedAt: nowIso() }, 'Design approved — site cleared for dispatch', 'Design and simulation approved')) onClose()
  }
  const reject = () => {
    const reason = window.prompt('Reason for rejecting this design / simulation:')
    if (!reason?.trim()) return
    if (persist({ ...b.design, status: 'Rejected', remarks: reason.trim(), approvedBy: '', approvedAt: undefined }, 'Design rejected — back to engineering', `Design rejected: ${reason.trim()}`)) onClose()
  }
  const reopen = () => {
    if (!confirmAction('Withdraw the approval and reopen this design? The site will no longer be cleared for dispatch.')) return
    persist({ ...b.design, status: 'Pending', approvedBy: '', approvedAt: undefined }, 'Design reopened', 'Design approval withdrawn')
  }

  return (
    <Modal
      eyebrow={`${lotMap.get(b.lotId)?.lotNo || ''} · Application ${b.appNo}`}
      title={`Design — ${b.name}`}
      subtitle={`${b.sanctionedKw} kW · roof ${b.survey.roofType || '—'}, ${b.survey.usableArea || 0} m², shade ${b.survey.shade || '—'}, ${b.survey.orientation || '—'}`}
      onClose={onClose}
      footer={
        <>
          <span style={{ marginRight: 'auto' }}>
            <Chip tone={d.status === 'Approved' ? 'good' : d.status === 'Rejected' ? 'bad' : d.status === 'Submitted' ? 'info' : 'warn'}>{d.status}</Chip>
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
          {editable && (
            <>
              <button type="button" className="outline-btn" onClick={() => persist(d, 'Design draft saved', 'Design draft saved')}>
                <Save className="w-4 h-4" /> Save draft
              </button>
              <button type="button" className="primary-btn" onClick={submit} disabled={missing.length > 0}>
                <Send className="w-4 h-4" /> Submit for approval
              </button>
            </>
          )}
          {reviewing && (
            <>
              <button type="button" className="danger-btn" onClick={reject}>
                <XCircle className="w-4 h-4" /> Reject
              </button>
              <button type="button" className="primary-btn" onClick={approve}>
                <CheckCircle2 className="w-4 h-4" /> Approve (Engineer-in-Charge)
              </button>
            </>
          )}
          {canReopen && (
            <button type="button" className="outline-btn" onClick={reopen}>
              Withdraw approval
            </button>
          )}
        </>
      }
    >
      {d.status === 'Rejected' && d.remarks && (
        <div className="gate-box bad">
          <strong>
            <AlertTriangle className="w-4 h-4" /> Rejected: {d.remarks}
          </strong>
        </div>
      )}
      {d.status === 'Approved' && (
        <NoteBanner>
          Approved by {d.approvedBy} on {fmtDateTime(d.approvedAt)}. This site is cleared for dispatch.
        </NoteBanner>
      )}
      {editable && <GateBox missing={missing} okText="Design complete — ready to submit" />}
      <FormSection title="Layout and structure" icon={Layers}>
        <div className="form-grid">
          <TextField label="Design type" value={d.designType} placeholder="Site-specific, or a standard type name e.g. STD-1KW-RCC" onChange={(v) => set('designType', v)} disabled={!editable} />
          <SelectField label="Structure type" required value={d.structureType} options={STRUCTURE_TYPES} onChange={(v) => set('structureType', v)} disabled={!editable} />
          <TextArea label="Layout description" required span2 value={d.layout} placeholder="Module rows, tilt, azimuth, inverter and ACDB/DCDB location, cable route" onChange={(v) => set('layout', v)} disabled={!editable} />
        </div>
      </FormSection>
      <FormSection title="Shading and yield simulation" icon={BarChart3}>
        <div className="form-grid">
          <SelectField label="Simulation tool" required value={d.tool} options={TOOLS} onChange={(v) => set('tool', v as DesignData['tool'])} disabled={!editable} />
          <NumberField label="Expected yield (kWh / year)" min={0} value={d.expectedYield} onChange={(v) => set('expectedYield', v)} disabled={!editable} hint={d.expectedYield && b.sanctionedKw ? `${Math.round(d.expectedYield / b.sanctionedKw)} kWh/kWp · CUF ${((d.expectedYield / (b.sanctionedKw * 8760)) * 100).toFixed(1)}%` : undefined} />
          {editable && shared ? (
            <div className="field span-2">
              <span>Simulation report *</span>
              <div className="row">
                <FileChip file={d.simulationReport!} />
                <button type="button" className="outline-btn btn-sm" onClick={() => setReport(undefined)}>
                  Use a site-specific report instead
                </button>
              </div>
              <small className="hint">Shared by {shared} other site(s) of design type {d.designType || '—'}; detaching keeps the file for them.</small>
            </div>
          ) : editable ? (
            <FileField label="Simulation report" required span2 value={d.simulationReport} accept={['.pdf', 'image/']} onChange={setReport} />
          ) : (
            <div className="field span-2">
              <span>Simulation report</span>
              {d.simulationReport ? <FileChip file={d.simulationReport} /> : <span className="muted">Not uploaded</span>}
            </div>
          )}
        </div>
      </FormSection>
    </Modal>
  )
}

// ---------------- standard design type applied to many sites ----------------

function BulkDesignModal({ bens, onClose }: { bens: Beneficiary[]; onClose: (done: boolean) => void }) {
  const user = useUserName()
  const kw = bens[0]?.sanctionedKw || 0
  const [d, setD] = useState({ designType: '', layout: '', structureType: '', tool: '' as DesignData['tool'], expectedYield: 0, simulationReport: undefined as DesignData['simulationReport'] })
  const editable = bens.filter((b) => b.design.status === 'Pending' || b.design.status === 'Rejected')
  const submit = () => {
    if (!d.designType.trim()) return toast('Name the standard design type', 'error')
    if (!d.layout.trim() || !d.structureType || !d.tool || !d.simulationReport) return toast('Layout, structure, tool and simulation report are required', 'error')
    if (!editable.length) return toast('None of the selected designs is editable', 'error')
    const at = nowIso()
    const ok = updateBeneficiaries(
      editable.map((b) => b.id),
      (b) => ({ ...b, design: { ...b.design, designType: d.designType.trim(), layout: d.layout.trim(), structureType: d.structureType, tool: d.tool, expectedYield: d.expectedYield, simulationReport: d.simulationReport, status: 'Submitted', submittedAt: at, remarks: '' } }),
      user,
      `Standard design ${d.designType.trim()} applied and submitted`
    )
    if (reportSave(ok, `${d.designType.trim()} applied to ${editable.length} site(s) and submitted for approval`)) onClose(true)
  }
  return (
    <Modal
      eyebrow={`${bens.length} site(s) · ${kw} kW`}
      title="Apply standard design type"
      subtitle="One simulation report per design type (Sec-1 cl. 2.6). Each site still needs Engineer-in-Charge approval."
      onClose={() => onClose(false)}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Send className="w-4 h-4" /> Apply and submit ({editable.length})
          </button>
        </>
      }
    >
      {editable.length < bens.length && <NoteBanner>{bens.length - editable.length} selected site(s) are already submitted or approved and will be skipped.</NoteBanner>}
      <div className="form-grid">
        <TextField label="Standard design type" required value={d.designType} placeholder={`e.g. STD-${kw}KW-RCC`} onChange={(v) => setD({ ...d, designType: v })} />
        <SelectField label="Structure type" required value={d.structureType} options={STRUCTURE_TYPES} onChange={(v) => setD({ ...d, structureType: v })} />
        <TextArea label="Layout description" required span2 value={d.layout} onChange={(v) => setD({ ...d, layout: v })} />
        <SelectField label="Simulation tool" required value={d.tool} options={TOOLS} onChange={(v) => setD({ ...d, tool: v as DesignData['tool'] })} />
        <NumberField label="Expected yield (kWh / year per site)" min={0} value={d.expectedYield} onChange={(v) => setD({ ...d, expectedYield: v })} />
        <FileField label="Simulation report for this design type" required span2 value={d.simulationReport} accept={['.pdf', 'image/']} onChange={(f) => setD({ ...d, simulationReport: f })} />
      </div>
    </Modal>
  )
}
