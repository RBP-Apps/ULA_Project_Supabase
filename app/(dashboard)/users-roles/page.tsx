import React from 'react'
import type { Metadata } from 'next'
import { UsersRolesView } from '@/components/ula/users/UsersRolesView'

export const metadata: Metadata = {
  title: 'Users & Roles · SuryaSetu',
  description: 'ULA role assignment and role matrix.',
}

export default function Page() {
  return <UsersRolesView />
}
