'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Eye, Pencil, Trash2, Send, CheckCircle2, XCircle, Banknote, WalletCards, Download } from 'lucide-react'
import {
  PageHeader,
  MiniStat,
  Tabs,
  Modal,
  EmptyBlock,
  Chip,
  NoteBanner,
  FormSection,
  TextField,
  DateField,
  NumberField,
  SelectField,
  TextArea,
  usePaged,
  Pager,
  toast,
  reportSave,
  confirmAction,
  useUserName,
} from '../ui'
import { StatusPill } from '@/components/contracts/StatusPill'
import { useBeneficiaries, useIps, useIpMap, useLotMap } from '@/lib/ula/data'
import { useCollection, upsert, patch, remove, newId, nextNumber, logActivity, getAll } from '@/lib/ula/storage'
import { stageOf, fmtDate, fmtInr, fmtInrShort, today, nowIso, daysBetween, downloadCsv } from '@/lib/ula/workflow'
import type { IpBill, Beneficiary, InstallationPartner } from '@/lib/ula/types'

const TABS = ['Bills', 'Eligible sites'] as const
type Tab = (typeof TABS)[number]
const STATUSES: IpBill['status'][] = ['Draft', 'Submitted', 'Approved', 'Paid', 'Rejected']
const APPROVAL_LIMIT_DAYS = 7

const billNet = (b: IpBill) => b.gross - b.deductions.reduce((a, d) => a + d.amount, 0)

/** Sites already claimed in a live (non-rejected) bill. */
function billedSiteIds(bills: IpBill[], exceptId?: string) {
  return new Set(bills.filter((b) => b.status !== 'Rejected' && b.id !== exceptId).flatMap((b) => b.beneficiaryIds))
}

