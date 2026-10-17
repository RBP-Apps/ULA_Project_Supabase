import React from 'react'
import type { Metadata } from 'next'
import { DispatchView } from '@/components/ula/dispatch/DispatchView'

export const metadata: Metadata = {
  title: 'Dispatch & Receiving · SuryaSetu',
  description: 'Dispatch plans, vehicle documents, serial scan against beneficiaries and IP material receipt.',
}

export default function DispatchPage() {
  return <DispatchView />
}
