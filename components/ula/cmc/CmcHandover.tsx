'use client'

import React, { useMemo, useState } from 'react'
import { Search, Save, Handshake } from 'lucide-react'
import { EmptyBlock, Chip, FileChip, Modal, DateField, FileField, TextArea, NoteBanner, usePaged, Pager, reportSave, toast, useUserName } from '../ui'
import { useLotMap } from '@/lib/ula/data'
import { useCollection, upsert, logActivity } from '@/lib/ula/storage'
import { fmtDate, today, daysBetween } from '@/lib/ula/workflow'
import type { Beneficiary, HandoverRecord } from '@/lib/ula/types'
import { addMonths } from './cmc-logic'

/** Warranty transfer deed to the beneficiary at the end of the 5-year CMC (Sec-1 cl. 1.8, 2.5). */
export function CmcHandover({ sites }: { sites: Beneficiary[] }) {
  const handovers = useCollection<HandoverRecord>('handovers')
  const lots = useLotMap()
  const user = useUserName()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'All' | 'Due' | 'Done' | 'Upcoming'>('All')
  const [edit, setEdit] = useState<{ b: Beneficiary; rec: HandoverRecord } | null>(null)
  const hMap = useMemo(() => new Map(handovers.map((h) => [h.id, h])), [handovers])

  const rows = sites
    .map((b) => {
      const end = addMonths(b.commissioning.commissionedDate, 60)
      const h = hMap.get(b.id)
      const done = !!(h?.warrantyDeedDate && h.deed)
      const state = done ? 'Done' : end <= today() ? 'Due' : 'Upcoming'
      return { b, end, h, done, state }
    })
    .filter((r) => {
      const t = q.toLowerCase()
      return (!t || [r.b.appNo, r.b.name].some((x) => x.toLowerCase().includes(t))) && (filter === 'All' || r.state === filter)
    })
    .sort((a, b) => a.end.localeCompare(b.end))
  const paged = usePaged(rows, 25)

  const save = () => {
    if (!edit) return
    const { b, rec } = edit
    if (!rec.warrantyDeedDate) return toast('Deed date is required', 'error')
    if (!rec.deed) return toast('Upload the signed warranty transfer deed', 'error')
    if (reportSave(upsert('handovers', { ...rec, id: b.id }), `Handover recorded for ${b.name}`)) {
      logActivity(user, 'Beneficiary', b.id, 'Warranty transfer deed recorded (CMC handover)')
      setEdit(null)
    }
  }

  if (!sites.length)
    return (
      <section className="card">
        <EmptyBlock icon={Handshake} title="No commissioned sites" text="Handover falls due 5 years after each site’s commissioning date." />
      </section>
    )

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <div className="search-box table-search grow">
          <Search className="w-4 h-4 text-slate-400" />
          <input placeholder="Search site…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
          {['All', 'Due', 'Upcoming', 'Done'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Site</th>
              <th>Lot</th>
              <th>Commissioned</th>
              <th>CMC ends</th>
              <th>Deed</th>
              <th>Status</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((r) => (
              <tr key={r.b.id}>
                <td>
                  <div className="cell-title">
                    <strong>{r.b.name}</strong>
                    <small>{r.b.appNo}</small>
                  </div>
                </td>
                <td>{lots.get(r.b.lotId)?.lotNo || '—'}</td>
                <td>{fmtDate(r.b.commissioning.commissionedDate)}</td>
                <td>{fmtDate(r.end)}</td>
                <td>{r.h?.deed ? <FileChip file={r.h.deed} /> : '—'}</td>
                <td>
                  {r.state === 'Done' ? (
                    <Chip tone="good">Transferred {fmtDate(r.h?.warrantyDeedDate)}</Chip>
                  ) : r.state === 'Due' ? (
                    <Chip tone="bad">Due</Chip>
                  ) : (
                    <Chip tone="info">In {daysBetween(today(), r.end)} days</Chip>
                  )}
                </td>
                <td className="text-right">
                  <button type="button" className="outline-btn btn-sm" onClick={() => setEdit({ b: r.b, rec: r.h ? { ...r.h } : { id: r.b.id, warrantyDeedDate: '', remarks: '' } })}>
                    {r.done ? 'Edit' : 'Record handover'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyBlock title="No sites match" />}
      </div>
      <Pager {...paged} />
      {edit && (
        <Modal
          size="narrow"
          eyebrow={edit.b.appNo}
          title={`Handover — ${edit.b.name}`}
          onClose={() => setEdit(null)}
          onSubmit={save}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                <Save className="w-4 h-4" /> Save
              </button>
            </>
          }
        >
          {addMonths(edit.b.commissioning.commissionedDate, 60) > today() && <NoteBanner>The 5-year CMC for this site has not ended yet ({fmtDate(addMonths(edit.b.commissioning.commissionedDate, 60))}). Record early only if CSPDCL has approved it.</NoteBanner>}
          <DateField label="Warranty transfer deed date" required value={edit.rec.warrantyDeedDate} max={today()} onChange={(v) => setEdit({ ...edit, rec: { ...edit.rec, warrantyDeedDate: v } })} />
          <FileField label="Signed deed" required value={edit.rec.deed} onChange={(f) => setEdit({ ...edit, rec: { ...edit.rec, deed: f } })} />
          <TextArea label="Remarks" value={edit.rec.remarks} onChange={(v) => setEdit({ ...edit, rec: { ...edit.rec, remarks: v } })} />
        </Modal>
      )}
    </section>
  )
}
