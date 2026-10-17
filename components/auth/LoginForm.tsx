'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  LockKeyhole,
  Mail,
  Eye,
  EyeOff,
  ChevronRight,
  Shield,
  UserCheck,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { useAuth, DEMO_USERS } from '@/lib/auth-context'

export function LoginForm() {
  const router = useRouter()
  const { login, demoLogin } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Please provide both email and password.')
      return
    }

    setIsSubmitting(true)
    const result = await login(email, password)
    setIsSubmitting(false)

    if (result.success) {
      router.push('/dashboard')
    } else {
      setError(result.error || 'Failed to sign in.')
    }
  }

  const handleQuickDemo = (type: 'admin' | 'officer' | 'vendor') => {
    demoLogin(type)
    router.push('/dashboard')
  }

  return (
    <div className="auth-form-container">
      <div className="auth-card">
        {/* Card Header */}
        <div className="auth-card-top">
          <div className="auth-icon-badge">
            <LockKeyhole className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <span className="auth-kicker">Secure Access</span>
            <h2 className="auth-title">Welcome back</h2>
          </div>
        </div>
        <p className="auth-subtitle">
          Sign in to access your ULA project execution workspace.
        </p>

        {/* Error message */}
        {error && (
          <div className="auth-error-box">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Email field */}
          <div className="auth-field">
            <label htmlFor="login-email">Official Email or Username</label>
            <div className="auth-input-wrap">
              <Mail className="auth-input-icon" />
              <input
                id="login-email"
                type="text"
                placeholder="admin@suryasetu.gov.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          {/* Password field */}
          <div className="auth-field">
            <div className="auth-field-header">
              <label htmlFor="login-password">Password</label>
              <button
                type="button"
                onClick={() => alert('For password reset, contact CSPDCL IT Desk or use demo credentials.')}
                className="auth-link-sm"
              >
                Forgot password?
              </button>
            </div>
            <div className="auth-input-wrap">
              <LockKeyhole className="auth-input-icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="auth-input-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div className="auth-options">
            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember this session</span>
            </label>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="auth-submit-btn"
          >
            <span>{isSubmitting ? 'Signing in...' : 'Sign in to Dashboard'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Logins Section */}
        <div className="auth-demo-divider">
          <span>or 1-click instant demo access</span>
        </div>

        <div className="demo-accounts-grid">
          <button
            type="button"
            className="demo-account-btn"
            onClick={() => handleQuickDemo('admin')}
          >
            <div className="demo-badge admin">Admin</div>
            <div className="demo-info">
              <strong>Ankit Sharma</strong>
              <span>admin@suryasetu.gov.in</span>
            </div>
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          </button>

          <button
            type="button"
            className="demo-account-btn"
            onClick={() => handleQuickDemo('officer')}
          >
            <div className="demo-badge cspdcl">CSPDCL</div>
            <div className="demo-info">
              <strong>Ramesh Verma (SE)</strong>
              <span>verma.cspdcl@gov.in</span>
            </div>
            <UserCheck className="w-3.5 h-3.5 text-blue-600" />
          </button>

          <button
            type="button"
            className="demo-account-btn"
            onClick={() => handleQuickDemo('vendor')}
          >
            <div className="demo-badge partner">Partner</div>
            <div className="demo-info">
              <strong>Vikas Deshmukh</strong>
              <span>vikas@rbprotomag.in</span>
            </div>
            <Shield className="w-3.5 h-3.5 text-amber-600" />
          </button>
        </div>

        {/* Switch to Signup */}
        <div className="auth-switch-foot">
          <p>
            Don't have an account yet?{' '}
            <Link href="/signup" className="auth-switch-link">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
