'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Save, Search, ShieldAlert, Users } from 'lucide-react'
import { PageHeader, Modal, SelectField, CheckField, EmptyBlock, NoteBanner, Chip, MiniStat, usePaged, Pager, reportSave, toast, useUserName } from '../ui'
import { DEMO_USERS } from '@/lib/auth-context'
import { useIps, useIpMap } from '@/lib/ula/data'
import { useCollection, upsert, logActivity, subscribe } from '@/lib/ula/storage'
import type { RoleAssignment, UlaRole } from '@/lib/ula/types'
import { ULA_ROLES, ROLE_MATRIX } from './roles'

interface UserRow {
  email: string
  name: string
  appRole: string
  entity: string
  source: 'Demo' | 'Registered'
}

function readRegistered(): UserRow[] {
  try {
    const raw = localStorage.getItem('surya-setu-registered-users')
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    // never read or keep passwords
    return list
      .filter((u) => u && typeof u.email === 'string')
      .map((u) => ({ email: String(u.email).toLowerCase(), name: String(u.name || ''), appRole: String(u.role || ''), entity: String(u.entity || ''), source: 'Registered' as const }))
  } catch {
    return []
  }
}

export function UsersRolesView() {
  const roles = useCollection<RoleAssignment>('roles')
  const ips = useIps()
  const ipMap = useIpMap()
  const me = useUserName()
  const [registered, setRegistered] = useState<UserRow[]>([])
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [edit, setEdit] = useState<RoleAssignment | null>(null)

  useEffect(() => {
    setRegistered(readRegistered())
    return subscribe(() => setRegistered(readRegistered()))
  }, [])

  const users = useMemo(() => {
    const demo: UserRow[] = Object.values(DEMO_USERS).map((u) => ({ email: u.email.toLowerCase(), name: u.name, appRole: u.role, entity: u.entity, source: 'Demo' }))
    const seen = new Set<string>()
    return [...demo, ...registered].filter((u) => (seen.has(u.email) ? false : (seen.add(u.email), true)))
  }, [registered])

  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const filtered = users.filter((u) => {
    const t = q.toLowerCase()
    const r = roleMap.get(u.email)
    return (!t || [u.name, u.email, u.entity].some((x) => x.toLowerCase().includes(t))) && (!roleFilter || (roleFilter === '__none' ? !r : r?.role === roleFilter))
  })
  const paged = usePaged(filtered, 25)

  const assigned = users.filter((u) => roleMap.get(u.email)?.active).length

  const save = () => {
    if (!edit) return
    if (!edit.role) return toast('Select a role', 'error')
    if (edit.role === 'IP (Installation Partner)' && !edit.ipId) return toast('Select the installation partner this user belongs to', 'error')
    const rec: RoleAssignment = { ...edit, ipId: edit.role === 'IP (Installation Partner)' ? edit.ipId : undefined }
    if (reportSave(upsert('roles', rec), `${rec.name}: ${rec.role}${rec.active ? '' : ' (inactive)'}`)) {
      logActivity(me, 'Role', rec.id, `Role set to ${rec.role}${rec.active ? '' : ' (inactive)'}`)
      setEdit(null)
    }
  }

  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Administration" title="Users & Roles" description="Map every user to a ULA execution role. The role decides which queue the user sees on the dashboard ('My queue')." />

      <NoteBanner>
        Role-based access is not enforced server-side in this frontend-only phase: roles drive queues and views in this browser only. Users are the demo accounts plus accounts registered in this browser.
      </NoteBanner>

      <div className="mini-stats" style={{ marginTop: 14 }}>
        <MiniStat label="Users" value={users.length} />
        <MiniStat label="Active role assigned" value={assigned} tone="good" />
        <MiniStat label="Without role" value={users.length - users.filter((u) => roleMap.has(u.email)).length} tone={users.some((u) => !roleMap.has(u.email)) ? 'warn' : undefined} onClick={() => setRoleFilter('__none')} active={roleFilter === '__none'} />
      </div>

      <section className="card table-card">
        <div className="toolbar-row">
          <div className="search-box table-search grow">
            <Search className="w-4 h-4 text-slate-400" />
            <input placeholder="Search name, email, entity…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role">
            <option value="">All roles</option>
            <option value="__none">No role assigned</option>
            {ULA_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        {users.length === 0 ? (
          <EmptyBlock icon={Users} title="No users" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Account</th>
                    <th>ULA role</th>
                    <th>Installation partner</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((u) => {
                    const r = roleMap.get(u.email)
                    return (
                      <tr key={u.email}>
                        <td>
                          <div className="cell-title">
                            <strong>{u.name}</strong>
                            <small>{u.email}</small>
                          </div>
                        </td>
                        <td>
                          <Chip tone={u.source === 'Demo' ? 'info' : undefined}>{u.source}</Chip>
                          <br />
                          <small className="muted">
                            {u.appRole} · {u.entity}
                          </small>
                        </td>
                        <td>{r ? <strong>{r.role}</strong> : <Chip tone="warn">Not assigned</Chip>}</td>
                        <td>{r?.ipId ? ipMap.get(r.ipId)?.name || 'Unknown IP' : '—'}</td>
                        <td>{r ? r.active ? <Chip tone="good">Active</Chip> : <Chip>Inactive</Chip> : '—'}</td>
                        <td className="text-right">
                          <button type="button" className="outline-btn btn-sm" onClick={() => setEdit(r ? { ...r } : { id: u.email, name: u.name, role: '' as UlaRole, active: true })}>
                            {r ? 'Change role' : 'Assign role'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyBlock title="No users match" />}
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>

      <section className="card table-card" style={{ marginTop: 16 }}>
        <div className="toolbar-row">
          <div>
            <strong style={{ fontSize: 13 }}>Role matrix (reference)</strong>
            <p className="muted" style={{ fontSize: 10, margin: '3px 0 0' }}>
              <ShieldAlert className="w-3 h-3 inline" /> Every user gets a "My queue" with arrived / due today / overdue. Overdue items escalate one level after 24 hours and to the Director after 48 hours.
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

      {edit && (
        <Modal
          size="narrow"
          eyebrow={edit.id}
          title={`Role for ${edit.name}`}
          onClose={() => setEdit(null)}
          onSubmit={save}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                <Save className="w-4 h-4" /> Save
              </button>
            </>
          }
        >
          <SelectField label="ULA role" required value={edit.role} onChange={(v) => setEdit({ ...edit, role: v as UlaRole })} options={ULA_ROLES} />
          {edit.role === 'IP (Installation Partner)' && (
            <SelectField
              label="Installation partner"
              required
              value={edit.ipId || ''}
              onChange={(v) => setEdit({ ...edit, ipId: v })}
              options={ips.map((i) => ({ value: i.id, label: i.name }))}
              hint={ips.length ? 'The IP user sees only this partner’s work orders' : 'Onboard IPs in Settings first'}
            />
          )}
          {edit.role && <NoteBanner>{ROLE_MATRIX.find((m) => m.role === edit.role)?.can}</NoteBanner>}
          <CheckField label="Active" checked={edit.active} onChange={(c) => setEdit({ ...edit, active: c })} />
        </Modal>
      )}
    </div>
  )
}
