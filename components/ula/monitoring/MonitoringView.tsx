'use client'

import React, { useMemo, useState } from 'react'
import { Search, Pencil, Save, Plus, Trash2, Radio, Download } from 'lucide-react'
import { PageHeader, MiniStat, EmptyBlock, Chip, Modal, DateField, NumberField, TextField, FormSection, NoteBanner, usePaged, Pager, reportSave, toast, useUserName } from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { useBeneficiaries, useLotMap } from '@/lib/ula/data'
import { useCollection, upsert, logActivity } from '@/lib/ula/storage'
import { fmtDate, fmtDateTime, hoursSince, daysBetween, today, downloadCsv } from '@/lib/ula/workflow'
import type { Beneficiary, MonitoringRecord } from '@/lib/ula/types'

const NOT_REPORTING_HOURS = 24
const SIM_ALERT_DAYS = 15

// Not reporting: no data for 24 h — since the last data point, or since installation if none has arrived yet.
function flags(m: MonitoringRecord | undefined, b: Beneficiary) {
  const since = m?.lastDataAt || b.installation.installedAt || ''
  const notReporting = !!since && hoursSince(since) > NOT_REPORTING_HOURS
  const simDays = m?.simExpiry ? daysBetween(today(), m.simExpiry) : null
  const simDue = simDays !== null && simDays <= SIM_ALERT_DAYS
  return { notReporting, simDays, simDue }
}

function blank(id: string): MonitoringRecord {
  return { id, simExpiry: '', lastDataAt: '', firstDataAt: '', generation: [], todayKwh: 0 }
}

