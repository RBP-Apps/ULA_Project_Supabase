import React from 'react'
import type { Metadata } from 'next'
import { CommissioningView } from '@/components/ula/commissioning/CommissioningView'

export const metadata: Metadata = {
  title: 'Inspection & Commissioning · SuryaSetu',
  description: 'Net metering, commissioning certificate and PR at commissioning.',
}

export default function CommissioningPage() {
  return <CommissioningView />
}
