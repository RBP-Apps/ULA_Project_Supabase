'use client'

import type { Beneficiary, Lot, PurchaseOrder, Dispatch, Settings, Docket } from '@/lib/ula/types'
import type { Contract } from '@/lib/types'
import { completeness, completenessPct, summarizeLot, stageOf, siteValue, addDays, daysBetween, today, type ChecklistItem, type LotSummary } from '@/lib/ula/workflow'

export interface BillingRow {
  b: Beneficiary
  items: ChecklistItem[]
  pct: number
  missing: string[]
  value: number
}

export interface LotBilling {
  summary: LotSummary
  rows: BillingRow[] // active (non-dropped) beneficiaries
  avgPct: number
  incomplete: BillingRow[]
  gateOpen: boolean
  lastCommissioned: string
  docketDue: string // last commissioning + docketDays
  docketLate: boolean
}

export function lotBilling(
  lot: Lot,
  bens: Beneficiary[],
  pos: PurchaseOrder[],
  dispatches: Dispatch[],
  settings: Settings,
  docket?: Docket
): LotBilling {
  const summary = summarizeLot(lot, bens, settings)
  const lotPos = pos.filter((p) => p.lotId === lot.id && p.status === 'Received')
  const rows: BillingRow[] = bens
    .filter((b) => b.lotId === lot.id && stageOf(b) !== 'Dropped')
    .map((b) => {
      const items = completeness(b, { lotPos, dispatch: dispatches.find((d) => d.id === b.dispatchId) }, settings)
      return { b, items, pct: completenessPct(items), missing: items.filter((i) => !i.done).map((i) => i.label), value: siteValue(b.sanctionedKw, settings) }
    })
  const incomplete = rows.filter((r) => r.pct < 100)
  const avgPct = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0
  const lastCommissioned = summary.allCommissioned
    ? rows.map((r) => r.b.commissioning.commissionedDate).sort().slice(-1)[0] || ''
    : ''
  const docketDue = lastCommissioned ? addDays(lastCommissioned, settings.sla.docketDays) : ''
  const docketLate = !!docketDue && docket?.status !== 'Submitted' && daysBetween(docketDue, today()) > 0
  return { summary, rows, avgPct, incomplete, gateOpen: summary.allCommissioned && incomplete.length === 0, lastCommissioned, docketDue, docketLate }
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const inr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-IN')}`

/** Self-contained print document for the hard-bound docket (original + 2 copies). */
export function docketHtml(lot: Lot, contract: Contract | undefined, docket: Docket, billing: LotBilling, dcrRef: string): string {
  const gst = (docket.invoiceAmount * docket.gstPercent) / 100
  const total = docket.invoiceAmount + gst
  const rows = billing.rows
  const doc = (label: string, ok: boolean) => `<td>${ok ? 'Enclosed' : '<b style="color:#b00">MISSING</b>'}</td>`
  const index = [
    ['1', 'Tax invoice', `${docket.invoiceNo} dated ${docket.invoiceDate}`],
    ['2', 'Schedule of rates (SOR) / site-wise schedule', `${rows.length} sites`],
    ['3', 'Joint Inspection Reports (JIR) signed by consumer, AE and RBP', `${rows.length} nos.`],
    ['4', 'Installation reports signed by consumer', `${rows.length} nos.`],
    ['5', 'Portal completion / commissioning reports', `${rows.length} nos.`],
    ['6', 'Warranty certificates', `${rows.length} nos.`],
    ['7', 'DCR undertakings (Annex I)', `${rows.length} nos.`],
  ]
  const undertakings = rows
    .map(
      (r, i) => `
  <section class="page">
    <h3>Annex I — DCR Undertaking (${i + 1} of ${rows.length})</h3>
    <p>We, RBP Energy (India) Pvt. Ltd., hereby undertake that the solar PV modules supplied and installed for the rooftop solar system of
    <b>${esc(r.b.name)}</b> (PM Surya Ghar application no. <b>${esc(r.b.appNo)}</b>, consumer no. <b>${esc(r.b.consumerNo)}</b>,
    ${esc(r.b.sanctionedKw)} kW, ${esc(r.b.address)}) under CSPDCL lot <b>${esc(lot.lotNo)}</b> are domestically manufactured (DCR) modules
    listed in ALMM List-I and made with cells from ALMM List-II.</p>
    <table>
      <tr><th>Module make</th><td>${esc(r.b.moduleMake)}</td><th>ALMM model</th><td>${esc(r.b.almmModel)}</td></tr>
      <tr><th>Wattage (Wp)</th><td>${esc(r.b.moduleWp)}</td><th>No. of modules</th><td>${r.b.moduleSerials.length}</td></tr>
      <tr><th>Module serial nos.</th><td colspan="3">${esc(r.b.moduleSerials.join(', '))}</td></tr>
      <tr><th>Inverter</th><td>${esc(r.b.inverterMake)}</td><th>Inverter serial</th><td>${esc(r.b.inverterSerial)}</td></tr>
      <tr><th>DCR certificate ref.</th><td colspan="3">${esc(dcrRef)}</td></tr>
    </table>
    <p class="small">Format generated from system records. Replace with the exact Annex I wording of the RfS if it differs.</p>
    <p style="margin-top:40px">Authorised signatory ____________________ &nbsp;&nbsp; Date ____________ &nbsp;&nbsp; Seal</p>
  </section>`
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Docket ${esc(lot.lotNo)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}h3{font-size:13px}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eee}.small{font-size:10px;color:#555}.page{page-break-before:always}
.right{text-align:right}
@media print{body{margin:10mm}}
</style></head><body>
<h1>Lot docket — ${esc(lot.lotNo)}</h1>
<div>${esc(contract?.contractName || '')} · Package ${esc(contract?.packageCode || '')} · Entity ${esc(contract?.entity || '')}</div>
<div>Allotment letter ${esc(lot.allotmentLetterNo)} dated ${esc(lot.allotmentDate)} · District ${esc(lot.district)} · Circle ${esc(lot.circle)} · Division ${esc(lot.division)}</div>
<div>Submitted to: ${esc(docket.office)} · Copies: original + ${Math.max(0, docket.copies - 1)}</div>
<h2>Index</h2>
<table><tr><th>#</th><th>Document</th><th>Details</th></tr>${index.map((r) => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table>
<h2>Invoice summary</h2>
<table>
<tr><th>Invoice no.</th><td>${esc(docket.invoiceNo)}</td><th>Date</th><td>${esc(docket.invoiceDate)}</td></tr>
<tr><th>Taxable value</th><td class="right">${inr(docket.invoiceAmount)}</td><th>GST @ ${esc(docket.gstPercent)}%</th><td class="right">${inr(gst)}</td></tr>
<tr><th colspan="3">Invoice total</th><td class="right"><b>${inr(total)}</b></td></tr>
</table>
<h2>Site-wise schedule</h2>
<table><tr><th>#</th><th>Application no.</th><th>Beneficiary</th><th>Consumer no.</th><th>kW</th><th>Commissioned</th><th>PR %</th><th class="right">Value</th><th>JIR</th><th>Inst. report</th><th>Certificate</th><th>Warranty</th></tr>
${rows
  .map(
    (r, i) => `<tr><td>${i + 1}</td><td>${esc(r.b.appNo)}</td><td>${esc(r.b.name)}</td><td>${esc(r.b.consumerNo)}</td><td>${esc(r.b.sanctionedKw)}</td><td>${esc(r.b.commissioning.commissionedDate)}</td><td>${esc(r.b.commissioning.prAtCommissioning)}</td><td class="right">${inr(r.value)}</td>${doc('jir', !!r.b.commissioning.jir)}${doc('ir', !!r.b.installation.installReport)}${doc('cc', !!r.b.commissioning.certificate)}${doc('wc', !!r.b.commissioning.warrantyCertificate)}</tr>`
  )
  .join('')}
<tr><th colspan="7">Total (${rows.length} sites, ${rows.reduce((a, r) => a + r.b.sanctionedKw, 0)} kW)</th><th class="right">${inr(rows.reduce((a, r) => a + r.value, 0))}</th><th colspan="4"></th></tr>
</table>
<p class="small">Scanned JIRs, installation reports, certificates and warranty cards are stored in the system against each beneficiary and must be printed and bound in the order above.</p>
${undertakings}
</body></html>`
}
