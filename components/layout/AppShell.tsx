'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ula/ui'

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const contentRef = useRef<HTMLElement>(null)
  const { isAuthenticated, isLoading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  // Reset scroll position on route change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [pathname])

  // Automatically label table cells for responsive mobile and tablet card views
  useEffect(() => {
    const updateTableLabels = () => {
      const tables = document.querySelectorAll('.table-wrap table, .table-scroll table, table')
      tables.forEach((table) => {
        if (table.classList.contains('no-card-view')) return
        const headerThs = table.querySelectorAll('thead th')
        if (headerThs.length === 0) return
        const headers = Array.from(headerThs).map((th) => th.textContent?.trim() || '')
        const rows = table.querySelectorAll('tbody tr')
        rows.forEach((tr) => {
          const cells = tr.querySelectorAll('td')
          cells.forEach((td, idx) => {
            const h = headers[idx]
            if (h && td.getAttribute('data-label') !== h) {
              td.setAttribute('data-label', h)
            }
          })
        })
      })
    }

    updateTableLabels()
    const observer = new MutationObserver(updateTableLabels)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [pathname])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f4f7f9]">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm font-medium">Loading SuryaSetu workspace...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="main-content">
        <Topbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          onOpenMobile={() => setMobileOpen(true)}
        />

        <main ref={contentRef} className="content-scroll">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  )
}
