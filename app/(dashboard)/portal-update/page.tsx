import React from 'react'
import type { Metadata } from 'next'
import { PortalQueue } from '@/components/ula/portal/PortalQueue'

export const metadata: Metadata = {
  title: 'Portal Update · SuryaSetu',
  description: 'National Portal upload status and net-meter application per site.',
}

export default function Page() {
  return <PortalQueue />
}
