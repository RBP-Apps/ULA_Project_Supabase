'use client'

// CMC schedule & billing rules (Sec-4 cl. 7.3, 7.8, 11.2; Sec-5 cl. 12.6): 5 years = 20 quarters from commissioning.

import type { Beneficiary, CmcVisit, Lot, Settings } from '@/lib/ula/types'
import { isCommissioned, parseYmd, toYmd, today, siteValue } from '@/lib/ula/workflow'

export const CMC_QUARTERS = 20

export const CMC_CHECKS = ['Modules (cleanliness, damage)', 'Inverter (display, faults)', 'Earthing and LA', 'ACDB / DCDB', 'Cables and connectors', 'Data logger reporting', 'Structure and fasteners']

export function addMonths(date: string, months: number): string {
  const d = parseYmd(date)
  if (!d) return ''
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return toYmd(d)
}

/** Due date (end) of CMC quarter n (1..20) for a site commissioned on `commissionedDate`. */
export function quarterDue(commissionedDate: string, n: number) {
  return addMonths(commissionedDate, 3 * n)
}

export function commissionedSites(bens: Beneficiary[], settings: Settings) {
  return bens.filter((b) => isCommissioned(b, settings) && b.commissioning.commissionedDate)
}

export function visitFor(visits: CmcVisit[], beneficiaryId: string, quarter: number) {
  return visits.find((v) => v.beneficiaryId === beneficiaryId && v.quarter === quarter)
}

export interface SiteSchedule {
  b: Beneficiary
  quarterNow: number // quarter currently running (1..20), 21 = CMC over
  nextDue?: { quarter: number; due: string }
  overdue: { quarter: number; due: string }[]
  done: number
}

export function siteSchedule(b: Beneficiary, visits: CmcVisit[], asOf = today()): SiteSchedule {
  const cd = b.commissioning.commissionedDate
  const overdue: SiteSchedule['overdue'] = []
  let nextDue: SiteSchedule['nextDue']
  let done = 0
  let quarterNow = CMC_QUARTERS + 1
  for (let q = 1; q <= CMC_QUARTERS; q++) {
    const due = quarterDue(cd, q)
    const v = visitFor(visits, b.id, q)
    if (v) done++
    if (due >= asOf && quarterNow > CMC_QUARTERS) quarterNow = q
    if (!v) {
      if (due < asOf) overdue.push({ quarter: q, due })
      else if (!nextDue) nextDue = { quarter: q, due }
    }
  }
  return { b, quarterNow, nextDue, overdue, done }
}

/** Latest commissioning date in the lot — the lot's CMC quarters run from here. */
export function lotCmcStart(lotId: string, sites: Beneficiary[]) {
  const dates = sites.filter((b) => b.lotId === lotId).map((b) => b.commissioning.commissionedDate).filter(Boolean).sort()
  return dates[dates.length - 1] || ''
}

export function lotCmcValue(lot: Lot, bens: Beneficiary[], settings: Settings) {
  // value of commissioned sites only — dropped / unfinished sites earn no CMC
  const value = commissionedSites(bens.filter((b) => b.lotId === lot.id), settings).reduce((a, b) => a + siteValue(b.sanctionedKw, settings), 0)
  return value
}

export function quarterBillAmount(lotValue: number, settings: Settings) {
  return Math.round((lotValue * settings.cmcSharePercent) / 100 / CMC_QUARTERS)
}

/** Reasons a lot's CMC bill for `quarter` cannot be raised yet (empty = allowed). */
export function cmcBillBlockers(lot: Lot, quarter: number, bens: Beneficiary[], visits: CmcVisit[], settings: Settings, asOf = today()): string[] {
  const sites = commissionedSites(bens.filter((b) => b.lotId === lot.id), settings)
  const out: string[] = []
  if (!sites.length) return ['No commissioned sites in this lot']
  const start = lotCmcStart(lot.id, sites)
  const end = quarterDue(start, quarter)
  if (end > asOf) out.push(`Quarter ${quarter} ends on ${end}`)
  sites.forEach((b) => {
    const v = visitFor(visits, b.id, quarter)
    if (!v) out.push(`${b.appNo} (${b.name}): no visit logged for Q${quarter}`)
    else {
      if (v.pr < settings.minPrCommissioning) out.push(`${b.appNo}: PR ${v.pr}% below ${settings.minPrCommissioning}%`)
      if (v.cuf < settings.minCufCmc) out.push(`${b.appNo}: CUF ${v.cuf}% below ${settings.minCufCmc}%`)
    }
  })
  return out
}
