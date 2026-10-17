import React from 'react'
import type { Metadata } from 'next'
import { MaterialView } from '@/components/ula/material/MaterialView'

export const metadata: Metadata = {
  title: 'Material Planning & Purchase · SuryaSetu',
  description: 'Lot BOM, stock by warehouse, purchase requests, POs, pre-dispatch inspection, GRN and Material Ready.',
}

export default function MaterialPurchasePage() {
  return <MaterialView />
}
