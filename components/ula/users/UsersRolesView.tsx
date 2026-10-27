'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Save,
  Search,
  ShieldAlert,
  Users,
  UserPlus,
  Edit2,
  Trash2,
  CheckSquare,
  Square,
  ShieldCheck,
  Layers,
  Lock,
  Phone,
  Building,
  Mail,
  CheckCircle2,
  UserCheck,
} from 'lucide-react'
import {
  PageHeader,
  Modal,
  SelectField,
  CheckField,
  TextField,
  EmptyBlock,
  NoteBanner,
  Chip,
  MiniStat,
  usePaged,
  Pager,
  toast,
  useUserName,
  confirmAction,
  FormSection,
} from '../ui'
import { fetchAppUsers, saveAppUser, deleteAppUser } from '@/lib/supabase/repository'
import { useIps, useIpMap } from '@/lib/ula/data'
import { useCollection, upsert, remove, logActivity, subscribe } from '@/lib/ula/storage'
import type { RoleAssignment, UlaRole } from '@/lib/ula/types'
import { ULA_ROLES, ROLE_MATRIX } from './roles'
import { navItems, navGroups } from '@/lib/nav-config'
import { useAuth } from '@/lib/auth-context'

interface UserRow {
  id: string
  email: string
  name: string
  appRole: string
  entity: string
  mobile?: string
  active?: boolean
  allowedPages?: string[]
  source: 'Database'
}

interface UserModalState {
  isNew: boolean
  id: string
  name: string
  email: string
  password?: string
  mobile?: string
  entity: string
  appRole: string
  ulaRole: UlaRole | ''
  ipId?: string
  active: boolean
  allowedPages: string[]
}

const ROLE_PAGE_PRESETS: Record<string, string[]> = {
  'Director / Management': navItems.map((n) => n.path),
  'Project Head': navItems.map((n) => n.path),
  'Project Coordinator': [
    '/dashboard',
    '/contract-compliance',
    '/lots',
    '/work-orders',
    '/survey',
    '/portal-update',
    '/reports',
    '/users-roles',
  ],
  'Survey team / IP surveyor': ['/dashboard', '/survey', '/lots'],
  'Engineering': ['/dashboard', '/design', '/lots', '/work-orders'],
  'Purchase / Stores': ['/dashboard', '/material-purchase', '/dispatch', '/lots'],
  'Dispatch team': ['/dashboard', '/material-purchase', '/dispatch'],
  'IP (Installation Partner)': ['/dashboard', '/work-orders', '/installation', '/ip-payment'],
  'QC team': ['/dashboard', '/installation', '/qc', '/work-orders'],
  'Portal / Sync team': ['/dashboard', '/portal-update', '/jcr-status', '/commissioning'],
  'Liaison team (district)': ['/dashboard', '/jcr-status', '/commissioning', '/system-info'],
  'Billing / Accounts': ['/dashboard', '/invoicing', '/payment-tracker', '/ip-payment', '/reports'],
  'O&M team': ['/dashboard', '/cmc', '/system-info'],
}

