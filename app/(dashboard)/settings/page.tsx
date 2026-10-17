import React from 'react'
import type { Metadata } from 'next'
import { SettingsView } from '@/components/ula/settings/SettingsView'

export const metadata: Metadata = {
  title: 'Settings · SuryaSetu',
  description: 'Masters: rate card, SLAs, districts, installation partners, warehouses, BOM templates.',
}

export default function SettingsPage() {
  return <SettingsView />
}
