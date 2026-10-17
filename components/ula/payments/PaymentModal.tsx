'use client'

import React, { useState } from 'react'
import { Plus, Trash2, Save, Lock, Unlock, Reply } from 'lucide-react'
import { Modal, FormSection, TextField, DateField, NumberField, SelectField, TextArea, Chip, NoteBanner, toast, reportSave, confirmAction, useUserName } from '../ui'
import { useLots } from '@/lib/ula/data'
import { useCollection, patch, newId, logActivity } from '@/lib/ula/storage'
import { useSettings, fmtInr, fmtDate, fmtDateTime, nowIso, today } from '@/lib/ula/workflow'
import type { PaymentFollowUp, PaymentSource, Docket } from '@/lib/ula/types'
import { paymentStats, SOURCES, DESKS } from './payment-logic'

type Receipt = PaymentFollowUp['receipts'][number]

export function PaymentModal({ id, onClose }: { id: string; onClose: () => void }) {
  const payments = useCollection<PaymentFollowUp>('payments')
  const dockets = useCollection<Docket>('dockets')
  const lots = useLots()
  const settings = useSettings()
  const user = useUserName()
  const p = payments.find((x) => x.id === id)
  const [expected, setExpected] = useState(p?.expected || [])
  const [mv, setMv] = useState({ desk: '', date: today(), remarks: '' })
  const [qText, setQText] = useState('')
  const [replies, setReplies] = useState<Record<string, string>>({})
  const blankReceipt = { date: today(), source: '' as PaymentSource | '', gross: 0, tds: 0, ld: 0, otherDeduction: 0, utr: '' }
  const [rc, setRc] = useState(blankReceipt)
  const [wo, setWo] = useState({ amount: 0, approvedBy: '', reason: '' })

  if (!p) return null
  const lot = lots.find((l) => l.id === p.lotId)
  const docket = dockets.find((d) => d.lotId === p.lotId)
  const s = paymentStats(p, docket, settings.sla.paymentIdleDays)
  const locked = p.closed

  const write = (fn: (x: PaymentFollowUp) => PaymentFollowUp, msg: string, action: string) => {
    if (reportSave(patch<PaymentFollowUp>('payments', p.id, fn), msg)) {
      logActivity(user, 'Payment', p.id, `${lot?.lotNo || ''}: ${action}`)
      return true
    }
    return false
  }

  const saveExpected = () => {
    if (expected.some((e) => !(e.amount >= 0))) return toast('Amounts must be zero or more', 'error')
    write((x) => ({ ...x, expected }), 'Expected amounts updated', `Expected amounts set to ${expected.map((e) => `${e.source} ${fmtInr(e.amount)}`).join(', ')}`)
  }

  const addMovement = () => {
    if (!mv.desk) return toast('Select the desk', 'error')
    if (!mv.date || mv.date > today()) return toast('Date must be today or earlier', 'error')
    if (write((x) => ({ ...x, movements: [...x.movements, { id: newId('MOV'), desk: mv.desk, date: mv.date, remarks: mv.remarks.trim() }] }), 'File movement logged', `File moved to ${mv.desk} on ${mv.date}`))
      setMv({ desk: '', date: today(), remarks: '' })
  }

  const addQuery = () => {
    if (!qText.trim()) return toast('Enter the query text', 'error')
    if (write((x) => ({ ...x, queries: [...x.queries, { id: newId('QRY'), raisedAt: nowIso(), query: qText.trim(), reply: '' }] }), 'Query logged', 'Query raised by CSPDCL / MNRE')) setQText('')
  }

  const replyQuery = (qid: string) => {
    const r = (replies[qid] || '').trim()
    if (!r) return toast('Enter the reply', 'error')
    if (write((x) => ({ ...x, queries: x.queries.map((q) => (q.id === qid ? { ...q, reply: r, repliedAt: nowIso() } : q)) }), 'Reply recorded', 'Query replied'))
      setReplies({ ...replies, [qid]: '' })
  }

  const net = rc.gross - rc.tds - rc.ld - rc.otherDeduction
  const addReceipt = () => {
    if (!rc.source) return toast('Select the paying source', 'error')
    if (!rc.date || rc.date > today()) return toast('Receipt date must be today or earlier', 'error')
    if (!(rc.gross > 0)) return toast('Gross amount must be greater than 0', 'error')
    if ([rc.tds, rc.ld, rc.otherDeduction].some((v) => v < 0)) return toast('Deductions cannot be negative', 'error')
    if (net < 0) return toast('Deductions exceed the gross amount', 'error')
    if (!rc.utr.trim()) return toast('UTR / bank reference is required for reconciliation', 'error')
    if (p.receipts.some((r) => r.utr.trim().toLowerCase() === rc.utr.trim().toLowerCase())) return toast('A receipt with this UTR already exists', 'error')
    const srcOut = s.bySource[rc.source].outstanding
    if (rc.gross > srcOut + 1 && !confirmAction(`Gross ${fmtInr(rc.gross)} exceeds the outstanding ${fmtInr(srcOut)} from ${rc.source}. Record anyway?`)) return
    const r: Receipt = { id: newId('RCT'), date: rc.date, source: rc.source, gross: rc.gross, tds: rc.tds, ld: rc.ld, otherDeduction: rc.otherDeduction, net, utr: rc.utr.trim() }
    if (write((x) => ({ ...x, receipts: [...x.receipts, r] }), 'Receipt recorded', `Receipt ${fmtInr(r.gross)} from ${r.source} (net ${fmtInr(r.net)}, UTR ${r.utr})`)) setRc(blankReceipt)
  }

  const deleteReceipt = (r: Receipt) => {
    if (!confirmAction(`Delete receipt ${r.utr} of ${fmtInr(r.gross)}?`)) return
    write((x) => ({ ...x, receipts: x.receipts.filter((y) => y.id !== r.id) }), 'Receipt deleted', `Receipt ${r.utr} deleted`)
  }

  const writeOff = () => {
    if (!(wo.amount > 0) || wo.amount > s.outstanding + 1) return toast(`Write-off must be between 1 and the outstanding ${fmtInr(s.outstanding)}`, 'error')
    if (!wo.approvedBy.trim() || !wo.reason.trim()) return toast('Approver (Director) and reason are required', 'error')
    if (!confirmAction(`Write off ${fmtInr(wo.amount)} for ${lot?.lotNo}, approved by ${wo.approvedBy}?`)) return
    write((x) => ({ ...x, writeOff: { amount: wo.amount, approvedBy: wo.approvedBy.trim(), reason: wo.reason.trim(), date: today() } }), 'Write-off recorded', `Write-off ${fmtInr(wo.amount)} approved by ${wo.approvedBy}`)
  }

  const close = () => {
    if (s.outstanding > 1) return toast(`Cannot close: ${fmtInr(s.outstanding)} still outstanding. Record receipts or an approved write-off.`, 'error')
    if (!confirmAction(`Close the payment file for ${lot?.lotNo}?`)) return
    write((x) => ({ ...x, closed: true, movements: [...x.movements, { id: newId('MOV'), desk: 'Paid', date: today(), remarks: 'File closed — receivable settled' }] }), 'Payment file closed', 'Payment file closed')
  }

  const reopen = () => confirmAction('Reopen this payment file?') && write((x) => ({ ...x, closed: false }), 'File reopened', 'Payment file reopened')

  return (
    <Modal
      size="wide"
      eyebrow={`Payment file · ${lot?.lotNo || 'Deleted lot'}`}
      title={`Invoice ${docket?.invoiceNo || '—'} · ${fmtInr(s.expected)} expected`}
      subtitle={`Docket submitted ${fmtDate(docket?.submittedAt)} to ${docket?.office || '—'} · inward ${docket?.inwardNo || '—'}`}
      onClose={onClose}
      footer={
        <>
          <span className="muted" style={{ fontSize: 11, marginRight: 'auto' }}>
            Outstanding <b>{fmtInr(s.outstanding)}</b> · net received {fmtInr(s.net)} · deductions {fmtInr(s.deductions)}
            {s.writeOff ? ` · written off ${fmtInr(s.writeOff)}` : ''}
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
          {locked ? (
            <button type="button" className="outline-btn" onClick={reopen}>
              <Unlock className="w-4 h-4" /> Reopen
            </button>
          ) : (
            <button type="button" className="primary-btn" onClick={close} disabled={s.outstanding > 1}>
              <Lock className="w-4 h-4" /> Close file
            </button>
          )}
        </>
      }
    >
      {locked && <NoteBanner>This payment file is closed. Reopen it to make changes.</NoteBanner>}

      <FormSection title="Expected receivable by source" aside={!locked && <button type="button" className="outline-btn btn-sm" onClick={saveExpected}><Save className="w-3 h-3" /> Save</button>}>
        <div className="form-grid">
          {SOURCES.map((src) => {
            const e = expected.find((x) => x.source === src)
            const b = s.bySource[src]
            return (
              <NumberField
                key={src}
                label={src}
                min={0}
                disabled={locked}
                value={e?.amount || 0}
                hint={`Received ${fmtInr(b.gross)} · outstanding ${fmtInr(b.outstanding)}`}
                onChange={(v) => setExpected(e ? expected.map((x) => (x.source === src ? { ...x, amount: v } : x)) : [...expected, { source: src, amount: v }])}
              />
            )
          })}
        </div>
      </FormSection>

      <FormSection title={`File movement (${p.movements.length})`}>
        <div className="timeline">
          {[...p.movements]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((m) => (
              <div className="timeline-item" key={m.id}>
                <time>{fmtDate(m.date)}</time>
                <span>
                  <b>{m.desk}</b> {m.remarks && <span className="muted">— {m.remarks}</span>}
                </span>
              </div>
            ))}
        </div>
        {!locked && (
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 2fr auto', alignItems: 'end', marginTop: 8 }}>
            <SelectField label="Desk" value={mv.desk} onChange={(v) => setMv({ ...mv, desk: v })} options={[...DESKS]} />
            <DateField label="Date" value={mv.date} max={today()} onChange={(v) => setMv({ ...mv, date: v })} />
            <TextField label="Remarks" value={mv.remarks} onChange={(v) => setMv({ ...mv, remarks: v })} />
            <button type="button" className="outline-btn" onClick={addMovement}>
              <Plus className="w-3.5 h-3.5" /> Log
            </button>
          </div>
        )}
      </FormSection>

      <FormSection title={`Queries (${p.queries.length}, ${s.openQueries} open)`}>
        {p.queries.length === 0 && <span className="muted" style={{ fontSize: 11 }}>No queries raised.</span>}
        <div className="stack" style={{ gap: 8 }}>
          {p.queries.map((q) => (
            <div key={q.id} className="kv">
              <span>Raised {fmtDateTime(q.raisedAt)}</span>
              <strong>{q.query}</strong>
              {q.reply ? (
                <p style={{ fontSize: 11, margin: '6px 0 0', color: '#17715f' }}>
                  <Reply className="w-3 h-3 inline" /> {q.reply} <small className="muted">({fmtDateTime(q.repliedAt)})</small>
                </p>
              ) : locked ? (
                <Chip tone="warn">Unanswered</Chip>
              ) : (
                <div className="row" style={{ marginTop: 6 }}>
                  <input className="text-input" style={{ flex: 1 }} placeholder="Reply sent" value={replies[q.id] || ''} onChange={(e) => setReplies({ ...replies, [q.id]: e.target.value })} />
                  <button type="button" className="outline-btn btn-sm" onClick={() => replyQuery(q.id)}>
                    Record reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {!locked && (
          <div className="row" style={{ marginTop: 8 }}>
            <input className="text-input" style={{ flex: 1 }} placeholder="New query from CSPDCL / MNRE" value={qText} onChange={(e) => setQText(e.target.value)} />
            <button type="button" className="outline-btn" onClick={addQuery}>
              <Plus className="w-3.5 h-3.5" /> Add query
            </button>
          </div>
        )}
      </FormSection>

      <FormSection title={`Receipts (${p.receipts.length})`}>
        {p.receipts.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Gross</th>
                  <th>TDS</th>
                  <th>LD</th>
                  <th>Other</th>
                  <th>Net</th>
                  <th>UTR</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.source}</td>
                    <td>{fmtInr(r.gross)}</td>
                    <td>{fmtInr(r.tds)}</td>
                    <td>{fmtInr(r.ld)}</td>
                    <td>{fmtInr(r.otherDeduction)}</td>
                    <td className="strong-cell">{fmtInr(r.net)}</td>
                    <td>{r.utr}</td>
                    <td>
                      {!locked && (
                        <button type="button" className="action-icon-btn danger" title="Delete" onClick={() => deleteReceipt(r)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!locked && (
          <>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <DateField label="Receipt date" required value={rc.date} max={today()} onChange={(v) => setRc({ ...rc, date: v })} />
              <SelectField label="Source" required value={rc.source} onChange={(v) => setRc({ ...rc, source: v as PaymentSource })} options={SOURCES} />
              <NumberField label="Gross amount (₹)" required min={0} value={rc.gross} onChange={(v) => setRc({ ...rc, gross: v })} />
              <NumberField label="TDS (₹)" min={0} value={rc.tds} onChange={(v) => setRc({ ...rc, tds: v })} />
              <NumberField label="LD deducted (₹)" min={0} value={rc.ld} onChange={(v) => setRc({ ...rc, ld: v })} />
              <NumberField label="Other deduction (₹)" min={0} value={rc.otherDeduction} onChange={(v) => setRc({ ...rc, otherDeduction: v })} />
              <TextField label="UTR / bank reference" required value={rc.utr} onChange={(v) => setRc({ ...rc, utr: v })} />
              <TextField label="Net credited (auto)" value={fmtInr(net)} disabled onChange={() => undefined} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="outline-btn" onClick={addReceipt}>
                <Plus className="w-3.5 h-3.5" /> Record receipt
              </button>
            </div>
          </>
        )}
      </FormSection>

      <FormSection title="Write-off (Director approval)">
        {p.writeOff ? (
          <p style={{ fontSize: 12 }}>
            {fmtInr(p.writeOff.amount)} written off on {fmtDate(p.writeOff.date)}, approved by <b>{p.writeOff.approvedBy}</b> — {p.writeOff.reason}
            {!locked && (
              <button
                type="button"
                className="outline-btn btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => confirmAction('Remove this write-off?') && write((x) => ({ ...x, writeOff: undefined }), 'Write-off removed', 'Write-off removed')}
              >
                Remove
              </button>
            )}
          </p>
        ) : locked ? (
          <span className="muted" style={{ fontSize: 11 }}>None.</span>
        ) : (
          <div className="form-grid">
            <NumberField label="Amount (₹)" min={0} value={wo.amount} onChange={(v) => setWo({ ...wo, amount: v })} hint={`Outstanding ${fmtInr(s.outstanding)}`} />
            <TextField label="Approved by (Director)" value={wo.approvedBy} onChange={(v) => setWo({ ...wo, approvedBy: v })} />
            <TextArea label="Reason" span2 value={wo.reason} onChange={(v) => setWo({ ...wo, reason: v })} />
            <div>
              <button type="button" className="danger-btn" onClick={writeOff} disabled={s.outstanding <= 0}>
                Record write-off
              </button>
            </div>
          </div>
        )}
      </FormSection>
    </Modal>
  )
}