export function IpPaymentView() {
  const bills = useCollection<IpBill>('ipBills')
  const bens = useBeneficiaries()
  const ips = useIps()
  const ipMap = useIpMap()
  const lotMap = useLotMap()
  const user = useUserName()
  const [tab, setTab] = useState<Tab>('Bills')
  const [q, setQ] = useState('')
  const [ipF, setIpF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [edit, setEdit] = useState<IpBill | 'new' | null>(null)
  const [act, setAct] = useState<{ bill: IpBill; kind: 'reject' | 'pay' } | null>(null)

  const commissioned = useMemo(() => bens.filter((b) => stageOf(b) === 'Commissioned' && b.qc.status === 'Passed' && b.ipId), [bens])
  const billed = billedSiteIds(bills)
  const eligible = commissioned.filter((b) => !billed.has(b.id))

  const pendingApproval = bills.filter((b) => b.status === 'Submitted')
  const lateApproval = pendingApproval.filter((b) => b.submittedAt && daysBetween(b.submittedAt, today()) > APPROVAL_LIMIT_DAYS)
  const approvedUnpaid = bills.filter((b) => b.status === 'Approved')
  const paidTotal = bills.filter((b) => b.status === 'Paid').reduce((a, b) => a + billNet(b), 0)

  const filteredBills = bills.filter((b) => {
    const t = q.toLowerCase()
    return (!t || [b.billNo, ipMap.get(b.ipId)?.name, b.paymentRef].some((x) => x?.toLowerCase().includes(t))) && (!ipF || b.ipId === ipF) && (!statusF || b.status === statusF)
  })
  const filteredElig = eligible.filter((b) => {
    const t = q.toLowerCase()
    return (!t || [b.appNo, b.name].some((x) => x.toLowerCase().includes(t))) && (!ipF || b.ipId === ipF)
  })
  const pBills = usePaged(filteredBills, 20)
  const pElig = usePaged(filteredElig, 25)

  const setStatus = (bill: IpBill, fn: (b: IpBill) => IpBill, msg: string, action: string) => {
    if (reportSave(patch<IpBill>('ipBills', bill.id, fn), msg)) logActivity(user, 'IP Bill', bill.id, `${bill.billNo}: ${action}`)
  }

  const submit = (b: IpBill) => {
    if (!confirmAction(`Submit ${b.billNo} (${fmtInr(billNet(b))}) for approval?`)) return
    setStatus(b, (x) => ({ ...x, status: 'Submitted', submittedAt: nowIso() }), 'Bill submitted for approval', 'Submitted for approval')
  }
  const approve = (b: IpBill) => {
    // re-verify every site is still commissioned before approval
    const all = getAll<Beneficiary>('beneficiaries')
    const bad = b.beneficiaryIds.filter((id) => {
      const x = all.find((y) => y.id === id)
      return !x || stageOf(x) !== 'Commissioned' || x.qc.status !== 'Passed'
    })
    if (bad.length) return toast(`${bad.length} site(s) in this bill are no longer QC-passed and commissioned. Edit the bill first.`, 'error')
    if (!confirmAction(`Approve ${b.billNo} for ${fmtInr(billNet(b))}?`)) return
    setStatus(b, (x) => ({ ...x, status: 'Approved', approvedAt: nowIso(), approvedBy: user }), 'Bill approved', `Approved by ${user}`)
  }
  const del = (b: IpBill) => {
    if (!confirmAction(`Delete draft ${b.billNo}?`)) return
    if (reportSave(remove('ipBills', b.id), 'Draft deleted')) logActivity(user, 'IP Bill', b.id, `${b.billNo}: draft deleted`)
  }

  const exportCsv = () =>
    downloadCsv('ip-bills.csv', [
      ['Bill no.', 'IP', 'Bill date', 'Sites', 'Gross', 'Deductions', 'Net', 'Status', 'Submitted', 'Approved by', 'Paid', 'Payment ref'],
      ...filteredBills.map((b) => [b.billNo, ipMap.get(b.ipId)?.name, b.billDate, b.beneficiaryIds.length, b.gross, b.gross - billNet(b), billNet(b), b.status, b.submittedAt?.slice(0, 10), b.approvedBy, b.paidAt?.slice(0, 10), b.paymentRef]),
    ])

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Billing & Payment · Stage 14"
        title="IP Payment"
        description="Bills from installation partners against QC-passed and commissioned sites only, less deductions for rework, shortage or damage. Draft → Submitted → Approved → Paid."
        actions={
          <>
            <button type="button" className="outline-btn" onClick={exportCsv} disabled={!filteredBills.length}>
              <Download className="w-4 h-4" /> Export
            </button>
            <button type="button" className="primary-btn" onClick={() => setEdit('new')} disabled={!eligible.length} title={eligible.length ? '' : 'No unbilled commissioned sites'}>
              <Plus className="w-4 h-4" /> New IP bill
            </button>
          </>
        }
      />

      <div className="mini-stats">
        <MiniStat label="Eligible unbilled sites" value={eligible.length} onClick={() => setTab('Eligible sites')} active={tab === 'Eligible sites'} />
        <MiniStat label="Pending approval" value={pendingApproval.length} onClick={() => { setTab('Bills'); setStatusF('Submitted') }} active={tab === 'Bills' && statusF === 'Submitted'} />
        <MiniStat label={`Pending > ${APPROVAL_LIMIT_DAYS} days`} value={lateApproval.length} tone={lateApproval.length ? 'bad' : undefined} />
        <MiniStat label="Approved, not paid" value={approvedUnpaid.length} hint={fmtInrShort(approvedUnpaid.reduce((a, b) => a + billNet(b), 0))} />
        <MiniStat label="Paid to IPs" value={fmtInrShort(paidTotal)} tone="good" />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Bills: bills.length, 'Eligible sites': eligible.length }} />

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder={tab === 'Bills' ? 'Search bill no., IP, payment ref…' : 'Search application no., name…'} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="row">
            <select className="filter-select" value={ipF} onChange={(e) => setIpF(e.target.value)} aria-label="IP">
              <option value="">All IPs</option>
              {ips.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            {tab === 'Bills' && (
              <select className="filter-select" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status">
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {tab === 'Bills' &&
          (bills.length === 0 ? (
            <EmptyBlock icon={WalletCards} title="No IP bills yet" text="Create a bill once an IP's sites are QC-passed and commissioned." />
          ) : filteredBills.length === 0 ? (
            <EmptyBlock title="No bills match" />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>IP</th>
                      <th>Sites</th>
                      <th>Gross</th>
                      <th>Deductions</th>
                      <th>Net payable</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pBills.slice.map((b) => {
                      const ded = b.gross - billNet(b)
                      const late = b.status === 'Submitted' && b.submittedAt && daysBetween(b.submittedAt, today()) > APPROVAL_LIMIT_DAYS
                      return (
                        <tr key={b.id}>
                          <td>
                            <div className="cell-title">
                              <strong>{b.billNo}</strong>
                              <small>{fmtDate(b.billDate)}</small>
                            </div>
                          </td>
                          <td>{ipMap.get(b.ipId)?.name || 'Unknown IP'}</td>
                          <td>{b.beneficiaryIds.length}</td>
                          <td>{fmtInr(b.gross)}</td>
                          <td>{ded ? fmtInr(ded) : '—'}</td>
                          <td className="strong-cell">{fmtInr(billNet(b))}</td>
                          <td>
                            <StatusPill value={b.status === 'Paid' ? 'Completed' : b.status === 'Submitted' ? 'Submitted' : b.status === 'Draft' ? 'Pending' : b.status} />
                            <small> {b.status}</small>
                            {late && (
                              <>
                                <br />
                                <Chip tone="bad">Approval pending {daysBetween(b.submittedAt!, today())}d</Chip>
                              </>
                            )}
                            {b.status === 'Paid' && (
                              <>
                                <br />
                                <small className="muted">
                                  {b.paymentRef} · {fmtDate(b.paidAt)}
                                </small>
                              </>
                            )}
                            {b.status === 'Rejected' && b.remarks && (
                              <>
                                <br />
                                <small className="muted">{b.remarks}</small>
                              </>
                            )}
                          </td>
                          <td className="text-right">
                            <div className="row-actions">
                              <button type="button" className="action-icon-btn" title={b.status === 'Draft' ? 'Edit' : 'View'} onClick={() => setEdit(b)}>
                                {b.status === 'Draft' ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              {b.status === 'Draft' && (
                                <>
                                  <button type="button" className="action-icon-btn" title="Submit for approval" onClick={() => submit(b)}>
                                    <Send className="w-3.5 h-3.5" />
                                  </button>
                                  <button type="button" className="action-icon-btn danger" title="Delete draft" onClick={() => del(b)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {b.status === 'Submitted' && (
                                <>
                                  <button type="button" className="action-icon-btn" title="Approve" onClick={() => approve(b)}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button type="button" className="action-icon-btn danger" title="Reject" onClick={() => setAct({ bill: b, kind: 'reject' })}>
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {b.status === 'Approved' && (
                                <button type="button" className="primary-btn btn-sm" onClick={() => setAct({ bill: b, kind: 'pay' })}>
                                  <Banknote className="w-3 h-3" /> Mark paid
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...pBills} />
            </>
          ))}

        {tab === 'Eligible sites' &&
          (filteredElig.length === 0 ? (
            <EmptyBlock title="No unbilled commissioned sites" text="Sites become billable once QC-passed and commissioned with a signed certificate." />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Beneficiary</th>
                      <th>Lot</th>
                      <th>IP</th>
                      <th>kW</th>
                      <th>Commissioned</th>
                      <th>IP amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pElig.slice.map((b) => {
                      const ip = b.ipId ? ipMap.get(b.ipId) : undefined
                      return (
                        <tr key={b.id}>
                          <td>
                            <div className="cell-title">
                              <strong>{b.name}</strong>
                              <small>{b.appNo}</small>
                            </div>
                          </td>
                          <td>{lotMap.get(b.lotId)?.lotNo}</td>
                          <td>{ip?.name || 'Unknown IP'}</td>
                          <td>{b.sanctionedKw}</td>
                          <td>{fmtDate(b.commissioning.commissionedDate)}</td>
                          <td>{ip?.ratePerKw ? fmtInr(ip.ratePerKw * b.sanctionedKw) : <Chip tone="warn">IP rate not set</Chip>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...pElig} />
            </>
          ))}
      </section>

      {edit && <IpBillModal initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {act && <BillActionModal bill={act.bill} kind={act.kind} onClose={() => setAct(null)} onDone={setStatus} />}
    </div>
  )
}

function BillActionModal({
  bill,
  kind,
  onClose,
  onDone,
}: {
  bill: IpBill
  kind: 'reject' | 'pay'
  onClose: () => void
  onDone: (bill: IpBill, fn: (b: IpBill) => IpBill, msg: string, action: string) => void
}) {
  const [reason, setReason] = useState('')
  const [ref, setRef] = useState('')
  const [date, setDate] = useState(today())
  const submit = () => {
    if (kind === 'reject') {
      if (!reason.trim()) return toast('Reason is required', 'error')
      onDone(bill, (x) => ({ ...x, status: 'Rejected', remarks: `Rejected: ${reason.trim()}` }), 'Bill rejected', `Rejected — ${reason.trim()}`)
    } else {
      if (!ref.trim()) return toast('Payment reference (UTR / cheque) is required', 'error')
      if (!date || date > today()) return toast('Payment date must be today or earlier', 'error')
      onDone(bill, (x) => ({ ...x, status: 'Paid', paymentRef: ref.trim(), paidAt: new Date(`${date}T12:00:00`).toISOString() }), 'Payment recorded', `Paid ${fmtInr(billNet(bill))}, ref ${ref.trim()}`)
    }
    onClose()
  }
  return (
    <Modal
      size="narrow"
      title={kind === 'reject' ? `Reject ${bill.billNo}` : `Record payment — ${bill.billNo}`}
      subtitle={`Net payable ${fmtInr(billNet(bill))}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={kind === 'reject' ? 'danger-btn' : 'primary-btn'}>
            {kind === 'reject' ? 'Reject bill' : 'Mark paid'}
          </button>
        </>
      }
    >
      {kind === 'reject' ? (
        <TextArea label="Reason for rejection" required value={reason} onChange={setReason} hint="Rejected bills release their sites so a corrected bill can be raised." />
      ) : (
        <div className="form-grid">
          <TextField label="Payment reference (UTR / cheque)" required value={ref} onChange={setRef} />
          <DateField label="Payment date" required value={date} max={today()} onChange={setDate} />
        </div>
      )}
    </Modal>
  )
}

type Deduction = IpBill['deductions'][number]

function IpBillModal({ initial, onClose }: { initial?: IpBill; onClose: () => void }) {
  const bills = useCollection<IpBill>('ipBills')
  const bens = useBeneficiaries()
  const ips = useIps()
  const lotMap = useLotMap()
  const user = useUserName()
  const readOnly = !!initial && initial.status !== 'Draft'
  const [b, setB] = useState<IpBill>(
    initial || {
      id: '',
      billNo: '',
      ipId: '',
      beneficiaryIds: [],
      billDate: today(),
      gross: 0,
      deductions: [],
      status: 'Draft',
      paymentRef: '',
      remarks: '',
    }
  )
  const ip: InstallationPartner | undefined = ips.find((i) => i.id === b.ipId)
  const taken = billedSiteIds(bills, b.id)
  const candidates = bens.filter((x) => x.ipId === b.ipId && ((stageOf(x) === 'Commissioned' && x.qc.status === 'Passed' && !taken.has(x.id)) || b.beneficiaryIds.includes(x.id)))
  const selected = bens.filter((x) => b.beneficiaryIds.includes(x.id))
  const gross = readOnly ? b.gross : Math.round(selected.reduce((a, x) => a + x.sanctionedKw, 0) * (ip?.ratePerKw || 0))
  const dedTotal = b.deductions.reduce((a, d) => a + (d.amount || 0), 0)

  // Suggestions from field evidence: shortage/damage at receipt and QC rejections. Amounts are entered by the user.
  const suggestions = selected.flatMap((x) => {
    const out: { reason: Deduction['reason']; note: string }[] = []
    if (x.received?.shortage?.trim()) out.push({ reason: 'Shortage', note: `${x.appNo}: ${x.received.shortage.trim()}` })
    if (x.received?.damage?.trim()) out.push({ reason: 'Damage', note: `${x.appNo}: ${x.received.damage.trim()}` })
    const rej = x.qc.history.filter((h) => h.result === 'Rejected')
    if (rej.length) out.push({ reason: 'Rework', note: `${x.appNo}: ${rej.length} QC rejection(s) — ${rej.map((h) => h.remarks).join('; ')}` })
    return out
  }).filter((s) => !b.deductions.some((d) => d.note === s.note))

  const toggle = (id: string, on: boolean) => setB({ ...b, beneficiaryIds: on ? [...b.beneficiaryIds, id] : b.beneficiaryIds.filter((x) => x !== id) })

  const save = () => {
    if (readOnly) return onClose()
    if (!b.ipId) return toast('Select the installation partner', 'error')
    if (!ip?.ratePerKw) return toast(`${ip?.name || 'This IP'} has no rate per kW. Set it in Settings › Installation Partners.`, 'error')
    if (!b.beneficiaryIds.length) return toast('Select at least one site', 'error')
    if (!b.billDate || b.billDate > today()) return toast('Bill date must be today or earlier', 'error')
    if (b.deductions.some((d) => !(d.amount > 0) || !d.note.trim())) return toast('Each deduction needs an amount > 0 and a note', 'error')
    if (dedTotal > gross) return toast('Deductions exceed the gross bill amount', 'error')
    const billNo = b.billNo.trim() || nextNumber(getAll<IpBill>('ipBills').map((x) => x.billNo), 'IPB')
    if (bills.some((x) => x.id !== b.id && x.billNo.toLowerCase() === billNo.toLowerCase())) return toast('Bill number already used', 'error')
    const saved: IpBill = { ...b, id: b.id || newId('IPB'), billNo, gross }
    if (reportSave(upsert('ipBills', saved), `${billNo} saved as draft`)) {
      logActivity(user, 'IP Bill', saved.id, `${billNo}: draft ${b.id ? 'updated' : 'created'} — ${saved.beneficiaryIds.length} sites, net ${fmtInr(gross - dedTotal)}`)
      onClose()
    }
  }

  return (
    <Modal
      size="wide"
      eyebrow="IP bill"
      title={initial ? `${initial.billNo} — ${initial.status}` : 'New IP bill'}
      subtitle="Only QC-passed and commissioned sites of the selected IP that are not in another live bill can be included."
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="muted" style={{ fontSize: 11, marginRight: 'auto' }}>
            Gross {fmtInr(gross)} − deductions {fmtInr(dedTotal)} = <b>{fmtInr(gross - dedTotal)}</b>
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button type="submit" className="primary-btn">
              Save draft
            </button>
          )}
        </>
      }
    >
      <FormSection title="Bill">
        <div className="form-grid">
          <SelectField
            label="Installation partner"
            required
            disabled={readOnly || !!b.beneficiaryIds.length}
            value={b.ipId}
            onChange={(v) => setB({ ...b, ipId: v, beneficiaryIds: [] })}
            options={ips.map((i) => ({ value: i.id, label: `${i.name}${i.ratePerKw ? ` · ${fmtInr(i.ratePerKw)}/kW` : ' · rate not set'}` }))}
            hint={b.beneficiaryIds.length && !readOnly ? 'Clear selected sites to change IP' : undefined}
          />
          <TextField label="Bill no." value={b.billNo} disabled={readOnly} placeholder="Auto (IPB-0001)" onChange={(v) => setB({ ...b, billNo: v })} />
          <DateField label="Bill date" required value={b.billDate} max={today()} disabled={readOnly} onChange={(v) => setB({ ...b, billDate: v })} />
          <TextField label="IP rate per kW" value={ip?.ratePerKw ? fmtInr(ip.ratePerKw) : 'Not set'} disabled onChange={() => undefined} />
        </div>
        {ip && !ip.ratePerKw && (
          <div style={{ marginTop: 10 }}>
            <NoteBanner>
              {ip.name} has no rate per kW. Set it in <Link href="/settings" className="underline">Settings › Installation Partners</Link> (open point: IP rate card and payment terms).
            </NoteBanner>
          </div>
        )}
      </FormSection>

      {b.ipId && (
        <FormSection title={`Sites (${b.beneficiaryIds.length} selected)`} aside={!readOnly && candidates.length > 0 && <button type="button" className="outline-btn btn-sm" onClick={() => setB({ ...b, beneficiaryIds: candidates.map((c) => c.id) })}>Select all</button>}>
          {candidates.length === 0 ? (
            <span className="muted" style={{ fontSize: 11 }}>No eligible sites for this IP.</span>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Beneficiary</th>
                    <th>Lot</th>
                    <th>kW</th>
                    <th>Commissioned</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(readOnly ? selected : candidates).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <input type="checkbox" disabled={readOnly} checked={b.beneficiaryIds.includes(x.id)} onChange={(e) => toggle(x.id, e.target.checked)} aria-label={`Include ${x.name}`} />
                      </td>
                      <td>
                        <div className="cell-title">
                          <strong>{x.name}</strong>
                          <small>{x.appNo}</small>
                        </div>
                      </td>
                      <td>{lotMap.get(x.lotId)?.lotNo}</td>
                      <td>{x.sanctionedKw}</td>
                      <td>{fmtDate(x.commissioning.commissionedDate)}</td>
                      <td>{fmtInr(x.sanctionedKw * (ip?.ratePerKw || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormSection>
      )}

      <FormSection title="Deductions" aside={!readOnly && <button type="button" className="outline-btn btn-sm" onClick={() => setB({ ...b, deductions: [...b.deductions, { id: newId('DED'), reason: 'Other', amount: 0, note: '' }] })}><Plus className="w-3 h-3" /> Add</button>}>
        {!readOnly && suggestions.length > 0 && (
          <div className="gate-box" style={{ marginBottom: 10 }}>
            <strong>Field evidence that may justify deductions (enter amounts yourself):</strong>
            <ul>
              {suggestions.map((s) => (
                <li key={s.note}>
                  {s.reason}: {s.note}{' '}
                  <button type="button" className="outline-btn btn-sm" onClick={() => setB({ ...b, deductions: [...b.deductions, { id: newId('DED'), reason: s.reason, amount: 0, note: s.note }] })}>
                    Add line
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {b.deductions.length === 0 && <span className="muted" style={{ fontSize: 11 }}>No deductions.</span>}
        <div className="stack" style={{ gap: 8 }}>
          {b.deductions.map((d) => (
            <div key={d.id} className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 2fr auto', alignItems: 'end' }}>
              <SelectField label="Reason" disabled={readOnly} value={d.reason} options={['Rework', 'Shortage', 'Damage', 'Other']} onChange={(v) => setB({ ...b, deductions: b.deductions.map((x) => (x.id === d.id ? { ...x, reason: (v || 'Other') as Deduction['reason'] } : x)) })} />
              <NumberField label="Amount (₹)" disabled={readOnly} min={0} value={d.amount} onChange={(v) => setB({ ...b, deductions: b.deductions.map((x) => (x.id === d.id ? { ...x, amount: v } : x)) })} />
              <TextField label="Note" disabled={readOnly} value={d.note} onChange={(v) => setB({ ...b, deductions: b.deductions.map((x) => (x.id === d.id ? { ...x, note: v } : x)) })} />
              {!readOnly && (
                <button type="button" className="action-icon-btn danger" title="Remove" onClick={() => setB({ ...b, deductions: b.deductions.filter((x) => x.id !== d.id) })}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </FormSection>
      <TextArea label="Remarks" disabled={readOnly} value={b.remarks} onChange={(v) => setB({ ...b, remarks: v })} />
      {readOnly && (
        <div className="kv-grid">
          <div className="kv">
            <span>Submitted</span>
            <strong>{fmtDate(b.submittedAt)}</strong>
          </div>
          <div className="kv">
            <span>Approved</span>
            <strong>{b.approvedBy ? `${b.approvedBy} · ${fmtDate(b.approvedAt)}` : '—'}</strong>
          </div>
          <div className="kv">
            <span>Paid</span>
            <strong>{b.paidAt ? `${fmtDate(b.paidAt)} · ${b.paymentRef}` : '—'}</strong>
          </div>
        </div>
      )}
    </Modal>
  )
}
