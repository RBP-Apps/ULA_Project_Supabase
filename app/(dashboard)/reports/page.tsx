import React from 'react'
import type { Metadata } from 'next'
import { ReportsView } from '@/components/ula/reports/ReportsView'

export const metadata: Metadata = {
  title: 'Reports · SuryaSetu',
  description: 'Live execution, LD, completeness, delay, receivable and IP reports.',
}

export default function Page() {
  return <ReportsView />
}
