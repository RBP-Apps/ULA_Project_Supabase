import React from 'react'
import type { Metadata } from 'next'
import { InvoicingView } from '@/components/ula/billing/InvoicingView'

export const metadata: Metadata = {
  title: 'Lot Docket & Billing · SuryaSetu',
  description: 'Per-lot billing gate, docket builder, invoice and submission record.',
}

export default function InvoicingPage() {
  return <InvoicingView />
}
