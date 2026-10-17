import type { PaymentFollowUp, PaymentSource, Docket } from '@/lib/ula/types'
import { daysBetween, today } from '@/lib/ula/workflow'

export const SOURCES: PaymentSource[] = ['CFA (MNRE)', 'SFA + District share (CSPDCL)']
export const DESKS = ['District office', 'Circle office', 'HO (RA&PM)', 'Accounts', 'Paid'] as const

export interface PaymentStats {
  expected: number
  gross: number
  deductions: number
  net: number
  writeOff: number
  outstanding: number
  bySource: Record<PaymentSource, { expected: number; gross: number; outstanding: number }>
  lastActivity: string
  idleDays: number
  idle: boolean
  desk: string
  openQueries: number
}

export function paymentStats(p: PaymentFollowUp, docket: Docket | undefined, idleLimit: number): PaymentStats {
  const expected = p.expected.reduce((a, e) => a + (e.amount || 0), 0)
  const gross = p.receipts.reduce((a, r) => a + r.gross, 0)
  const deductions = p.receipts.reduce((a, r) => a + r.tds + r.ld + r.otherDeduction, 0)
  const net = p.receipts.reduce((a, r) => a + r.net, 0)
  const writeOff = p.writeOff?.amount || 0
  const outstanding = Math.max(0, expected - gross - writeOff)
  const bySource = Object.fromEntries(
    SOURCES.map((s) => {
      const ex = p.expected.filter((e) => e.source === s).reduce((a, e) => a + e.amount, 0)
      const g = p.receipts.filter((r) => r.source === s).reduce((a, r) => a + r.gross, 0)
      return [s, { expected: ex, gross: g, outstanding: Math.max(0, ex - g) }]
    })
  ) as PaymentStats['bySource']
  const dates = [
    docket?.submittedAt?.slice(0, 10) || '',
    ...p.movements.map((m) => m.date),
    ...p.receipts.map((r) => r.date),
    ...p.queries.flatMap((q) => [q.raisedAt.slice(0, 10), q.repliedAt?.slice(0, 10) || '']),
  ].filter(Boolean)
  const lastActivity = dates.sort().slice(-1)[0] || ''
  const idleDays = lastActivity ? Math.max(0, daysBetween(lastActivity, today())) : 0
  const lastMove = [...p.movements].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
  return {
    expected,
    gross,
    deductions,
    net,
    writeOff,
    outstanding,
    bySource,
    lastActivity,
    idleDays,
    idle: !p.closed && idleDays > idleLimit,
    desk: p.closed ? 'Closed' : lastMove?.desk || '—',
    openQueries: p.queries.filter((q) => !q.reply.trim()).length,
  }
}
