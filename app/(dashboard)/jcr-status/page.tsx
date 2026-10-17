import React from 'react'
import type { Metadata } from 'next'
import { JcrView } from '@/components/ula/jcr/JcrView'

export const metadata: Metadata = {
  title: 'JCR Status · SuryaSetu',
  description: 'CSPDCL inspection, Joint Inspection Report signatures and Annex G delay evidence.',
}

export default function JcrStatusPage() {
  return <JcrView />
}
