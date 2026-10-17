'use client'

import React, { useMemo, useState } from 'react'
import { Upload, Download, CheckCircle2, AlertTriangle, ClipboardPaste } from 'lucide-react'
import { Modal, NoteBanner, Chip, toast, reportSave, useUserName } from '../ui'
import { useBeneficiaries } from '@/lib/ula/data'
import { upsertMany, newId, logActivity } from '@/lib/ula/storage'
import { blankBeneficiary, parseDelimited, downloadCsv } from '@/lib/ula/workflow'
import type { Beneficiary, Lot } from '@/lib/ula/types'

// Column aliases so the CSPDCL sheet can be pasted as-is (open point: confirm the final CSPDCL format).
const COLUMNS: { key: keyof Beneficiary; label: string; required: boolean; aliases: string[] }[] = [
  { key: 'appNo', label: 'Application No', required: true, aliases: ['application no', 'application number', 'app no', 'pm surya ghar application', 'registration no', 'application id'] },
  { key: 'name', label: 'Beneficiary Name', required: true, aliases: ['name', 'beneficiary name', 'consumer name', 'applicant name'] },
  { key: 'address', label: 'Address', required: true, aliases: ['address', 'site address', 'installation address'] },
  { key: 'mobile', label: 'Mobile', required: true, aliases: ['mobile', 'mobile no', 'phone', 'contact no'] },
  { key: 'consumerNo', label: 'Consumer (BP) No', required: true, aliases: ['consumer no', 'bp no', 'bp number', 'consumer number', 'service no'] },
  { key: 'sanctionedKw', label: 'Sanctioned kW', required: true, aliases: ['sanctioned kw', 'kw', 'capacity', 'capacity kw', 'kwp', 'sanctioned capacity'] },
  { key: 'district', label: 'District', required: false, aliases: ['district'] },
  { key: 'division', label: 'Division', required: false, aliases: ['division'] },
  { key: 'subDivision', label: 'Sub-division', required: false, aliases: ['sub-division', 'sub division', 'subdivision'] },
  { key: 'aeName', label: 'AE Name', required: false, aliases: ['ae', 'ae name', 'assistant engineer'] },
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

interface ParsedRow {
  line: number
  values: Partial<Record<keyof Beneficiary, string>>
  errors: string[]
  warnings: string[]
}

export function BeneficiaryImport({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const all = useBeneficiaries()
  const user = useUserName()
  const [text, setText] = useState('')

  const existingAppNos = useMemo(() => new Map(all.map((b) => [b.appNo.trim().toLowerCase(), b])), [all])

  const parsed = useMemo(() => {
    if (!text.trim()) return null
    const rows = parseDelimited(text)
    if (rows.length < 2) return { error: 'Need a header row and at least one data row.', rows: [] as ParsedRow[], mapping: [] as (keyof Beneficiary | null)[] }
    const header = rows[0].map(norm)
    const mapping = header.map((h) => {
      const col = COLUMNS.find((c) => c.aliases.some((a) => norm(a) === h) || norm(c.label) === h)
      return col ? col.key : null
    })
    const missing = COLUMNS.filter((c) => c.required && !mapping.includes(c.key))
    if (missing.length) return { error: `Missing required column(s): ${missing.map((m) => m.label).join(', ')}`, rows: [] as ParsedRow[], mapping }
    const seen = new Set<string>()
    const out: ParsedRow[] = rows.slice(1).map((r, i) => {
      const values: ParsedRow['values'] = {}
      mapping.forEach((k, ci) => {
        if (k) values[k] = (r[ci] || '').trim()
      })
      const errors: string[] = []
      const warnings: string[] = []
      COLUMNS.filter((c) => c.required).forEach((c) => {
        if (!values[c.key]) errors.push(`${c.label} missing`)
      })
      const app = (values.appNo || '').toLowerCase()
      if (app) {
        if (seen.has(app)) errors.push('Duplicate application no. in this file')
        const ex = existingAppNos.get(app)
        if (ex) errors.push(ex.lotId === lot.id ? 'Already in this lot' : 'Already allotted in another lot')
        seen.add(app)
      }
      const kw = Number(values.sanctionedKw)
      if (values.sanctionedKw && (!isFinite(kw) || kw <= 0)) errors.push('Sanctioned kW must be a positive number')
      const mob = (values.mobile || '').replace(/\D/g, '')
      if (values.mobile && mob.length !== 10 && mob.length !== 12) warnings.push('Mobile is not 10 digits')
      if (!values.district) warnings.push(`District blank — lot district (${lot.district}) will be used`)
      return { line: i + 2, values, errors, warnings }
    })
    return { error: '', rows: out, mapping }
  }, [text, existingAppNos, lot.id, lot.district])

  const valid = parsed?.rows.filter((r) => !r.errors.length) || []
  const invalid = parsed?.rows.filter((r) => r.errors.length) || []

  const loadFile = async (f?: File) => {
    if (!f) return
    if (/\.xlsx?$/i.test(f.name)) {
      toast('Excel files cannot be read directly in this version. Open the sheet in Excel, select all cells, copy and paste here — or save as CSV.', 'error')
      return
    }
    setText(await f.text())
  }

  const commit = () => {
    if (!valid.length) return
    const records: Beneficiary[] = valid.map((r) =>
      blankBeneficiary({
        id: newId('BEN'),
        lotId: lot.id,
        appNo: r.values.appNo || '',
        name: r.values.name || '',
        address: r.values.address || '',
        mobile: r.values.mobile || '',
        consumerNo: r.values.consumerNo || '',
        sanctionedKw: Number(r.values.sanctionedKw) || 0,
        district: r.values.district || lot.district,
        division: r.values.division || lot.division,
        subDivision: r.values.subDivision || '',
        aeName: r.values.aeName || '',
      })
    )
    if (reportSave(upsertMany('beneficiaries', records), `${records.length} beneficiaries imported into ${lot.lotNo}`)) {
      logActivity(user, 'Lot', lot.id, `Imported ${records.length} beneficiaries${invalid.length ? ` (${invalid.length} rows skipped)` : ''}`)
      records.forEach((b) => logActivity(user, 'Beneficiary', b.id, `Imported into ${lot.lotNo}`))
      onClose()
    }
  }

  return (
    <Modal
      size="wide"
      eyebrow={`Lot ${lot.lotNo}`}
      title="Import CSPDCL beneficiary list"
      subtitle="Paste rows copied from the CSPDCL Excel sheet (header row included), or choose a CSV file."
      onClose={onClose}
      footer={
        <>
          <span className="muted" style={{ fontSize: 11, marginRight: 'auto' }}>
            {parsed && !parsed.error ? `${valid.length} valid · ${invalid.length} with errors (skipped)` : ''}
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-btn" disabled={!valid.length} onClick={commit}>
            <CheckCircle2 className="w-4 h-4" /> Import {valid.length || ''} rows
          </button>
        </>
      }
    >
      <NoteBanner>
        Required columns: {COLUMNS.filter((c) => c.required).map((c) => c.label).join(', ')}. Optional: {COLUMNS.filter((c) => !c.required).map((c) => c.label).join(', ')}. Application numbers must be unique across all lots.
      </NoteBanner>
      <div className="row">
        <label className="outline-btn" style={{ position: 'relative' }}>
          <Upload className="w-4 h-4" /> Choose CSV file
          <input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" style={{ position: 'absolute', inset: 0, opacity: 0 }} onChange={(e) => loadFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="outline-btn" onClick={() => downloadCsv('beneficiary-import-template.csv', [COLUMNS.map((c) => c.label)])}>
          <Download className="w-4 h-4" /> Download template
        </button>
        {text && (
          <button type="button" className="outline-btn" onClick={() => setText('')}>
            Clear
          </button>
        )}
      </div>
      <label className="field">
        <span>
          <ClipboardPaste className="w-3.5 h-3.5 inline" /> Paste data
        </span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={COLUMNS.map((c) => c.label).join('\t')} style={{ fontFamily: 'monospace', fontSize: 11 }} />
      </label>

      {parsed?.error && (
        <div className="gate-box bad">
          <strong>
            <AlertTriangle className="w-4 h-4" /> {parsed.error}
          </strong>
        </div>
      )}

      {parsed && !parsed.error && (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Application</th>
                <th>Name</th>
                <th>Consumer no.</th>
                <th>kW</th>
                <th>District</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 300).map((r) => (
                <tr key={r.line}>
                  <td>{r.line}</td>
                  <td>{r.values.appNo}</td>
                  <td>{r.values.name}</td>
                  <td>{r.values.consumerNo}</td>
                  <td>{r.values.sanctionedKw}</td>
                  <td>{r.values.district || lot.district}</td>
                  <td>
                    {r.errors.length ? (
                      <Chip tone="bad">{r.errors.join('; ')}</Chip>
                    ) : r.warnings.length ? (
                      <Chip tone="warn">{r.warnings.join('; ')}</Chip>
                    ) : (
                      <Chip tone="good">OK</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.rows.length > 300 && <div className="pager">Showing first 300 of {parsed.rows.length} rows (all valid rows will be imported)</div>}
        </div>
      )}
    </Modal>
  )
}
