import React from 'react'
import type { Metadata } from 'next'
import { PaymentTrackerView } from '@/components/ula/payments/PaymentTrackerView'

export const metadata: Metadata = {
  title: 'Payment Tracker · SuryaSetu',
  description: 'Lot receivables by source, file movement, queries and receipts.',
}

export default function PaymentTrackerPage() {
  return <PaymentTrackerView />
}
