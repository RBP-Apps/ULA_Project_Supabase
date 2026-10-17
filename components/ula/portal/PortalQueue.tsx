'use client'

import React, { useState } from 'react'
import { FileText, Eye, UploadCloud, Pencil } from 'lucide-react'
import { PageHeader, MiniStat, Tabs, EmptyBlock, Chip, usePaged, Pager, toast, reportSave, confirmAction, useUserName } from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { PortalForm, markUploaded } from './PortalForm'
import { QueueFilters, useQueueFilter, lastQcEvent } from '../installation/QueueFilters'
import { useBeneficiaries, useLotMap, useIpMap, updateBeneficiaries } from '@/lib/ula/data'
import { PORTAL_FIELDS, portalGate, stageOf, useSettings, addWorkingDays, workingDaysBetween, today, fmtDate, fmtDateTime } from '@/lib/ula/workflow'
import type { Beneficiary } from '@/lib/ula/types'

const TABS = ['Pending', 'Uploaded'] as const
type Tab = (typeof TABS)[number]

export function PortalQueue() {
  const all = useBeneficiaries()
  const lots = useLotMap()
  const ips = useIpMap()
  const settings = useSettings()
  const user = useUserName()
  const [tab, setTab] = useState<Tab>('Pending')
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const { f, setF, apply, districts } = useQueueFilter(all)

  const filtered = apply(all)
  const pending = filtered.filter((b) => stageOf(b) === 'Portal Update')
  const uploaded = filtered.filter((b) => !!b.portal.uploadedAt)

  const dueOf = (b: Beneficiary) => {
    const pass = lastQcEvent(b, 'Passed')
    return pass ? addWorkingDays(pass.at.slice(0, 10), settings.sla.portalUploadWorkingDays) : ''
  }
  const isLate = (b: Beneficiary) => {
    const d = dueOf(b)
    return !!d && today() > d
  }

  const rows = (tab === 'Pending' ? pending : uploaded).sort((a, b) =>
    tab === 'Pending' ? dueOf(a).localeCompare(dueOf(b)) : (b.portal.uploadedAt || '').localeCompare(a.portal.uploadedAt || '')
  )
  const paged = usePaged(rows, 25)
  const late = pending.filter(isLate).length
  const awaitingInspection = uploaded.filter((b) => !b.commissioning.inspectionDate)
  const cspdclLate = awaitingInspection.filter((b) => workingDaysBetween(b.portal.uploadedAt || '', today()) > settings.sla.cspdclInspectDays).length

  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const selectedPending = pending.filter((b) => sel.has(b.id))

  const bulkMark = () => {
    const ok = selectedPending.filter((b) => portalGate(b).length === 0)
    const failed = selectedPending.filter((b) => portalGate(b).length > 0)
    if (!ok.length) {
      toast(`None of the selected sites can be marked: ${failed.map((b) => `${b.name} (${portalGate(b).length} missing)`).join(', ')}`, 'error')
      return
    }
    if (!confirmAction(`Mark portal upload done for ${ok.length} site(s)?${failed.length ? ` ${failed.length} site(s) with missing fields will be skipped.` : ''}`)) return
    if (reportSave(updateBeneficiaries(ok.map((b) => b.id), (x) => ({ ...x, portal: markUploaded(x.portal, user) }), user, 'Portal upload completed (bulk) — Annex G clock started'), `${ok.length} site(s) marked uploaded`)) {
      if (failed.length) toast(`Skipped — fields incomplete: ${failed.map((b) => `${b.name}: ${portalGate(b).join(', ')}`).join(' | ')}`, 'error')
      setSel(new Set())
    }
  }

  const openB = open ? all.find((b) => b.id === open) : undefined

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="CSPDCL Process · Stage 10"
        title="Portal Update"
        description={`Upload installation details, photos, serials, DCR certificate and electricity bill on the National Portal and apply for the net meter within ${settings.sla.portalUploadWorkingDays} working days of QC. Upload starts CSPDCL's Annex G clock.`}
      />

      <div className="mini-stats">
        <MiniStat label="Pending upload" value={pending.length} onClick={() => setTab('Pending')} active={tab === 'Pending'} />
        <MiniStat label={`Late (> ${settings.sla.portalUploadWorkingDays} working days after QC)`} value={late} tone={late ? 'bad' : undefined} />
        <MiniStat label="Uploaded" value={uploaded.length} tone="good" onClick={() => setTab('Uploaded')} active={tab === 'Uploaded'} />
        <MiniStat label="Awaiting CSPDCL inspection" value={awaitingInspection.length} />
        <MiniStat label={`CSPDCL over ${settings.sla.cspdclInspectDays} working days`} value={cspdclLate} tone={cspdclLate ? 'bad' : undefined} hint="Delay evidence for extension of time" />
      </div>

      <section className="card table-card">
        <div style={{ padding: '6px 18px 0' }}>
          <Tabs tabs={TABS} value={tab} onChange={(t) => (setTab(t), setSel(new Set()))} counts={{ Pending: pending.length, Uploaded: uploaded.length }} />
        </div>
        <QueueFilters f={f} setF={setF} districts={districts}>
          {tab === 'Pending' && (
            <button type="button" className="primary-btn" disabled={!selectedPending.length} onClick={bulkMark}>
              <UploadCloud className="w-4 h-4" /> Mark uploaded ({selectedPending.length})
            </button>
          )}
        </QueueFilters>

        {rows.length === 0 ? (
          <EmptyBlock
            icon={FileText}
            title={tab === 'Pending' ? 'No QC-passed sites waiting for portal upload' : 'No sites uploaded yet'}
            text={tab === 'Pending' ? 'Sites arrive here once QC accepts the installation.' : undefined}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {tab === 'Pending' && (
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select all on page"
                          checked={paged.slice.length > 0 && paged.slice.every((b) => sel.has(b.id))}
                          onChange={(e) => setSel((s) => {
                            const n = new Set(s)
                            paged.slice.forEach((b) => (e.target.checked ? n.add(b.id) : n.delete(b.id)))
                            return n
                          })}
                        />
                      </th>
                    )}
                    <th>Beneficiary / application</th>
                    <th>Lot / IP</th>
                    <th>QC passed</th>
                    {tab === 'Pending' ? (
                      <>
                        <th>Upload due</th>
                        <th>Portal fields</th>
                        <th>Net-meter applied</th>
                      </>
                    ) : (
                      <>
                        <th>Uploaded</th>
                        <th>Net-meter applied</th>
                        <th>CSPDCL inspection (Annex G)</th>
                      </>
                    )}
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((b) => {
                    const pass = lastQcEvent(b, 'Passed')
                    const due = dueOf(b)
                    const fieldsDone = PORTAL_FIELDS.filter((x) => b.portal.fields[x]).length
                    const used = workingDaysBetween(b.portal.uploadedAt || '', b.commissioning.inspectionDate || today())
                    return (
                      <tr key={b.id}>
                        {tab === 'Pending' && (
                          <td>
                            <input type="checkbox" aria-label={`Select ${b.name}`} checked={sel.has(b.id)} onChange={() => toggle(b.id)} />
                          </td>
                        )}
                        <td>
                          <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                            <strong>{b.name}</strong>
                            <small>
                              {b.appNo} · {b.consumerNo}
                            </small>
                          </button>
                        </td>
                        <td>
                          <div className="cell-title">
                            <strong>{lots.get(b.lotId)?.lotNo || '—'}</strong>
                            <small>{b.ipId ? ips.get(b.ipId)?.name : 'No IP'}</small>
                          </div>
                        </td>
                        <td>{fmtDate(pass?.at)}</td>
                        {tab === 'Pending' ? (
                          <>
                            <td>{due ? <Chip tone={isLate(b) ? 'bad' : due === today() ? 'warn' : 'info'}>{isLate(b) ? `Late — due ${fmtDate(due)}` : fmtDate(due)}</Chip> : '—'}</td>
                            <td>
                              <Chip tone={fieldsDone === PORTAL_FIELDS.length ? 'good' : fieldsDone ? 'warn' : undefined}>
                                {fieldsDone}/{PORTAL_FIELDS.length}
                              </Chip>
                            </td>
                            <td>{fmtDate(b.portal.netMeterAppliedDate)}</td>
                          </>
                        ) : (
                          <>
                            <td>
                              <div className="cell-title">
                                <strong>{fmtDateTime(b.portal.uploadedAt)}</strong>
                                <small>{b.portal.uploadedBy}</small>
                              </div>
                            </td>
                            <td>{fmtDate(b.portal.netMeterAppliedDate)}</td>
                            <td>
                              {b.commissioning.inspectionDate ? (
                                <Chip tone={used > settings.sla.cspdclInspectDays ? 'bad' : 'good'}>
                                  Inspected {fmtDate(b.commissioning.inspectionDate)} · {used} wd
                                </Chip>
                              ) : (
                                <Chip tone={used > settings.sla.cspdclInspectDays ? 'bad' : 'info'}>
                                  {used}/{settings.sla.cspdclInspectDays} working days elapsed
                                </Chip>
                              )}
                            </td>
                          </>
                        )}
                        <td className="text-right">
                          <div className="row-actions">
                            <button type="button" className="action-icon-btn" title="View record" onClick={() => setView(b.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className={tab === 'Pending' ? 'primary-btn btn-sm' : 'outline-btn btn-sm'} onClick={() => setOpen(b.id)}>
                              <Pencil className="w-3 h-3" /> {tab === 'Pending' ? 'Update' : 'View'}
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

      {openB && <PortalForm key={openB.id} b={openB} onClose={() => setOpen(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </div>
  )
}
