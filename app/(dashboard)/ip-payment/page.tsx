import React from 'react'
import type { Metadata } from 'next'
import { IpPaymentView } from '@/components/ula/ippay/IpPaymentView'

export const metadata: Metadata = {
  title: 'IP Payment · SuryaSetu',
  description: 'Installation partner bills against QC-passed and commissioned sites.',
}

export default function IpPaymentPage() {
  return <IpPaymentView />
}
