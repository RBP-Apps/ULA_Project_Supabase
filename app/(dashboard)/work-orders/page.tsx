import React from 'react'
import type { Metadata } from 'next'
import { WorkOrdersView } from '@/components/ula/workorders/WorkOrdersView'

export const metadata: Metadata = {
  title: 'Work Orders · SuryaSetu',
  description: 'IP work orders split from locked lots.',
}

export default function Page() {
  return <WorkOrdersView />
}
