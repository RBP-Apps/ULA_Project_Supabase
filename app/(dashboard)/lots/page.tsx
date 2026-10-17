import React from 'react'
import type { Metadata } from 'next'
import { LotRegister } from '@/components/ula/lots/LotRegister'

export const metadata: Metadata = {
  title: 'Lots & Beneficiaries · SuryaSetu',
  description: 'CSPDCL lot register, beneficiary list import and lot clocks.',
}

export default function LotsPage() {
  return <LotRegister />
}
