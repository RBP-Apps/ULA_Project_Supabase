'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  UserPlus,
  Mail,
  LockKeyhole,
  Building,
  Phone,
  User,
  Shield,
  Eye,
  EyeOff,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export function SignupForm() {
  const router = useRouter()
  const { signup } = useAuth()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    entity: 'RBP Energy Ltd',
    role: 'Project Manager',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid official email address.')
      return
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!agreeTerms) {
      setError('Please accept CSPDCL security & compliance terms.')
      return
    }

    setIsSubmitting(true)
    const result = await signup({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      entity: formData.entity,
      mobile: formData.mobile,
    })
    setIsSubmitting(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
      }, 1000)
    } else {
      setError(result.error || 'Failed to register account.')
    }
  }

  return (
    <div className="auth-form-container">
      <div className="auth-card signup-card">
        {/* Card Header */}
        <div className="auth-card-top">
          <div className="auth-icon-badge">
            <UserPlus className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <span className="auth-kicker">Account Registration</span>
            <h2 className="auth-title">Create SuryaSetu Account</h2>
          </div>
        </div>
        <p className="auth-subtitle">
          Register to access CSPDCL ULA project execution workflows & records.
        </p>

        {/* Error alert */}
        {error && (
          <div className="auth-error-box">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Success alert */}
        {success && (
          <div className="auth-success-box">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>Account created successfully! Redirecting to workspace...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Full Name & Phone in 2-col */}
          <div className="form-row-2">
            <div className="auth-field">
              <label htmlFor="name">Full Name *</label>
              <div className="auth-input-wrap">
                <User className="auth-input-icon" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="e.g. Ankit Sharma"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="mobile">Mobile Number</label>
              <div className="auth-input-wrap">
                <Phone className="auth-input-icon" />
                <input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  placeholder="+91 98765 00000"
                  value={formData.mobile}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="auth-field">
            <label htmlFor="email">Official Email Address *</label>
            <div className="auth-input-wrap">
              <Mail className="auth-input-icon" />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="name@cspdcl.co.in or partner email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {/* Entity & Role */}
          <div className="form-row-2">
            <div className="auth-field">
              <label htmlFor="entity">Organization / Entity *</label>
              <div className="auth-input-wrap">
                <Building className="auth-input-icon" />
                <select
                  id="entity"
                  name="entity"
                  value={formData.entity}
                  onChange={handleChange}
                >
                  <option value="CSPDCL Project Office">CSPDCL Project Office</option>
                  <option value="RBP Energy Ltd">RBP Energy Ltd</option>
                  <option value="Rotomag Partner">Rotomag Partner</option>
                  <option value="RBP + Rotomag Consortium">RBP + Rotomag Consortium</option>
                  <option value="Authorized EPC Vendor">Authorized EPC Vendor</option>
                </select>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="role">Assigned Role *</label>
              <div className="auth-input-wrap">
                <Shield className="auth-input-icon" />
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="Project Administrator">Project Administrator</option>
                  <option value="Executive Engineer (EE)">Executive Engineer (EE)</option>
                  <option value="Superintending Engineer (SE)">Superintending Engineer (SE)</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Field Site Engineer">Field Site Engineer</option>
                  <option value="Quality Inspector">Quality Inspector</option>
                  <option value="Billing & Accounts Lead">Billing & Accounts Lead</option>
                </select>
              </div>
            </div>
          </div>

          {/* Password & Confirm Password */}
          <div className="form-row-2">
            <div className="auth-field">
              <label htmlFor="password">Password (min 6 chars) *</label>
              <div className="auth-input-wrap">
                <LockKeyhole className="auth-input-icon" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create password"
                  value={formData.password}
                  onChange={handleChange}
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

            <div className="auth-field">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <div className="auth-input-wrap">
                <LockKeyhole className="auth-input-icon" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>

          {/* Compliance acceptance */}
          <div className="auth-options">
            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              <span>
                I agree to CSPDCL solar data governance, JCR protocols, and privacy guidelines
              </span>
            </label>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting || success}
            className="auth-submit-btn"
          >
            <span>{isSubmitting ? 'Creating account...' : 'Create Account & Enter'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </form>

        {/* Switch to Login */}
        <div className="auth-switch-foot">
          <p>
            Already registered?{' '}
            <Link href="/login" className="auth-switch-link">
              Sign in to your account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
