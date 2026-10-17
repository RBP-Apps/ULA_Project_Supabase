'use client'

import React, { useMemo, useState } from 'react'
import { Plus, Search, Save, CheckCircle2, PlayCircle } from 'lucide-react'
import { Modal, SelectField, TextArea, EmptyBlock, Chip, usePaged, Pager, reportSave, toast, useUserName } from '../ui'
import { useBeneficiaries } from '@/lib/ula/data'
import { useCollection, upsert, patch, newId, nextNumber, logActivity } from '@/lib/ula/storage'
import { fmtDateTime, hoursSince, nowIso, useSettings } from '@/lib/ula/workflow'
import type { Beneficiary, ComplaintTicket } from '@/lib/ula/types'

const SOURCES: ComplaintTicket['source'][] = ['Consumer', 'CSPDCL', 'Monitoring']
const STATUSES = ['All', 'Open', 'In Progress', 'Closed'] as const

export function CmcTickets({ sites }: { sites: Beneficiary[] }) {
  const tickets = useCollection<ComplaintTicket>('tickets')
  const bens = useBeneficiaries()
  const settings = useSettings()
  const user = useUserName()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All')
  const [creating, setCreating] = useState<ComplaintTicket | null>(null)
  const [closing, setClosing] = useState<ComplaintTicket | null>(null)
  const benMap = useMemo(() => new Map(bens.map((b) => [b.id, b])), [bens])
  const limit = settings.sla.ticketCloseHours

  const rows = tickets
    .filter((t) => {
      const b = benMap.get(t.beneficiaryId)
      const s = q.toLowerCase()
      return (!s || [t.ticketNo, t.description, b?.appNo, b?.name].some((x) => x?.toLowerCase().includes(s))) && (status === 'All' || t.status === status)
    })
    .sort((a, b) => (a.status === 'Closed' ? 1 : 0) - (b.status === 'Closed' ? 1 : 0) || a.openedAt.localeCompare(b.openedAt))
  const paged = usePaged(rows, 25)

  const create = (t: ComplaintTicket) => {
    if (!t.beneficiaryId) return toast('Select the site', 'error')
    if (!t.description.trim()) return toast('Describe the complaint', 'error')
    const rec: ComplaintTicket = { ...t, id: newId('TKT'), ticketNo: nextNumber(tickets.map((x) => x.ticketNo), 'TKT'), openedAt: nowIso(), status: 'Open', resolution: '' }
    if (reportSave(upsert('tickets', rec), `${rec.ticketNo} opened`)) {
      logActivity(user, 'Beneficiary', rec.beneficiaryId, `Complaint ${rec.ticketNo} opened (${rec.source})`)
      setCreating(null)
    }
  }
  const start = (t: ComplaintTicket) => {
    if (reportSave(patch<ComplaintTicket>('tickets', t.id, (x) => ({ ...x, status: 'In Progress' })), `${t.ticketNo} in progress`)) logActivity(user, 'Beneficiary', t.beneficiaryId, `Complaint ${t.ticketNo} work started`)
  }
  const close = (t: ComplaintTicket) => {
    if (!t.resolution.trim()) return toast('Resolution is required to close a ticket', 'error')
    if (reportSave(patch<ComplaintTicket>('tickets', t.id, (x) => ({ ...x, status: 'Closed', closedAt: nowIso(), resolution: t.resolution.trim() })), `${t.ticketNo} closed`)) {
      logActivity(user, 'Beneficiary', t.beneficiaryId, `Complaint ${t.ticketNo} closed`)
      setClosing(null)
    }
  }

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <div className="search-box table-search grow">
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search ticket, site, description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row">
          <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="primary-btn" disabled={!sites.length} onClick={() => setCreating({ id: '', ticketNo: '', beneficiaryId: '', source: 'Consumer', description: '', openedAt: '', status: 'Open', resolution: '' })}>
            <Plus className="w-4 h-4" /> New complaint
          </button>
        </div>
      </div>
      {tickets.length === 0 ? (
        <EmptyBlock title="No complaint tickets" text={sites.length ? 'Tickets from consumers, CSPDCL or monitoring alerts are logged here.' : 'Complaints can be raised once sites are commissioned.'} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Site</th>
                  <th>Source</th>
                  <th>Description</th>
                  <th>Opened</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((t) => {
                  const b = benMap.get(t.beneficiaryId)
                  const age = t.status === 'Closed' && t.closedAt ? (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 3_600_000 : hoursSince(t.openedAt)
                  const late = age > limit
                  return (
                    <tr key={t.id}>
                      <td className="strong-cell">{t.ticketNo}</td>
                      <td>
                        <div className="cell-title">
                          <strong>{b?.name || 'Deleted site'}</strong>
                          <small>{b?.appNo}</small>
                        </div>
                      </td>
                      <td>{t.source}</td>
                      <td style={{ maxWidth: 260 }}>
                        {t.description}
                        {t.resolution && (
                          <>
                            <br />
                            <small className="muted">Resolution: {t.resolution}</small>
                          </>
                        )}
                      </td>
                      <td>{fmtDateTime(t.openedAt)}</td>
                      <td>
                        <Chip tone={late ? 'bad' : t.status === 'Closed' ? 'good' : 'info'}>
                          {Math.round(age)}h{late ? ` (> ${limit}h)` : ''}
                        </Chip>
                      </td>
                      <td>
                        <Chip tone={t.status === 'Closed' ? 'good' : t.status === 'In Progress' ? 'info' : 'warn'}>{t.status}</Chip>
                      </td>
                      <td className="text-right">
                        <div className="row-actions">
                          {t.status === 'Open' && (
                            <button type="button" className="outline-btn btn-sm" onClick={() => start(t)}>
                              <PlayCircle className="w-3 h-3" /> Start
                            </button>
                          )}
                          {t.status !== 'Closed' && (
                            <button type="button" className="outline-btn btn-sm" onClick={() => setClosing({ ...t })}>
                              <CheckCircle2 className="w-3 h-3" /> Close
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && <EmptyBlock title="No tickets match" />}
          </div>
          <Pager {...paged} />
        </>
      )}

      {creating && (
        <Modal
          size="narrow"
          eyebrow="CMC & Service"
          title="New complaint ticket"
          onClose={() => setCreating(null)}
          onSubmit={() => create(creating)}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setCreating(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                <Save className="w-4 h-4" /> Open ticket
              </button>
            </>
          }
        >
          <SelectField label="Site" required value={creating.beneficiaryId} onChange={(v) => setCreating({ ...creating, beneficiaryId: v })} options={sites.map((s) => ({ value: s.id, label: `${s.appNo} — ${s.name}` }))} />
          <SelectField label="Source" required value={creating.source} onChange={(v) => setCreating({ ...creating, source: (v || 'Consumer') as ComplaintTicket['source'] })} options={SOURCES} />
          <TextArea label="Description" required value={creating.description} onChange={(v) => setCreating({ ...creating, description: v })} />
          <small className="muted">Target closure: {limit} hours.</small>
        </Modal>
      )}
      {closing && (
        <Modal
          size="narrow"
          eyebrow={closing.ticketNo}
          title="Close complaint"
          onClose={() => setClosing(null)}
          onSubmit={() => close(closing)}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setClosing(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                <CheckCircle2 className="w-4 h-4" /> Close ticket
              </button>
            </>
          }
        >
          <p style={{ fontSize: 12 }}>{closing.description}</p>
          <TextArea label="Resolution" required value={closing.resolution} onChange={(v) => setClosing({ ...closing, resolution: v })} />
        </Modal>
      )}
    </section>
  )
}
