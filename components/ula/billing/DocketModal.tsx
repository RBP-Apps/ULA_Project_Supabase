'use client'

import React, { useMemo, useState } from 'react'
import { Printer, Save, Send, AlertTriangle, CheckCircle2, Eye } from 'lucide-react'
import { Modal, FormSection, TextField, DateField, NumberField, TextArea, NoteBanner, Chip, ProgressBar, toast, reportSave, useUserName, confirmAction } from '../ui'
import { BeneficiaryDrawer } from '../BeneficiaryDrawer'
import { useLots, useBeneficiaries, usePurchaseOrders, useDispatches, useContracts } from '@/lib/ula/data'
import { useCollection, upsert, newId, logActivity, getAll } from '@/lib/ula/storage'
import { useSettings, fmtInr, fmtDate, today } from '@/lib/ula/workflow'
import type { Docket, PaymentFollowUp, PaymentSource } from '@/lib/ula/types'
import { lotBilling, docketHtml } from './docket-logic'

const DEFAULT_OFFICE = 'ED (RA&PM), CSPDCL, Raipur'

export function DocketModal({ lotId, onClose }: { lotId: string; onClose: () => void }) {
  const lots = useLots()
  const bens = useBeneficiaries()
  const pos = usePurchaseOrders()
  const dispatches = useDispatches()
  const contracts = useContracts()
  const dockets = useCollection<Docket>('dockets')
  const settings = useSettings()
  const user = useUserName()
  const lot = lots.find((l) => l.id === lotId)
  const existing = dockets.find((d) => d.lotId === lotId)
  const billing = useMemo(() => (lot ? lotBilling(lot, bens, pos, dispatches, settings, existing) : null), [lot, bens, pos, dispatches, settings, existing])
  const [view, setView] = useState<string | null>(null)

  const [d, setD] = useState<Docket>(
    existing || {
      id: '',
      lotId,
      invoiceNo: '',
      invoiceDate: today(),
      invoiceAmount: 0,
      gstPercent: NaN, // must be entered explicitly
      status: 'Draft',
      copies: 3,
      inwardNo: '',
      office: DEFAULT_OFFICE,
      remarks: '',
    }
  )
  const [gstText, setGstText] = useState(existing && isFinite(existing.gstPercent) ? String(existing.gstPercent) : '')
  const [sub, setSub] = useState({ inwardNo: existing?.inwardNo || '', date: existing?.submittedAt?.slice(0, 10) || today(), office: existing?.office || DEFAULT_OFFICE, cfa: 0, sfa: 0 })

  if (!lot || !billing) return null
  const contract = contracts.find((c) => c.id === lot.contractId)
  const submitted = existing?.status === 'Submitted'
  const amount = Math.round(billing.summary.value)
  const gst = gstText === '' ? NaN : Number(gstText)
  const total = isFinite(gst) ? amount + (amount * gst) / 100 : NaN
  const receivable = isFinite(total) ? Math.round((total * (100 - settings.cmcSharePercent)) / 100) : 0
  const lotPos = pos.filter((p) => p.lotId === lot.id && p.status === 'Received')
  const dcrRef = lotPos.filter((p) => p.grn?.dcrCertificate).map((p) => `${p.poNo} / GRN ${p.grn?.grnNo} (${p.grn?.dcrCertificate?.name})`).join('; ') || 'Not on record'

  const validateDocket = (): string | null => {
    if (!billing.gateOpen) return 'Billing gate is closed.'
    if (!d.invoiceNo.trim()) return 'Invoice number is required.'
    const dup = getAll<Docket>('dockets').find((x) => x.id !== d.id && x.invoiceNo.trim().toLowerCase() === d.invoiceNo.trim().toLowerCase())
    if (dup) return 'This invoice number is already used for another lot.'
    if (!d.invoiceDate) return 'Invoice date is required.'
    if (!isFinite(gst) || gst < 0 || gst > 28) return 'Enter the GST rate (%) applicable to this invoice.'
    return null
  }

  const saveDocket = (status: Docket['status'] = d.status === 'Submitted' ? 'Submitted' : d.status): Docket | null => {
    const err = validateDocket()
    if (err) {
      toast(err, 'error')
      return null
    }
    const saved: Docket = { ...d, id: d.id || newId('DKT'), invoiceNo: d.invoiceNo.trim(), invoiceAmount: amount, gstPercent: gst, status }
    if (!reportSave(upsert('dockets', saved), status === 'Printed' ? 'Docket saved and sent to print' : 'Docket draft saved')) return null
    logActivity(user, 'Docket', saved.id, `Docket ${status.toLowerCase()} for ${lot.lotNo} — invoice ${saved.invoiceNo}`)
    setD(saved)
    return saved
  }

  const print = (doc: Docket) => {
    const w = window.open('', '_blank')
    if (!w) {
      toast('Pop-up blocked. Allow pop-ups for this site to print the docket.', 'error')
      return
    }
    w.document.write(docketHtml(lot, contract, doc, billing, dcrRef))
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const submit = () => {
    const doc = saveDocket(d.status === 'Draft' ? 'Draft' : d.status)
    if (!doc) return
    if (!sub.inwardNo.trim()) return toast('Inward number is required to record submission.', 'error')
    if (!sub.office.trim()) return toast('Office is required.', 'error')
    if (!sub.date || sub.date > today()) return toast('Submission date must be today or earlier.', 'error')
    if (sub.date < doc.invoiceDate) return toast('Submission date cannot be before the invoice date.', 'error')
    const hasPayment = getAll<PaymentFollowUp>('payments').some((p) => p.lotId === lotId)
    if (!hasPayment) {
      if (!(sub.cfa >= 0 && sub.sfa >= 0) || sub.cfa + sub.sfa <= 0) return toast('Enter the expected receivable split by source.', 'error')
      if (Math.abs(sub.cfa + sub.sfa - receivable) > 1 && !confirmAction(`The split totals ${fmtInr(sub.cfa + sub.sfa)}, not the computed ${fmtInr(receivable)} (${100 - settings.cmcSharePercent}% of invoice). Save anyway?`)) return
    }
    if (!confirmAction(`Record docket for ${lot.lotNo} as submitted to ${sub.office} (inward ${sub.inwardNo})? Billing records of this lot will be locked.`)) return
    const final: Docket = { ...doc, status: 'Submitted', inwardNo: sub.inwardNo.trim(), office: sub.office.trim(), submittedAt: new Date(`${sub.date}T12:00:00`).toISOString() }
    let ok = upsert('dockets', final)
    if (ok && !hasPayment) {
      const expected: { source: PaymentSource; amount: number }[] = [
        { source: 'CFA (MNRE)', amount: sub.cfa },
        { source: 'SFA + District share (CSPDCL)', amount: sub.sfa },
      ]
      const pf: PaymentFollowUp = {
        id: newId('PAY'),
        lotId,
        expected,
        movements: [{ id: newId('MOV'), desk: `Docket submitted — ${final.office}`, date: sub.date, remarks: `Inward ${final.inwardNo}` }],
        queries: [],
        receipts: [],
        closed: false,
      }
      ok = upsert('payments', pf)
      if (ok) logActivity(user, 'Payment', pf.id, `Payment follow-up opened for ${lot.lotNo}`)
    }
    if (reportSave(ok, `Docket for ${lot.lotNo} recorded as submitted`)) {
      logActivity(user, 'Docket', final.id, `Submitted to ${final.office}, inward ${final.inwardNo}`)
      setD(final)
    }
  }

  return (
    <Modal
      size="wide"
      eyebrow={`Lot ${lot.lotNo} · ${lot.district}`}
      title={submitted ? 'Lot docket (submitted)' : 'Build lot docket'}
      subtitle={`${billing.summary.activeSites} sites · ${billing.summary.kw} kW · lot value ${fmtInr(amount)} excl. GST`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
          {billing.gateOpen && !submitted && (
            <button type="button" className="outline-btn" onClick={() => saveDocket()}>
              <Save className="w-4 h-4" /> Save draft
            </button>
          )}
          {billing.gateOpen && (
            <button
              type="button"
              className="outline-btn"
              onClick={() => {
                const doc = submitted ? existing! : saveDocket('Printed')
                if (doc) print(doc)
              }}
            >
              <Printer className="w-4 h-4" /> {submitted ? 'Reprint' : 'Print docket'}
            </button>
          )}
        </>
      }
    >
      {/* Gate */}
      {billing.gateOpen ? (
        <div className="gate-box ok">
          <strong>
            <CheckCircle2 className="w-4 h-4" /> Billing gate open — all {billing.rows.length} sites commissioned with complete 22-item checklists.
          </strong>
        </div>
      ) : (
        <div className="gate-box">
          <strong>
            <AlertTriangle className="w-4 h-4" /> Lot cannot be billed yet
          </strong>
          <ul>
            {!billing.summary.activeSites && <li>No active beneficiaries in this lot.</li>}
            {billing.summary.activeSites > 0 && !billing.summary.allCommissioned && (
              <li>
                {billing.summary.activeSites - billing.summary.commissioned} of {billing.summary.activeSites} sites not commissioned
              </li>
            )}
            {billing.incomplete.length > 0 && <li>{billing.incomplete.length} site(s) with incomplete billing checklist (below)</li>}
          </ul>
        </div>
      )}

      {billing.incomplete.length > 0 && (
        <FormSection title={`Missing items by beneficiary (${billing.incomplete.length})`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Beneficiary</th>
                  <th>Checklist</th>
                  <th>Missing items</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {billing.incomplete.slice(0, 200).map((r) => (
                  <tr key={r.b.id}>
                    <td>
                      <div className="cell-title">
                        <strong>{r.b.name}</strong>
                        <small>{r.b.appNo}</small>
                      </div>
                    </td>
                    <td>
                      <ProgressBar pct={r.pct} />
                    </td>
                    <td style={{ whiteSpace: 'normal' }}>{r.missing.join('; ')}</td>
                    <td>
                      <button type="button" className="action-icon-btn" onClick={() => setView(r.b.id)} title="View record">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FormSection>
      )}

      {billing.gateOpen && (
        <>
          <FormSection title="Docket index (auto-built)">
            <div className="kv-grid">
              {[
                ['Tax invoice', d.invoiceNo || 'To be numbered'],
                ['SOR / site schedule', `${billing.rows.length} sites`],
                ['JIRs', `${billing.rows.filter((r) => r.b.commissioning.jir).length} / ${billing.rows.length}`],
                ['Installation reports', `${billing.rows.filter((r) => r.b.installation.installReport).length} / ${billing.rows.length}`],
                ['Portal completion reports', `${billing.rows.filter((r) => r.b.commissioning.certificate).length} / ${billing.rows.length}`],
                ['Warranty certificates', `${billing.rows.filter((r) => r.b.commissioning.warrantyCertificate).length} / ${billing.rows.length}`],
                ['Annex I DCR undertakings', `${billing.rows.length} (auto-filled)`],
                ['DCR certificate', dcrRef],
              ].map(([k, v]) => (
                <div className="kv" key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
          </FormSection>

          <FormSection title="Invoice">
            <div className="form-grid">
              <TextField label="Invoice no." required value={d.invoiceNo} disabled={submitted} onChange={(v) => setD({ ...d, invoiceNo: v })} />
              <DateField label="Invoice date" required value={d.invoiceDate} max={today()} disabled={submitted} onChange={(v) => setD({ ...d, invoiceDate: v })} />
              <TextField label="Taxable value (lot value, excl. GST)" value={fmtInr(amount)} disabled onChange={() => undefined} hint="Σ rate card value of every active site" />
              <label className="field">
                <span>GST rate (%) *</span>
                <input type="number" min={0} max={28} step="any" value={gstText} disabled={submitted} placeholder="Enter rate" onChange={(e) => setGstText(e.target.value)} />
                <small className="hint">No default is assumed — confirm the applicable rate with Accounts.</small>
              </label>
              <TextField label="Invoice total" value={isFinite(total) ? fmtInr(total) : '—'} disabled onChange={() => undefined} />
              <NumberField label="Copies" value={d.copies} disabled onChange={() => undefined} hint="Original + 2 copies, hard-bound (cl. 7.5)" />
              <TextArea label="Remarks" span2 value={d.remarks} disabled={submitted} onChange={(v) => setD({ ...d, remarks: v })} />
            </div>
          </FormSection>

          <FormSection title="Submission" aside={submitted ? <Chip tone="good">Submitted {fmtDate(existing?.submittedAt)}</Chip> : undefined}>
            <NoteBanner>Tender cl. 7.5 routes hard-bound sets to ED (RA&amp;PM), Raipur; current practice submits at district level first (open point). Edit the office as needed.</NoteBanner>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <TextField label="Inward no." required value={sub.inwardNo} disabled={submitted} onChange={(v) => setSub({ ...sub, inwardNo: v })} />
              <DateField label="Submission date" required value={sub.date} max={today()} disabled={submitted} onChange={(v) => setSub({ ...sub, date: v })} />
              <TextField label="Office" required span2 value={sub.office} disabled={submitted} onChange={(v) => setSub({ ...sub, office: v })} />
            </div>
            {!submitted && !getAll<PaymentFollowUp>('payments').some((p) => p.lotId === lotId) && (
              <>
                <p style={{ fontSize: 11, margin: '12px 0 6px' }}>
                  Expected receivable on commissioning: <b>{receivable ? fmtInr(receivable) : '—'}</b> ({100 - settings.cmcSharePercent}% of invoice total incl. GST; {settings.cmcSharePercent}% is paid as CMC). Split by source:
                </p>
                <div className="form-grid">
                  <NumberField label="CFA from MNRE (₹)" required min={0} value={sub.cfa} onChange={(v) => setSub({ ...sub, cfa: v })} />
                  <NumberField
                    label="SFA + district share from CSPDCL (₹)"
                    required
                    min={0}
                    value={sub.sfa}
                    onChange={(v) => setSub({ ...sub, sfa: v })}
                    hint={receivable ? `Split total ${fmtInr(sub.cfa + sub.sfa)} vs ${fmtInr(receivable)}` : undefined}
                  />
                </div>
              </>
            )}
            {!submitted && (
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="primary-btn" onClick={submit}>
                  <Send className="w-4 h-4" /> Record submission
                </button>
              </div>
            )}
          </FormSection>
        </>
      )}
      {view && <BeneficiaryDrawer id={view} onClose={() => setView(null)} />}
    </Modal>
  )
}
