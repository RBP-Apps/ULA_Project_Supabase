import React from 'react'
import type { Metadata } from 'next'
import { CmcView } from '@/components/ula/cmc/CmcView'

export const metadata: Metadata = {
  title: 'CMC & Service · SuryaSetu',
  description: 'Five-year CMC: quarterly visits, PR/CUF, complaints, CMC billing and warranty handover.',
}

export default function Page() {
  return <CmcView />
}
