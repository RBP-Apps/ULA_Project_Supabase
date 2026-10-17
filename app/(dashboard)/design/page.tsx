import React from 'react'
import type { Metadata } from 'next'
import { DesignView } from '@/components/ula/design/DesignView'

export const metadata: Metadata = {
  title: 'Design & Simulation · SuryaSetu',
  description: 'Layout, PVsyst / Helioscope simulation and Engineer-in-Charge approval.',
}

export default function Page() {
  return <DesignView />
}
