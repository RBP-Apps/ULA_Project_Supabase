import React from 'react'
import type { Metadata } from 'next'
import { SurveyView } from '@/components/ula/survey/SurveyView'

export const metadata: Metadata = {
  title: 'Survey & Feasibility · SuryaSetu',
  description: 'Site survey, feasibility and CSPDCL review.',
}

export default function Page() {
  return <SurveyView />
}
