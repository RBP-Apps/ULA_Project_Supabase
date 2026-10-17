import React from 'react'
import type { Metadata } from 'next'
import { InstallationQueue } from '@/components/ula/installation/InstallationQueue'

export const metadata: Metadata = {
  title: 'Installation · SuryaSetu',
  description: 'IP installation checklist, serial re-scan, geotagged photos and signed installation report.',
}

export default function Page() {
  return <InstallationQueue />
}
