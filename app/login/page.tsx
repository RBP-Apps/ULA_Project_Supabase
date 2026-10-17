import React from 'react'
import type { Metadata } from 'next'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: 'Sign In · SuryaSetu CSPDCL ULA',
  description: 'Sign in to access your CSPDCL ULA project execution workspace.',
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <AuthBrandPanel />
      <LoginForm />
    </main>
  )
}
