'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  SolarPanel,
  Building2,
  LogOut,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { navItems, navGroups } from '@/lib/nav-config'
import { useAuth } from '@/lib/auth-context'

interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const navRef = React.useRef<HTMLElement>(null)

  const handleSidebarWheel = (e: React.WheelEvent<HTMLElement>) => {
    // Stop the wheel event from bubbling out to any parent container
    e.stopPropagation()

    // If mouse is wheeling over brand header or bottom card, smoothly forward scroll to nav items
    if (navRef.current && !navRef.current.contains(e.target as Node)) {
      navRef.current.scrollTop += e.deltaY
    }
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        onWheel={handleSidebarWheel}
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${
          mobileOpen ? 'mobile-open' : ''
        }`}
      >
        {/* Brand Row */}
        <div className="sidebar-brand">
          <Link href="/dashboard" className="brand-lockup" onClick={onCloseMobile}>
            <span className="brand-mark">
              <SolarPanel className="w-5 h-5 text-white" />
            </span>
            {!collapsed && (
              <span className="brand-name">
                surya<span>setu</span>
              </span>
            )}
          </Link>
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={onCloseMobile}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project Switcher */}
        <div className="project-switcher">
          <Building2 className="project-icon shrink-0 w-4 h-4" />
          {!collapsed && (
            <div className="project-copy">
              <strong>ULA · Chhattisgarh</strong>
              <span>CSPDCL Solar Control</span>
            </div>
          )}
        </div>

        {/* Nav Items Grouped */}
        <nav ref={navRef} className="side-nav">
          {navGroups.map((group) => {
            const items = navItems.filter((n) => n.group === group)
            return (
              <div className="nav-group" key={group}>
                {!collapsed && <p className="nav-label">{group}</p>}
                {items.map(({ label, path, icon: Icon }) => {
                  const isActive =
                    path === '/dashboard'
                      ? pathname === '/dashboard' || pathname === '/'
                      : pathname.startsWith(path)

                  return (
                    <Link
                      key={path}
                      href={path}
                      onClick={onCloseMobile}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Sidebar Bottom: User card & Logout */}
        <div className="sidebar-bottom">
          <button className="nav-item sign-out-btn" onClick={logout} title="Sign out">
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>

          <div className="user-mini">
            <span className="avatar">{user?.avatar || 'AS'}</span>
            {!collapsed && (
              <div className="user-info-text">
                <strong>{user?.name || 'Ankit Sharma'}</strong>
                <small>{user?.role || 'Project Administrator'}</small>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