export function UsersRolesView() {
  const roles = useCollection<RoleAssignment>('roles')
  const ips = useIps()
  const ipMap = useIpMap()
  const me = useUserName()
  const { user: currentUser } = useAuth()

  const [dbUsers, setDbUsers] = useState<UserRow[]>([])
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [modalUser, setModalUser] = useState<UserModalState | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const loadUsers = async () => {
    try {
      const list = await fetchAppUsers()
      if (list && list.length > 0) {
        setDbUsers(
          list.map((u) => ({
            id: u.id || u.email,
            email: u.email.toLowerCase(),
            name: u.name,
            appRole: u.role || 'User',
            entity: u.entity || 'CSPDCL ULA',
            mobile: u.mobile || '',
            active: u.active ?? true,
            allowedPages: u.allowedPages,
            source: 'Database' as const,
          }))
        )
      } else {
        setDbUsers([])
      }
    } catch (e) {
      console.warn('Error loading users from database', e)
    }
  }

  useEffect(() => {
    loadUsers()
    return subscribe(() => {
      loadUsers()
    })
  }, [])

  const users = useMemo(() => {
    const seen = new Set<string>()
    return dbUsers.filter((u) => (seen.has(u.email) ? false : (seen.add(u.email), true)))
  }, [dbUsers])

  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])

  const filtered = users.filter((u) => {
    const t = q.toLowerCase()
    const r = roleMap.get(u.email)
    return (
      (!t || [u.name, u.email, u.entity, u.appRole].some((x) => x?.toLowerCase().includes(t))) &&
      (!roleFilter || (roleFilter === '__none' ? !r : r?.role === roleFilter))
    )
  })

  const paged = usePaged(filtered, 25)

  const assignedCount = users.filter((u) => roleMap.get(u.email)?.active).length
  const fullAccessCount = users.filter((u) => {
    const r = roleMap.get(u.email)
    return !r?.allowedPages || r.allowedPages.length === 0 || r.allowedPages.length >= navItems.length
  }).length

  // Open modal to add a brand new user
  const openNewUser = () => {
    const defaultRole: UlaRole = 'Survey team / IP surveyor'
    setModalUser({
      isNew: true,
      id: `USR-${Date.now().toString().slice(-4)}`,
      name: '',
      email: '',
      password: '',
      mobile: '',
      entity: 'CSPDCL ULA Project Cell',
      appRole: 'Project Engineer',
      ulaRole: defaultRole,
      ipId: '',
      active: true,
      allowedPages: ROLE_PAGE_PRESETS[defaultRole] || ['/dashboard'],
    })
  }

  // Open modal to edit an existing user
  const openEditUser = (u: UserRow) => {
    const r = roleMap.get(u.email)
    const defaultPages =
      r?.allowedPages && r.allowedPages.length > 0
        ? [...r.allowedPages]
        : u.allowedPages && u.allowedPages.length > 0
        ? [...u.allowedPages]
        : navItems.map((n) => n.path)

    setModalUser({
      isNew: false,
      id: u.id || u.email,
      name: u.name,
      email: u.email,
      password: '',
      mobile: u.mobile || '',
      entity: u.entity || '',
      appRole: u.appRole || '',
      ulaRole: (r?.role as UlaRole) || '',
      ipId: r?.ipId || '',
      active: r ? r.active : (u.active ?? true),
      allowedPages: defaultPages,
    })
  }

  // Delete a user with confirmation
  const handleDeleteUser = async (u: UserRow) => {
    const isCurrent = currentUser?.email?.toLowerCase() === u.email.toLowerCase()
    const warning = isCurrent ? '\n\n⚠️ WARNING: This is your currently logged in account!' : ''

    if (
      !confirmAction(
        `Are you sure you want to delete user "${u.name}" (${u.email})?${warning}\n\nThis will permanently delete their database login and role assignment.`
      )
    ) {
      return
    }

    try {
      const ok = await deleteAppUser(u.email)
      if (ok) {
        remove('roles', u.email)
        logActivity(me, 'User', u.email, `Deleted user account "${u.name}"`)
        toast(`User ${u.name} deleted successfully`, 'info')
        await loadUsers()
      } else {
        toast(`Failed to delete user ${u.name} from database`, 'error')
      }
    } catch (err) {
      console.error('Error deleting user:', err)
      toast('Error occurred while deleting user', 'error')
    }
  }

  // Save changes (both Add New and Edit)
  const handleSaveUser = async () => {
    if (!modalUser || isSaving) return

    const name = modalUser.name.trim()
    const email = modalUser.email.trim().toLowerCase()

    if (!name) return toast('Full name is required', 'error')
    if (!email || !email.includes('@')) return toast('Valid email address is required', 'error')

    if (modalUser.isNew && (!modalUser.password || modalUser.password.trim().length < 6)) {
      return toast('Password must be at least 6 characters long', 'error')
    }

    if (!modalUser.ulaRole) {
      return toast('Please select a ULA execution role', 'error')
    }

    if (modalUser.ulaRole === 'IP (Installation Partner)' && !modalUser.ipId) {
      return toast('Select the installation partner this user belongs to', 'error')
    }

    // Ensure /dashboard is always permitted
    const finalAllowedPages =
      modalUser.allowedPages.length > 0
        ? Array.from(new Set(['/dashboard', ...modalUser.allowedPages]))
        : ['/dashboard']

    setIsSaving(true)
    try {
      // 1. Save to Supabase app_users table
      const userDbRecord: Record<string, any> = {
        id: modalUser.id,
        name,
        email,
        role: modalUser.appRole.trim() || 'Project Engineer',
        entity: modalUser.entity.trim() || 'CSPDCL ULA',
        mobile: modalUser.mobile?.trim() || '',
        active: modalUser.active,
        allowedPages: finalAllowedPages,
      }
      if (modalUser.password?.trim()) {
        userDbRecord.passwordHash = modalUser.password.trim()
      }

      const userOk = await saveAppUser(userDbRecord)
      if (!userOk) {
        toast('Failed to save user account to Supabase database', 'error')
        setIsSaving(false)
        return
      }

      // 2. Save to roles collection and Supabase role_assignments table
      const roleRec: RoleAssignment = {
        id: email,
        name,
        role: modalUser.ulaRole as UlaRole,
        ipId: modalUser.ulaRole === 'IP (Installation Partner)' ? modalUser.ipId : undefined,
        active: modalUser.active,
        allowedPages: finalAllowedPages,
      }
      upsert('roles', roleRec)

      // 3. Log activity
      logActivity(
        me,
        'User',
        email,
        modalUser.isNew
          ? `Created user ${name} (${roleRec.role}) with ${finalAllowedPages.length} allowed pages`
          : `Updated user ${name} (${roleRec.role}) profile and page permissions (${finalAllowedPages.length} pages)`
      )

      toast(
        modalUser.isNew
          ? `User "${name}" created with page permissions!`
          : `User "${name}" updated successfully!`,
        'success'
      )

      setModalUser(null)
      await loadUsers()
    } catch (err) {
      console.error('Exception saving user:', err)
      toast('An unexpected error occurred while saving user.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Page selection helpers
  const handleTogglePage = (path: string) => {
    setModalUser((prev) => {
      if (!prev) return null
      const exists = prev.allowedPages.includes(path)
      const next = exists ? prev.allowedPages.filter((p) => p !== path) : [...prev.allowedPages, path]
      return { ...prev, allowedPages: next }
    })
  }

  const handleToggleGroup = (group: string, enable: boolean) => {
    setModalUser((prev) => {
      if (!prev) return null
      const groupPaths = navItems.filter((n) => n.group === group).map((n) => n.path)
      let next: string[]
      if (enable) {
        next = Array.from(new Set([...prev.allowedPages, ...groupPaths]))
      } else {
        next = prev.allowedPages.filter((p) => !groupPaths.includes(p))
      }
      return { ...prev, allowedPages: next }
    })
  }

  const handleSelectAllPages = () => {
    setModalUser((prev) => {
      if (!prev) return null
      return { ...prev, allowedPages: navItems.map((n) => n.path) }
    })
  }

  const handleDeselectAllPages = () => {
    setModalUser((prev) => {
      if (!prev) return null
      return { ...prev, allowedPages: ['/dashboard'] }
    })
  }

  const handleApplyRolePreset = (role: string) => {
    const preset = ROLE_PAGE_PRESETS[role] || navItems.map((n) => n.path)
    setModalUser((prev) => {
      if (!prev) return null
      return { ...prev, allowedPages: preset }
    })
  }

  const handleRoleChange = (role: UlaRole) => {
    setModalUser((prev) => {
      if (!prev) return null
      const next: UserModalState = {
        ...prev,
        ulaRole: role,
        ipId: role === 'IP (Installation Partner)' ? prev.ipId : undefined,
      }
      // If creating new user, auto-select preset pages for this role
      if (prev.isNew && ROLE_PAGE_PRESETS[role]) {
        next.allowedPages = ROLE_PAGE_PRESETS[role]
      }
      return next
    })
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Administration"
        title="Users & Roles"
        description="Manage user credentials, map operational roles, and configure granular page access for every user."
        actions={
          <button type="button" className="primary-btn" onClick={openNewUser}>
            <UserPlus className="w-4 h-4" /> Add New User
          </button>
        }
      />

      <NoteBanner>
        All user accounts and role assignments are synchronized live with the Supabase PostgreSQL database. Permissions configured below dictate exactly which sidebar sections and pages each user can view.
      </NoteBanner>

      <div className="mini-stats" style={{ marginTop: 14 }}>
        <MiniStat label="Total Users" value={users.length} />
        <MiniStat label="Active Roles" value={assignedCount} tone="good" />
        <MiniStat label="Full Access Users" value={fullAccessCount} tone="good" />
        <MiniStat
          label="Without Role"
          value={users.length - users.filter((u) => roleMap.has(u.email)).length}
          tone={users.some((u) => !roleMap.has(u.email)) ? 'warn' : undefined}
          onClick={() => setRoleFilter('__none')}
          active={roleFilter === '__none'}
        />
      </div>

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              placeholder="Search name, email, department, designation…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by Role"
          >
            <option value="">All roles</option>
            <option value="__none">No role assigned</option>
            {ULA_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {users.length === 0 ? (
          <EmptyBlock icon={Users} title="No users found in database" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Account & Entity</th>
                    <th>ULA Role</th>
                    <th>Installation Partner</th>
                    <th>Page Access</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((u) => {
                    const r = roleMap.get(u.email)
                    const allowedCount =
                      r?.allowedPages && r.allowedPages.length > 0
                        ? r.allowedPages.length
                        : u.allowedPages && u.allowedPages.length > 0
                        ? u.allowedPages.length
                        : navItems.length

                    const isFull = allowedCount >= navItems.length

                    return (
                      <tr key={u.email}>
                        <td>
                          <div className="cell-title">
                            <strong>{u.name}</strong>
                            <small>{u.email}</small>
                            {u.mobile && <small className="muted">{u.mobile}</small>}
                          </div>
                        </td>
                        <td>
                          <Chip tone="good">{u.source}</Chip>
                          <br />
                          <small className="muted">
                            {u.appRole} · {u.entity}
                          </small>
                        </td>
                        <td>{r?.role ? <strong>{r.role}</strong> : <Chip tone="warn">Not assigned</Chip>}</td>
                        <td>{r?.ipId ? ipMap.get(r.ipId)?.name || 'Unknown IP' : '—'}</td>
                        <td>
                          {isFull ? (
                            <Chip tone="good">All {navItems.length} Pages</Chip>
                          ) : (
                            <Chip tone="info">
                              {allowedCount} of {navItems.length} Pages
                            </Chip>
                          )}
                        </td>
                        <td>
                          {r ? (
                            r.active ? <Chip tone="good">Active</Chip> : <Chip>Inactive</Chip>
                          ) : u.active ? (
                            <Chip tone="good">Active</Chip>
                          ) : (
                            <Chip>Inactive</Chip>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              type="button"
                              className="outline-btn btn-sm"
                              title="Edit user & page permissions"
                              onClick={() => openEditUser(u)}
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              className="outline-btn btn-sm"
                              style={{ color: '#c2484d', borderColor: '#f8d2d4' }}
                              title="Delete user"
                              onClick={() => handleDeleteUser(u)}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyBlock title="No users match the search filter" />}
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>

      {/* Role Matrix Reference */}
      <section className="card table-card" style={{ marginTop: 16 }}>
        <div className="toolbar-row">
          <div>
            <strong style={{ fontSize: 13 }}>Role matrix (reference)</strong>
            <p className="muted" style={{ fontSize: 10, margin: '3px 0 0' }}>
              <ShieldAlert className="w-3 h-3 inline mr-1" /> Every user gets a &quot;My queue&quot; with arrived / due today / overdue. Overdue items escalate one level after 24 hours and to the Director after 48 hours.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Sees</th>
                <th>Can do</th>
                <th>Escalates to</th>
                <th>Users</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_MATRIX.map((m) => (
                <tr key={m.role}>
                  <td className="strong-cell">{m.role}</td>
                  <td>{m.sees}</td>
                  <td>{m.can}</td>
                  <td>{m.escalatesTo}</td>
                  <td>{roles.filter((r) => r.role === m.role && r.active).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add / Edit User Modal */}
      {modalUser && (
        <Modal
          size="wide"
          eyebrow={modalUser.isNew ? 'User Management' : modalUser.email}
          title={modalUser.isNew ? 'Add New User & Set Permissions' : `Edit User: ${modalUser.name}`}
          subtitle={
            modalUser.isNew
              ? 'Create database credentials, select ULA operational role, and grant access to specific pages.'
              : 'Modify profile, change role, or adjust which sidebar pages are visible to this user.'
          }
          onClose={() => setModalUser(null)}
          onSubmit={handleSaveUser}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 11 }}>
                <strong>{modalUser.allowedPages.length}</strong> of {navItems.length} pages permitted
              </span>
              <div className="row">
                <button type="button" className="secondary-btn" onClick={() => setModalUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={isSaving}>
                  <Save className="w-4 h-4" /> {isSaving ? 'Saving…' : modalUser.isNew ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </div>
          }
        >
          {/* Section 1: User Account Details */}
          <FormSection title="User Profile & Login Credentials" icon={Users}>
            <div className="ula-grid-2">
              <TextField
                label="Full Name"
                required
                value={modalUser.name}
                onChange={(v) => setModalUser({ ...modalUser, name: v })}
                placeholder="e.g. Ramesh Kumar"
              />
              <TextField
                label="Email Address (Login ID)"
                required
                disabled={!modalUser.isNew}
                value={modalUser.email}
                onChange={(v) => setModalUser({ ...modalUser, email: v })}
                placeholder="e.g. ramesh@suryasetu.gov.in"
                hint={!modalUser.isNew ? 'Email cannot be changed once created' : 'Unique login email address'}
              />
              <TextField
                label={modalUser.isNew ? 'Password' : 'Change Password (Optional)'}
                required={modalUser.isNew}
                type="password"
                value={modalUser.password || ''}
                onChange={(v) => setModalUser({ ...modalUser, password: v })}
                placeholder={modalUser.isNew ? 'Minimum 6 characters' : 'Leave blank to keep existing password'}
              />
              <TextField
                label="Mobile Number"
                value={modalUser.mobile || ''}
                onChange={(v) => setModalUser({ ...modalUser, mobile: v })}
                placeholder="+91 98765 43210"
              />
              <TextField
                label="Organization / Entity"
                value={modalUser.entity}
                onChange={(v) => setModalUser({ ...modalUser, entity: v })}
                placeholder="e.g. CSPDCL Raipur Circle / RBP Consortium"
              />
              <TextField
                label="Designation / App Role"
                value={modalUser.appRole}
                onChange={(v) => setModalUser({ ...modalUser, appRole: v })}
                placeholder="e.g. Project Engineer, Site Supervisor"
              />
            </div>
          </FormSection>

          {/* Section 2: ULA Operational Role */}
          <FormSection title="ULA Operational Role & Workflow" icon={ShieldCheck}>
            <div className="ula-grid-2">
              <SelectField
                label="ULA Execution Role"
                required
                value={modalUser.ulaRole}
                onChange={(v) => handleRoleChange(v as UlaRole)}
                options={ULA_ROLES}
              />
              {modalUser.ulaRole === 'IP (Installation Partner)' ? (
                <SelectField
                  label="Installation Partner"
                  required
                  value={modalUser.ipId || ''}
                  onChange={(v) => setModalUser({ ...modalUser, ipId: v })}
                  options={ips.map((i) => ({ value: i.id, label: i.name }))}
                  hint={ips.length ? 'User sees only this partner’s work orders' : 'Onboard IPs in Settings first'}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                  <CheckField
                    label="Active Account (Enabled for login and dashboard queues)"
                    checked={modalUser.active}
                    onChange={(c) => setModalUser({ ...modalUser, active: c })}
                  />
                </div>
              )}
            </div>

            {modalUser.ulaRole === 'IP (Installation Partner)' && (
              <div style={{ marginTop: 8 }}>
                <CheckField
                  label="Active Account (Enabled for login and partner dashboard)"
                  checked={modalUser.active}
                  onChange={(c) => setModalUser({ ...modalUser, active: c })}
                />
              </div>
            )}

            {modalUser.ulaRole && (
              <NoteBanner>
                <div>
                  <strong>Role Responsibility:</strong> {ROLE_MATRIX.find((m) => m.role === modalUser.ulaRole)?.can}
                  <div className="muted" style={{ marginTop: 3 }}>
                    Sees: {ROLE_MATRIX.find((m) => m.role === modalUser.ulaRole)?.sees} · Escalates to:{' '}
                    {ROLE_MATRIX.find((m) => m.role === modalUser.ulaRole)?.escalatesTo}
                  </div>
                </div>
              </NoteBanner>
            )}
          </FormSection>

          {/* Section 3: Granular Page Access Control */}
          <FormSection
            title="Page Access Control (Sidebar Navigation Permissions)"
            icon={Layers}
            aside={
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="outline-btn btn-sm" onClick={handleSelectAllPages}>
                  <CheckSquare className="w-3.5 h-3.5 mr-1" /> Select All ({navItems.length})
                </button>
                <button type="button" className="outline-btn btn-sm" onClick={handleDeselectAllPages}>
                  <Square className="w-3.5 h-3.5 mr-1" /> Clear All
                </button>
                {modalUser.ulaRole && (
                  <button
                    type="button"
                    className="outline-btn btn-sm"
                    onClick={() => handleApplyRolePreset(modalUser.ulaRole)}
                  >
                    Apply {modalUser.ulaRole.split(' ')[0]} Preset
                  </button>
                )}
              </div>
            }
          >
            <p className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
              Check the pages you want to show to this user. Unchecked pages will be hidden from their sidebar and access will be restricted.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {navGroups.map((group) => {
                const groupItems = navItems.filter((n) => n.group === group)
                const allGroupChecked = groupItems.every((n) => modalUser.allowedPages.includes(n.path))

                return (
                  <div
                    key={group}
                    style={{
                      border: '1px solid #e2ecee',
                      borderRadius: 8,
                      background: '#fbfcfd',
                      padding: '10px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                        paddingBottom: 6,
                        borderBottom: '1px solid #edf3f5',
                      }}
                    >
                      <strong style={{ fontSize: 12, color: '#1f3c47' }}>{group}</strong>
                      <button
                        type="button"
                        className="outline-btn btn-sm"
                        style={{ fontSize: 10, padding: '2px 8px', height: 22 }}
                        onClick={() => handleToggleGroup(group, !allGroupChecked)}
                      >
                        {allGroupChecked ? 'Deselect Group' : 'Select Group'}
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 8,
                      }}
                    >
                      {groupItems.map((item) => {
                        const checked = modalUser.allowedPages.includes(item.path)
                        const Icon = item.icon
                        return (
                          <label
                            key={item.path}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 10px',
                              borderRadius: 6,
                              border: checked ? '1px solid #168e80' : '1px solid #e5eef1',
                              background: checked ? '#f0f9f8' : '#fff',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleTogglePage(item.path)}
                              style={{ accentColor: '#168e80', width: 15, height: 15 }}
                            />
                            <Icon className={`w-4 h-4 shrink-0 ${checked ? 'text-teal-700' : 'text-slate-400'}`} />
                            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: checked ? 600 : 500,
                                  color: checked ? '#0f4841' : '#334e58',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  overflow: 'hidden',
                                }}
                              >
                                {item.label}
                              </span>
                              <small style={{ fontSize: 9, color: '#889da3' }}>{item.path}</small>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </FormSection>
        </Modal>
      )}
    </div>
  )
}