export function MonitoringView() {
  const bens = useBeneficiaries()
  const lots = useLotMap()
  const records = useCollection<MonitoringRecord>('monitoring')
  const [q, setQ] = useState('')
  const [flag, setFlag] = useState<'' | 'not' | 'sim'>('')
  const [edit, setEdit] = useState<{ b: Beneficiary; m: MonitoringRecord } | null>(null)
  const [view, setView] = useState<string | null>(null)
  const mMap = useMemo(() => new Map(records.map((r) => [r.id, r])), [records])

  const sites = useMemo(() => bens.filter((b) => b.installation.loggerId.trim()), [bens])
  const rows = sites
    .map((b) => ({ b, m: mMap.get(b.id), f: flags(mMap.get(b.id), b) }))
    .filter((r) => {
      const t = q.toLowerCase()
      return (!t || [r.b.appNo, r.b.name, r.b.installation.loggerId, r.b.installation.simNo, r.b.district].some((x) => x?.toLowerCase().includes(t))) && (!flag || (flag === 'not' ? r.f.notReporting : r.f.simDue))
    })
  const paged = usePaged(rows, 25)

  const notCount = sites.filter((b) => flags(mMap.get(b.id), b).notReporting).length
  const simCount = sites.filter((b) => flags(mMap.get(b.id), b).simDue).length
  const monthKey = today().slice(0, 7)
  const monthKwh = records.reduce((a, r) => a + (r.generation.find((g) => g.month === monthKey)?.kwh || 0), 0)

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="CMC & Monitoring"
        title="System Info (Monitoring)"
        description="Data logger and M2M SIM per site, last data received, daily and monthly generation. Sites with no data for 24 hours are flagged as not reporting."
        actions={
          <button
            type="button"
            className="outline-btn"
            disabled={!sites.length}
            onClick={() =>
              downloadCsv('monitoring.csv', [
                ['Application', 'Name', 'Logger ID', 'SIM', 'SIM expiry', 'First data', 'Last data', 'Today kWh', `kWh ${monthKey}`, 'Not reporting', 'SIM due'],
                ...rows.map((r) => [r.b.appNo, r.b.name, r.b.installation.loggerId, r.b.installation.simNo, r.m?.simExpiry, r.m?.firstDataAt, r.m?.lastDataAt, r.m?.todayKwh, r.m?.generation.find((g) => g.month === monthKey)?.kwh, r.f.notReporting ? 'Yes' : 'No', r.f.simDue ? 'Yes' : 'No']),
              ])
            }
          >
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />
      <NoteBanner>
        The live M2M / National Portal data feed needs a backend integration and is <strong>not connected</strong> in this phase. Last-data time and generation are entered manually from the monitoring portal; the alerts below are computed from those entries.
      </NoteBanner>
      <div className="mini-stats" style={{ marginTop: 14 }}>
        <MiniStat label="Sites with logger" value={sites.length} active={!flag} onClick={() => setFlag('')} />
        <MiniStat label="Not reporting (> 24 h)" value={notCount} tone={notCount ? 'bad' : 'good'} active={flag === 'not'} onClick={() => setFlag('not')} />
        <MiniStat label={`SIM recharge due (≤ ${SIM_ALERT_DAYS} d)`} value={simCount} tone={simCount ? 'warn' : undefined} active={flag === 'sim'} onClick={() => setFlag('sim')} />
        <MiniStat label={`Generation ${monthKey}`} value={`${monthKwh.toLocaleString('en-IN')} kWh`} hint="Sum of entered monthly figures" />
      </div>

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder="Search site, logger ID, SIM…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {sites.length === 0 ? (
          <EmptyBlock icon={Radio} title="No data loggers installed" text="Sites appear here once the installer records the data logger ID and SIM number in Installation." />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Lot</th>
                    <th>Logger / SIM</th>
                    <th>SIM expiry</th>
                    <th>First data</th>
                    <th>Last data</th>
                    <th>Today</th>
                    <th>This month</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map(({ b, m, f }) => (
                    <tr key={b.id}>
                      <td>
                        <button type="button" className="cell-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setView(b.id)}>
                          <strong>{b.name}</strong>
                          <small>
                            {b.appNo} · {b.sanctionedKw} kW
                          </small>
                        </button>
                      </td>
                      <td>{lots.get(b.lotId)?.lotNo || '—'}</td>
                      <td>
                        {b.installation.loggerId}
                        <br />
                        <small className="muted">{b.installation.simNo || 'SIM not recorded'}</small>
                      </td>
                      <td>{m?.simExpiry ? <Chip tone={f.simDue ? (f.simDays! < 0 ? 'bad' : 'warn') : undefined}>{fmtDate(m.simExpiry)}{f.simDays! < 0 ? ' · expired' : f.simDue ? ` · ${f.simDays}d` : ''}</Chip> : <Chip tone="warn">Not set</Chip>}</td>
                      <td>{fmtDate(m?.firstDataAt)}</td>
                      <td>{f.notReporting ? <Chip tone="bad">{m?.lastDataAt ? `Not reporting · ${fmtDateTime(m.lastDataAt)}` : 'No data since installation'}</Chip> : m?.lastDataAt ? <Chip tone="good">{fmtDateTime(m.lastDataAt)}</Chip> : <Chip tone="info">Awaiting first data</Chip>}</td>
                      <td>{m?.todayKwh ? `${m.todayKwh} kWh` : '—'}</td>
                      <td>{m?.generation.find((g) => g.month === monthKey)?.kwh ?? '—'}</td>
                      <td className="text-right">
                        <button type="button" className="outline-btn btn-sm" onClick={() => setEdit({ b, m: m ? { ...m, generation: [...m.generation] } : blank(b.id) })}>
                          <Pencil className="w-3 h-3" /> Update
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <EmptyBlock title="No sites match" />}
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>
      {edit && <MonitoringModal b={edit.b} initial={edit.m} onClose={() => setEdit(null)} />}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </div>
  )
}

function MonitoringModal({ b, initial, onClose }: { b: Beneficiary; initial: MonitoringRecord; onClose: () => void }) {
  const user = useUserName()
  const [m, setM] = useState<MonitoringRecord>(initial)
  // datetime-local wants YYYY-MM-DDTHH:mm in local time
  const toLocal = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const off = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - off).toISOString().slice(0, 16)
  }

  const save = () => {
    if (m.firstDataAt && m.firstDataAt > today()) return toast('First data date cannot be in the future', 'error')
    if (m.lastDataAt && new Date(m.lastDataAt).getTime() > Date.now() + 60_000) return toast('Last data time cannot be in the future', 'error')
    if (m.firstDataAt && m.lastDataAt && m.lastDataAt.slice(0, 10) < m.firstDataAt) return toast('Last data cannot be before first data', 'error')
    if (m.generation.some((g) => !/^\d{4}-\d{2}$/.test(g.month) || g.kwh < 0)) return toast('Each generation row needs a month and non-negative kWh', 'error')
    if (new Set(m.generation.map((g) => g.month)).size !== m.generation.length) return toast('Duplicate month in generation entries', 'error')
    const rec = { ...m, id: b.id, generation: [...m.generation].sort((a, c) => c.month.localeCompare(a.month)) }
    if (reportSave(upsert('monitoring', rec), `Monitoring data saved for ${b.name}`)) {
      logActivity(user, 'Beneficiary', b.id, 'Monitoring data updated')
      onClose()
    }
  }

  return (
    <Modal
      eyebrow={`${b.appNo} · Logger ${b.installation.loggerId}`}
      title={`Monitoring — ${b.name}`}
      onClose={onClose}
      onSubmit={save}
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
      <div className="form-grid">
        <TextField label="Data logger ID" value={b.installation.loggerId} onChange={() => {}} disabled hint="Recorded at installation" />
        <TextField label="SIM number" value={b.installation.simNo} onChange={() => {}} disabled hint="Recorded at installation" />
        <DateField label="SIM expiry / recharge date" value={m.simExpiry} onChange={(v) => setM({ ...m, simExpiry: v })} />
        <DateField label="First data received" value={m.firstDataAt} max={today()} onChange={(v) => setM({ ...m, firstDataAt: v })} />
        <label className="field">
          <span>Last data received</span>
          <input type="datetime-local" value={toLocal(m.lastDataAt)} onChange={(e) => setM({ ...m, lastDataAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <small className="hint">Flagged "not reporting" after {NOT_REPORTING_HOURS} hours</small>
        </label>
        <NumberField label="Today's generation (kWh)" value={m.todayKwh} min={0} onChange={(v) => setM({ ...m, todayKwh: v })} />
      </div>
      <FormSection
        title="Monthly generation"
        aside={
          <button type="button" className="outline-btn btn-sm" onClick={() => setM({ ...m, generation: [{ month: today().slice(0, 7), kwh: 0 }, ...m.generation] })}>
            <Plus className="w-3 h-3" /> Add month
          </button>
        }
      >
        {m.generation.length === 0 && <span className="muted" style={{ fontSize: 11 }}>No monthly figures yet.</span>}
        <div className="stack" style={{ gap: 8 }}>
          {m.generation.map((g, i) => (
            <div key={i} className="form-grid" style={{ gridTemplateColumns: '1fr 1fr auto', alignItems: 'end' }}>
              <label className="field">
                <span>Month</span>
                <input type="month" value={g.month} onChange={(e) => setM({ ...m, generation: m.generation.map((x, j) => (j === i ? { ...x, month: e.target.value } : x)) })} />
              </label>
              <NumberField label="kWh" value={g.kwh} min={0} onChange={(v) => setM({ ...m, generation: m.generation.map((x, j) => (j === i ? { ...x, kwh: v } : x)) })} />
              <button type="button" className="action-icon-btn danger" title="Remove" onClick={() => setM({ ...m, generation: m.generation.filter((_, j) => j !== i) })}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </FormSection>
    </Modal>
  )
}
