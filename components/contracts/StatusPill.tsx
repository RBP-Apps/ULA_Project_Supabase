'use client'

import React from 'react'
import { Status } from '@/lib/types'

interface StatusPillProps {
  value: Status | string
  className?: string
}

export function StatusPill({ value, className = '' }: StatusPillProps) {
  if (!value) return null

  const normalized = value.toLowerCase().replace(/\s+/g, '-')

  let variantClass = 'status-pending'

  if (['approved', 'accepted', 'signed', 'compliant', 'completed', 'active'].includes(normalized)) {
    variantClass = 'status-good'
  } else if (['under-review', 'in-progress', 'submitted', 'scheduled'].includes(normalized)) {
    variantClass = 'status-info'
  } else if (['at-risk', 'pending', 'revision-required'].includes(normalized)) {
    variantClass = 'status-warning'
  } else if (['overdue', 'rejected', 'expired'].includes(normalized)) {
    variantClass = 'status-danger'
  } else if (['not-started', 'not-submitted'].includes(normalized)) {
    variantClass = 'status-neutral'
  }

  return (
    <span className={`status-pill ${variantClass} ${className}`}>
      {value}
    </span>
  )
}
