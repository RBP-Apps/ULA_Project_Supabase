'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  PanelLeft,
  ChevronRight,
  Bell,
  Search,
  AlertTriangle,
  Clock3,
} from 'lucide-react'
import { navItems } from '@/lib/nav-config'
import { useAuth } from '@/lib/auth-context'
import { useWorkItems, alertsFrom, escalationOf } from '@/lib/ula/alerts'
import { useBeneficiaries, useLots, useContracts } from '@/lib/ula/data'
import { BeneficiaryDrawer } from '@/components/ula/BeneficiaryDrawer'
import { stageOf } from '@/lib/ula/workflow'

interface TopbarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenMobile: () => void
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOut])
}

export function Topbar({ collapsed, onToggleCollapse, onOpenMobile }: TopbarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const items = useWorkItems()
  const alerts = useMemo(() => alertsFrom(items), [items])
  const bens = useBeneficiaries()
  const lots = useLots()
  const contracts = useContracts()
  const [notifOpen, setNotifOpen] = useState(false)
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [viewBen, setViewBen] = useState<string | null>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  useClickOutside(notifRef, () => setNotifOpen(false))
  useClickOutside(searchRef, () => setSearchOpen(false))

  const currentNav =
    navItems.find((n) =>
      n.path === '/dashboard'
        ? pathname === '/dashboard' || pathname === '/'
        : pathname.startsWith(n.path)
    ) || navItems[0]

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return null
    return {
      bens: bens.filter((b) => [b.appNo, b.name, b.consumerNo, b.mobile].some((x) => x?.toLowerCase().includes(t))).slice(0, 8),
      lots: lots.filter((l) => [l.lotNo, l.allotmentLetterNo, l.district].some((x) => x?.toLowerCase().includes(t))).slice(0, 5),
      contracts: contracts.filter((c) => [c.contractName, c.packageCode].some((x) => x?.toLowerCase().includes(t))).slice(0, 5),
    }
  }, [q, bens, lots, contracts])

  const highCount = alerts.filter((a) => a.severity === 'high').length

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-btn menu-btn"
          aria-label="Open mobile navigation"
          onClick={onOpenMobile}
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          className="icon-btn collapse-btn"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapse}
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        <div className="breadcrumbs">
          <span>SuryaSetu</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentNav.group}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <strong>{currentNav.label}</strong>
        </div>
      </div>

      <div className="topbar-right">
        {/* Search: lots, beneficiaries, packages */}
        <div className="notif-wrap" ref={searchRef}>
          <div className="search-box">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search application no., beneficiary, lot, package..."
              aria-label="Search portal"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
            />
          </div>
          {searchOpen && results && (
            <div className="notif-panel" style={{ left: 0, right: 'auto' }}>
              {results.bens.length + results.lots.length + results.contracts.length === 0 && <div className="notif-item">No matches for “{q}”.</div>}
              {results.bens.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="notif-item"
                  style={{ width: '100%', background: 'none', border: 0, textAlign: 'left' }}
                  onClick={() => {
                    setViewBen(b.id)
                    setSearchOpen(false)
                  }}
                >
                  <div>
                    <strong>{b.name}</strong> <small>{b.appNo} · {stageOf(b)}</small>
                  </div>
                </button>
              ))}
              {results.lots.map((l) => (
                <Link key={l.id} href={`/lots/${l.id}`} className="notif-item" onClick={() => setSearchOpen(false)}>
                  <div>
                    <strong>Lot {l.lotNo}</strong> <small>{l.district} · {l.allotmentLetterNo}</small>
                  </div>
                </Link>
              ))}
              {results.contracts.map((c) => (
                <Link key={c.id} href={`/contract-compliance/${c.id}`} className="notif-item" onClick={() => setSearchOpen(false)}>
                  <div>
                    <strong>{c.packageCode || c.contractName}</strong> <small>Package · {c.contractName}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Notification Bell: live alerts derived from stored records */}
        <div className="notif-wrap" ref={notifRef}>
          <button className="icon-btn notification-btn" aria-label={`Notifications (${alerts.length})`} title="Alerts" onClick={() => setNotifOpen((o) => !o)} style={{ position: 'relative' }}>
            <Bell className="w-4 h-4" />
            {alerts.length > 0 && <span className="notif-count">{alerts.length > 99 ? '99+' : alerts.length}</span>}
          </button>
          {notifOpen && (
            <div className="notif-panel">
              <header>
                <strong>Alerts ({alerts.length})</strong>
                <span className="muted">{highCount} high priority</span>
              </header>
              {alerts.length === 0 && <div className="notif-item">Nothing overdue. All queues are within their SLA.</div>}
              {alerts.slice(0, 50).map((a) => {
                const esc = escalationOf(a)
                return (
                  <Link key={a.id} href={a.href} className="notif-item" onClick={() => setNotifOpen(false)}>
                    {a.severity === 'high' ? <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" /> : <Clock3 className="w-4 h-4 text-amber-500 shrink-0" />}
                    <div>
                      {a.title}
                      <small>
                        {a.detail} · {a.role}
                        {esc.level > 0 && esc.to ? ` · escalated to ${esc.to}` : ''}
                      </small>
                    </div>
                  </Link>
                )
              })}
              {alerts.length > 50 && (
                <Link href="/dashboard" className="notif-item" onClick={() => setNotifOpen(false)}>
                  View all {alerts.length} on the dashboard
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Topbar User Profile */}
        <div className="top-user">
          <span className="avatar">{user?.avatar || 'AS'}</span>
          <div className="top-user-info">
            <strong>{user?.name || 'Ankit Sharma'}</strong>
            <span>{user?.entity || 'CSPDCL'}</span>
          </div>
        </div>
      </div>
      {viewBen && <BeneficiaryDrawer id={viewBen} onClose={() => setViewBen(null)} />}
    </header>
  )
}
