import React from 'react'
import type { Metadata } from 'next'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { SignupForm } from '@/components/auth/SignupForm'

export const metadata: Metadata = {
  title: 'Register Account · SuryaSetu CSPDCL ULA',
  description: 'Create an official account for CSPDCL ULA solar project management.',
}

export default function SignupPage() {
  return (
    <main className="auth-page">
      <AuthBrandPanel />
      <SignupForm />
    </main>
  )
}
