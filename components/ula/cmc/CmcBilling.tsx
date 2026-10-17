'use client'

import React, { useMemo, useState } from 'react'
import { FileText, Send, BadgeCheck } from 'lucide-react'
import { EmptyBlock, Chip, GateBox, NoteBanner, reportSave, confirmAction, useUserName, Modal, DateField, TextArea, CheckField } from '../ui'
import { useBeneficiaries, useLots } from '@/lib/ula/data'
import { useCollection, upsert, patch, newId, logActivity } from '@/lib/ula/storage'
import { fmtDate, fmtInr, fmtInrShort, today, useSettings } from '@/lib/ula/workflow'
import type { CmcBill, CmcVisit, Lot } from '@/lib/ula/types'
import { CMC_QUARTERS, cmcBillBlockers, commissionedSites, lotCmcStart, lotCmcValue, quarterBillAmount, quarterDue } from './cmc-logic'

export function CmcBilling({ visits }: { visits: CmcVisit[] }) {
  const lots = useLots()
  const bens = useBeneficiaries()
  const bills = useCollection<CmcBill>('cmcBills')
  const settings = useSettings()
  const user = useUserName()
  const [lotId, setLotId] = useState('')
  const [raising, setRaising] = useState<CmcBill | null>(null)

  const cmcLots = useMemo(() => lots.filter((l) => commissionedSites(bens.filter((b) => b.lotId === l.id), settings).length), [lots, bens, settings])
  const lot = cmcLots.find((l) => l.id === lotId) || cmcLots[0]

  if (!cmcLots.length)
    return (
      <section className="card">
        <EmptyBlock icon={FileText} title="No lots in CMC" text="CMC bills are raised per lot, quarterly, once its sites are commissioned." />
      </section>
    )

  const sites = commissionedSites(bens.filter((b) => b.lotId === lot.id), settings)
  const start = lotCmcStart(lot.id, sites)
  const value = lotCmcValue(lot, bens, settings)
  const perQ = quarterBillAmount(value, settings)
  const lotBills = bills.filter((b) => b.lotId === lot.id)
  const billed = lotBills.reduce((a, b) => a + b.amount, 0)
  const paid = lotBills.filter((b) => b.status === 'Paid').reduce((a, b) => a + b.amount, 0)

  const raise = (b: CmcBill) => {
    const block = cmcBillBlockers(lot, b.quarter, bens, visits, settings)
    if (block.length) return
    if (!b.billDate) return
    const rec = { ...b, id: newId('CMCB'), amount: perQ, status: 'Draft' as const }
    if (reportSave(upsert('cmcBills', rec), `CMC bill Q${b.quarter} drafted for ${lot.lotNo}`)) {
      logActivity(user, 'Lot', lot.id, `CMC bill Q${b.quarter} drafted (${fmtInr(perQ)})`)
      setRaising(null)
    }
  }
  const advance = (b: CmcBill, to: CmcBill['status']) => {
    if (to === 'Submitted' && !b.aeVerified) return alert('The AE must verify the bill before submission.')
    if (!confirmAction(`Mark Q${b.quarter} bill as ${to}?`)) return
    if (reportSave(patch<CmcBill>('cmcBills', b.id, (x) => ({ ...x, status: to })), `Q${b.quarter} bill ${to.toLowerCase()}`)) logActivity(user, 'Lot', lot.id, `CMC bill Q${b.quarter} ${to}`)
  }
  const verify = (b: CmcBill, v: boolean) => {
    if (reportSave(patch<CmcBill>('cmcBills', b.id, (x) => ({ ...x, aeVerified: v })), v ? 'AE verification recorded' : 'AE verification removed')) logActivity(user, 'Lot', lot.id, `CMC bill Q${b.quarter} AE verification ${v ? 'recorded' : 'removed'}`)
  }

  return (
    <div className="stack">
      <section className="card section-card">
        <div className="section-title">
          <div>
            <h3>Lot CMC billing</h3>
            <p>
              {settings.cmcSharePercent}% of commissioned lot value paid in {CMC_QUARTERS} quarterly instalments. Bill raised only when every commissioned site has a visit for the quarter with PR ≥ {settings.minPrCommissioning}% and CUF ≥ {settings.minCufCmc}%.
            </p>
          </div>
          <select className="filter-select" value={lot.id} onChange={(e) => setLotId(e.target.value)} aria-label="Lot">
            {cmcLots.map((l: Lot) => (
              <option key={l.id} value={l.id}>
                {l.lotNo} · {l.district}
              </option>
            ))}
          </select>
        </div>
        <div className="kv-grid">
          {(
            [
              ['Commissioned sites', String(sites.length)],
              ['CMC start (last commissioning)', fmtDate(start)],
              ['Commissioned value', fmtInrShort(value)],
              ['Per-quarter bill', fmtInr(perQ)],
              ['Billed so far', fmtInrShort(billed)],
              ['Paid so far', fmtInrShort(paid)],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div className="kv" key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Quarter ends</th>
                <th>Eligibility</th>
                <th>Bill</th>
                <th>AE verified</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: CMC_QUARTERS }, (_, i) => i + 1).map((q) => {
                const bill = lotBills.find((b) => b.quarter === q)
                const blockers = bill ? [] : cmcBillBlockers(lot, q, bens, visits, settings)
                const ended = quarterDue(start, q) <= today()
                return (
                  <tr key={q}>
                    <td className="strong-cell">Q{q}</td>
                    <td>{fmtDate(quarterDue(start, q))}</td>
                    <td style={{ maxWidth: 320 }}>
                      {bill ? (
                        <Chip tone="good">Raised</Chip>
                      ) : !ended ? (
                        <Chip>Not ended</Chip>
                      ) : blockers.length ? (
                        <details>
                          <summary style={{ cursor: 'pointer' }}>
                            <Chip tone="bad">{blockers.length} blocker(s)</Chip>
                          </summary>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                            {blockers.slice(0, 15).map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                            {blockers.length > 15 && <li>…and {blockers.length - 15} more</li>}
                          </ul>
                        </details>
                      ) : (
                        <Chip tone="good">Eligible</Chip>
                      )}
                    </td>
                    <td>{bill ? `${fmtInr(bill.amount)} · ${fmtDate(bill.billDate)}` : '—'}</td>
                    <td>{bill ? <input type="checkbox" checked={bill.aeVerified} disabled={bill.status !== 'Draft'} onChange={(e) => verify(bill, e.target.checked)} aria-label="AE verified" /> : '—'}</td>
                    <td>{bill ? <Chip tone={bill.status === 'Paid' ? 'good' : bill.status === 'Submitted' ? 'info' : 'warn'}>{bill.status}</Chip> : '—'}</td>
                    <td className="text-right">
                      {!bill && ended && !blockers.length && (
                        <button type="button" className="primary-btn btn-sm" onClick={() => setRaising({ id: '', lotId: lot.id, quarter: q, amount: perQ, billDate: today(), aeVerified: false, status: 'Draft', remarks: '' })}>
                          <FileText className="w-3 h-3" /> Raise bill
                        </button>
                      )}
                      {bill?.status === 'Draft' && (
                        <button type="button" className="outline-btn btn-sm" onClick={() => advance(bill, 'Submitted')}>
                          <Send className="w-3 h-3" /> Submit
                        </button>
                      )}
                      {bill?.status === 'Submitted' && (
                        <button type="button" className="outline-btn btn-sm" onClick={() => advance(bill, 'Paid')}>
                          <BadgeCheck className="w-3 h-3" /> Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {raising && (
        <Modal
          size="narrow"
          eyebrow={lot.lotNo}
          title={`Raise CMC bill Q${raising.quarter}`}
          onClose={() => setRaising(null)}
          onSubmit={() => raise(raising)}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setRaising(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={!raising.billDate}>
                <FileText className="w-4 h-4" /> Draft bill
              </button>
            </>
          }
        >
          <GateBox missing={cmcBillBlockers(lot, raising.quarter, bens, visits, settings)} okText={`All ${sites.length} sites meet PR / CUF for Q${raising.quarter}`} />
          <NoteBanner>Amount: {fmtInr(perQ)} (excl. GST) = {settings.cmcSharePercent}% × {fmtInr(value)} ÷ {CMC_QUARTERS}</NoteBanner>
          <DateField label="Bill date" required value={raising.billDate} max={today()} onChange={(v) => setRaising({ ...raising, billDate: v })} />
          <CheckField label="AE verification received" checked={raising.aeVerified} onChange={(v) => setRaising({ ...raising, aeVerified: v })} />
          <TextArea label="Remarks" value={raising.remarks} onChange={(v) => setRaising({ ...raising, remarks: v })} />
        </Modal>
      )}
    </div>
  )
}
