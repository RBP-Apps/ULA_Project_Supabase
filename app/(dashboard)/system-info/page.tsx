import React from 'react'
import type { Metadata } from 'next'
import { MonitoringView } from '@/components/ula/monitoring/MonitoringView'

export const metadata: Metadata = {
  title: 'System Info · SuryaSetu',
  description: 'Data logger, SIM and generation monitoring per site.',
}

export default function Page() {
  return <MonitoringView />
}
