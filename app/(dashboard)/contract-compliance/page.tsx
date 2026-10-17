import React from 'react'
import type { Metadata } from 'next'
import { ContractList } from '@/components/contracts/ContractList'

export const metadata: Metadata = {
  title: 'Contract & Compliance · SuryaSetu CSPDCL ULA',
  description: 'Manage contracts, LOA, PBG, agreements, GTP, drawings, and compliance.',
}

export default function ContractCompliancePage() {
  return <ContractList />
}
