import React from 'react'
import type { Metadata } from 'next'
import { QcQueue } from '@/components/ula/qc/QcQueue'

export const metadata: Metadata = {
  title: 'QC · SuryaSetu',
  description: 'QC review of installed sites: accept or reject with reason.',
}

export default function Page() {
  return <QcQueue />
}
