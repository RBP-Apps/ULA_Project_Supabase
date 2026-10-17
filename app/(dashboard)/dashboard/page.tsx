import React from 'react'
import type { Metadata } from 'next'
import { DashboardView } from '@/components/dashboard/DashboardView'

export const metadata: Metadata = {
  title: 'Dashboard · SuryaSetu CSPDCL ULA',
  description: 'Executive overview and project lifecycle monitoring for CSPDCL ULA solar projects.',
}

export default function DashboardPage() {
  return <DashboardView />
}
