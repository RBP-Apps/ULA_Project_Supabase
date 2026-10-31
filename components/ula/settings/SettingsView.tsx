'use client'

import React, { useEffect, useState } from 'react'
import { Save, Plus, Pencil, Trash2, Download, Upload, AlertTriangle, Database, Wand2, CloudUpload, Loader2, RefreshCw } from 'lucide-react'
import {
  PageHeader,
  Tabs,
  Modal,
  TextField,
  NumberField,
  SelectField,
  CheckField,
  FormSection,
  EmptyBlock,
  NoteBanner,
  Chip,
  confirmAction,
  reportSave,
  toast,
  useUserName,
} from '../ui'
import { useIps, useWarehouses, useItems, useBomTemplates, useBeneficiaries, useWorkOrders, useDispatches, useStockMoves } from '@/lib/ula/data'
import { upsert, upsertAsync, upsertMany, remove, removeAsync, newId, logActivity, clearAllUlaData, exportAllUlaData, storageUsageKb, writeKey, syncWithSupabase, pushAllLocalDataToSupabase } from '@/lib/ula/storage'
import { clearAllFiles } from '@/lib/ula/files'
import { saveContract, upsertManyRecords } from '@/lib/supabase/repository'
import { useSettings, saveSettings, saveSettingsAsync, DEFAULT_SETTINGS, fmtInr, nowIso } from '@/lib/ula/workflow'
import type { Settings, SlaConfig, InstallationPartner, Warehouse, ItemMaster, BomTemplate } from '@/lib/ula/types'

const TABS = ['General & SLA', 'Areas', 'Installation Partners', 'Warehouses', 'Items & BOM', 'Data & Backup'] as const
type Tab = (typeof TABS)[number]

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('General & SLA')
  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Administration" title="Settings" description="Masters used across every module: rate card, SLA days per stage, districts, installation partners, warehouses and BOM templates." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'General & SLA' && <GeneralTab />}
      {tab === 'Areas' && <AreasTab />}
      {tab === 'Installation Partners' && <IpTab />}
      {tab === 'Warehouses' && <WarehouseTab />}
      {tab === 'Items & BOM' && <ItemsTab />}
      {tab === 'Data & Backup' && <DataTab />}
    </div>
  )
}

// ---------------- General ----------------

const SLA_FIELDS: { key: keyof SlaConfig; label: string; hint: string }[] = [
  { key: 'surveyDays', label: 'Feasibility report (days from D0)', hint: 'Tender: 5 (Corr-1 cl. 1.5)' },
  { key: 'commissionDaysAfterReport', label: 'Commissioning (days after report)', hint: 'Tender: 25' },
  { key: 'designTargetDay', label: 'Design approved by day', hint: 'Internal: D6' },
  { key: 'materialReadyTargetDay', label: 'Material Ready by day', hint: 'Internal: D7' },
  { key: 'installEndTargetDay', label: 'Installation complete by day', hint: 'Internal: D20' },
  { key: 'qcHours', label: 'QC review (hours after install)', hint: 'Internal: 24' },
  { key: 'portalUploadWorkingDays', label: 'Portal upload (working days after QC)', hint: 'Internal: 2' },
  { key: 'docketDays', label: 'Docket submission (days after lot commissioned)', hint: 'Internal: 3' },
  { key: 'cspdclInspectDays', label: 'CSPDCL inspection (working days)', hint: 'Annex G: 5' },
  { key: 'cspdclMeterDays', label: 'CSPDCL metering (working days)', hint: 'Annex G: 7' },
  { key: 'cspdclCommissionDays', label: 'CSPDCL commissioning (working days)', hint: 'Annex G: 2' },
  { key: 'ldPercentPerWeek', label: 'LD % of unfinished value per week', hint: 'Sec-4 cl. 8.1: 1' },
  { key: 'ldCapPercent', label: 'LD cap % of contract value', hint: 'Sec-4 cl. 8.1: 10' },
  { key: 'workOrderAcceptHours', label: 'Work order acceptance (hours)', hint: '24' },
  { key: 'vehicleReceiveHours', label: 'Vehicle receipt (hours)', hint: '48' },
  { key: 'paymentIdleDays', label: 'Payment file idle alert (days)', hint: '7' },
  { key: 'ticketCloseHours', label: 'Complaint closure (hours)', hint: '72' },
]

function GeneralTab() {
  const settings = useSettings()
  const user = useUserName()
  const [s, setS] = useState<Settings>(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => setS(settings), [settings])

  const save = async () => {
    if (s.rateCard.some((r) => !(r.kw > 0) || !(r.rate > 0))) {
      toast('Every rate card row needs kW and rate greater than 0.', 'error')
      return
    }
    if (new Set(s.rateCard.map((r) => r.kw)).size !== s.rateCard.length) {
      toast('Rate card has duplicate kW rows.', 'error')
      return
    }
    if (Object.values(s.sla).some((v) => !(Number(v) >= 0))) {
      toast('SLA values must be zero or more.', 'error')
      return
    }

    setSaving(true)
    try {
      const ok = await saveSettingsAsync(s)
      if (ok) {
        toast('Settings saved successfully to database!', 'success')
        logActivity(user, 'Settings', 'settings', 'General settings updated')
      } else {
        toast('Settings saved locally, but database sync returned an error.', 'error')
      }
    } catch (e: any) {
      toast(`Save error: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <FormSection title="L1 rate card (per site, excl. GST)" aside={<button type="button" className="outline-btn btn-sm" onClick={() => setS({ ...s, rateCard: [...s.rateCard, { kw: 0, rate: 0 }] })}><Plus className="w-3 h-3" /> Add slab</button>}>
        <div className="stack" style={{ gap: 8 }}>
          {s.rateCard.map((r, i) => (
            <div className="form-grid" key={i} style={{ gridTemplateColumns: '1fr 1fr auto', alignItems: 'end' }}>
              <NumberField label="System size (kW)" value={r.kw} onChange={(v) => setS({ ...s, rateCard: s.rateCard.map((x, j) => (j === i ? { ...x, kw: v } : x)) })} />
              <NumberField label="Rate (₹)" value={r.rate} hint={fmtInr(r.rate)} onChange={(v) => setS({ ...s, rateCard: s.rateCard.map((x, j) => (j === i ? { ...x, rate: v } : x)) })} />
              <button type="button" className="action-icon-btn danger" title="Remove" disabled={s.rateCard.length <= 1} onClick={() => setS({ ...s, rateCard: s.rateCard.filter((_, j) => j !== i) })}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <small className="muted">Sizes not in the card are prorated per kW from the nearest slab. Tender L1: 1 kW ₹50,370; 2 kW ₹88,670.</small>
        </div>
      </FormSection>

      <FormSection title="Stage SLAs and penalties">
        <div className="form-grid">
          {SLA_FIELDS.map((f) => (
            <NumberField key={f.key} label={f.label} hint={f.hint} min={0} value={s.sla[f.key]} onChange={(v) => setS({ ...s, sla: { ...s.sla, [f.key]: v } })} />
          ))}
        </div>
      </FormSection>

      <FormSection title="Performance thresholds and field rules">
        <div className="form-grid">
          <NumberField label="Minimum PR at commissioning (%)" hint="Sec-5 cl. 12.8: 75" value={s.minPrCommissioning} onChange={(v) => setS({ ...s, minPrCommissioning: v })} />
          <NumberField label="Minimum CUF during CMC (%)" hint="Sec-6 cl. 1.2: 19" value={s.minCufCmc} onChange={(v) => setS({ ...s, minCufCmc: v })} />
          <NumberField label="CMC share of contract (%)" hint="Sec-4 cl. 7.3: 20, paid over 20 quarters" value={s.cmcSharePercent} onChange={(v) => setS({ ...s, cmcSharePercent: v })} />
          <SelectField
            label="Field photo policy"
            value={s.photoPolicy}
            onChange={(v) => setS({ ...s, photoPolicy: (v || 'strict') as Settings['photoPolicy'] })}
            options={[
              { value: 'strict', label: 'Strict — live camera + GPS required' },
              { value: 'relaxed', label: 'Relaxed — allow older photos / no GPS (testing only)' },
            ]}
            hint="Sec-1 cl. 2.7: geotagged photos through the app camera"
          />
        </div>
      </FormSection>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="secondary-btn" onClick={() => confirmAction('Reset rate card, SLAs and thresholds to tender defaults?') && setS({ ...DEFAULT_SETTINGS, districts: s.districts, circles: s.circles, divisions: s.divisions })}>
          Reset to tender defaults
        </button>
        <button type="button" className="primary-btn" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving to Database...' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

// ---------------- Areas ----------------

function ListEditor({ title, values, onChange }: { title: string; values: string[]; onChange: (v: string[]) => void }) {
  const [v, setV] = useState('')
  const add = () => {
    const t = v.trim()
    if (!t) return
    if (values.some((x) => x.toLowerCase() === t.toLowerCase())) {
      toast(`${t} already exists`, 'error')
      return
    }
    onChange([...values, t].sort())
    setV('')
  }
  return (
    <FormSection title={`${title} (${values.length})`}>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="text-input" style={{ maxWidth: 260 }} value={v} placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}`} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button type="button" className="outline-btn btn-sm" onClick={add}>
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <div className="row">
        {values.length === 0 && <span className="muted" style={{ fontSize: 11 }}>None yet.</span>}
        {values.map((x) => (
          <span key={x} className="file-chip">
            {x}
            <button type="button" title="Remove" onClick={() => confirmAction(`Remove ${x}?`) && onChange(values.filter((y) => y !== x))}>
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </FormSection>
  )
}

function AreasTab() {
  const settings = useSettings()
  const user = useUserName()
  const [saving, setSaving] = useState(false)

  const update = async (patchS: Partial<Settings>) => {
    const next = { ...settings, ...patchS }
    setSaving(true)
    try {
      const ok = await saveSettingsAsync(next)
      if (ok) {
        toast('Area masters saved to database!', 'success')
        logActivity(user, 'Settings', 'areas', 'Area masters updated')
      } else {
        toast('Saved locally, but failed to persist to database.', 'error')
      }
    } catch (e: any) {
      toast(`Save error: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      {saving && <span className="muted" style={{ fontSize: 11 }}>Saving areas to database...</span>}
      <ListEditor title="Districts" values={settings.districts} onChange={(v) => update({ districts: v })} />
      <ListEditor title="Circles" values={settings.circles} onChange={(v) => update({ circles: v })} />
      <ListEditor title="Divisions" values={settings.divisions} onChange={(v) => update({ divisions: v })} />
    </div>
  )
}

// ---------------- Installation partners ----------------

function IpTab() {
  const ips = useIps()
  const bens = useBeneficiaries()
  const wos = useWorkOrders()
  const settings = useSettings()
  const user = useUserName()
  const [edit, setEdit] = useState<InstallationPartner | null>(null)
  const [saving, setSaving] = useState(false)

  const blank = (): InstallationPartner => ({ id: '', name: '', contactPerson: '', mobile: '', email: '', districts: [], ratePerKw: 0, active: true, createdAt: '' })

  const save = async (ip: InstallationPartner) => {
    if (!ip.name.trim()) return toast('IP name is required', 'error')
    if (!/^\d{10}$/.test(ip.mobile.replace(/\D/g, '').slice(-10))) return toast('Enter a 10-digit mobile number', 'error')
    if (ips.some((x) => x.id !== ip.id && x.name.trim().toLowerCase() === ip.name.trim().toLowerCase())) return toast('An IP with this name already exists', 'error')
    const saved = { ...ip, id: ip.id || newId('IP'), createdAt: ip.createdAt || nowIso() }

    setSaving(true)
    try {
      const ok = await upsertAsync('ips', saved)
      if (ok) {
        toast(`${saved.name} saved to database!`, 'success')
        logActivity(user, 'IP', saved.id, ip.id ? 'IP updated' : 'IP onboarded')
        setEdit(null)
      } else {
        toast(`${saved.name} saved locally, but database sync failed.`, 'error')
        setEdit(null)
      }
    } catch (e: any) {
      toast(`Save error: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const del = async (ip: InstallationPartner) => {
    const used = bens.some((b) => b.ipId === ip.id) || wos.some((w) => w.ipId === ip.id)
    if (used) return toast(`${ip.name} has work orders — mark it inactive instead of deleting.`, 'error')
    if (!confirmAction(`Delete ${ip.name}?`)) return

    try {
      const ok = await removeAsync('ips', ip.id)
      if (ok) {
        toast(`${ip.name} deleted from database!`, 'success')
        logActivity(user, 'IP', ip.id, 'IP deleted')
      } else {
        toast(`Deleted locally, but database delete failed.`, 'error')
      }
    } catch (e: any) {
      toast(`Delete failed: ${e?.message || 'Unknown error'}`, 'error')
    }
  }

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <strong style={{ fontSize: 13 }}>Installation partners ({ips.length})</strong>
        <button type="button" className="primary-btn" onClick={() => setEdit(blank())}>
          <Plus className="w-4 h-4" /> Onboard IP
        </button>
      </div>
      {ips.length === 0 ? (
        <EmptyBlock title="No installation partners" text="Work orders are issued to IPs. Add at least one before splitting a lot." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>IP</th>
                <th>Contact</th>
                <th>Districts</th>
                <th>Rate / kW</th>
                <th>Sites assigned</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ips.map((ip) => (
                <tr key={ip.id}>
                  <td className="strong-cell">{ip.name}</td>
                  <td>
                    {ip.contactPerson}
                    <br />
                    <small className="muted">
                      {ip.mobile} {ip.email}
                    </small>
                  </td>
                  <td>{ip.districts.join(', ') || '—'}</td>
                  <td>{ip.ratePerKw ? fmtInr(ip.ratePerKw) : <Chip tone="warn">Not set</Chip>}</td>
                  <td>{bens.filter((b) => b.ipId === ip.id).length}</td>
                  <td>{ip.active ? <Chip tone="good">Active</Chip> : <Chip>Inactive</Chip>}</td>
                  <td className="text-right">
                    <div className="row-actions">
                      <button type="button" className="action-icon-btn" onClick={() => setEdit(ip)} title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className="action-icon-btn danger" onClick={() => del(ip)} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Modal
          size="narrow"
          title={edit.id ? `Edit ${edit.name}` : 'Onboard installation partner'}
          onClose={() => setEdit(null)}
          onSubmit={() => save(edit)}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <TextField label="IP / firm name" required span2 value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
            <TextField label="Contact person" value={edit.contactPerson} onChange={(v) => setEdit({ ...edit, contactPerson: v })} />
            <TextField label="Mobile" required value={edit.mobile} onChange={(v) => setEdit({ ...edit, mobile: v })} />
            <TextField label="Email" type="email" value={edit.email} onChange={(v) => setEdit({ ...edit, email: v })} />
            <NumberField label="IP rate per kW (₹)" value={edit.ratePerKw} onChange={(v) => setEdit({ ...edit, ratePerKw: v })} hint="Open point: confirm IP rate card" />
          </div>
          <FormSection title="Districts served">
            {settings.districts.length === 0 ? (
              <span className="muted" style={{ fontSize: 11 }}>Add districts in the Areas tab first.</span>
            ) : (
              <div className="check-grid">
                {settings.districts.map((d) => (
                  <CheckField key={d} label={d} checked={edit.districts.includes(d)} onChange={(c) => setEdit({ ...edit, districts: c ? [...edit.districts, d] : edit.districts.filter((x) => x !== d) })} />
                ))}
              </div>
            )}
          </FormSection>
          <CheckField label="Active" checked={edit.active} onChange={(c) => setEdit({ ...edit, active: c })} />
        </Modal>
      )}
    </section>
  )
}

// ---------------- Warehouses ----------------

function WarehouseTab() {
  const whs = useWarehouses()
  const moves = useStockMoves()
  const dispatches = useDispatches()
  const settings = useSettings()
  const user = useUserName()
  const [edit, setEdit] = useState<Warehouse | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (w: Warehouse) => {
    if (!w.name.trim()) return toast('Warehouse name is required', 'error')
    if (w.kind === 'District' && !w.district.trim()) return toast('District store needs a district', 'error')
    const saved = { ...w, id: w.id || newId('WH') }

    setSaving(true)
    try {
      const ok = await upsertAsync('warehouses', saved)
      if (ok) {
        toast(`${saved.name} saved to database!`, 'success')
        logActivity(user, 'Warehouse', saved.id, w.id ? 'Warehouse updated' : 'Warehouse created')
        setEdit(null)
      } else {
        toast(`${saved.name} saved locally, but database sync failed.`, 'error')
        setEdit(null)
      }
    } catch (e: any) {
      toast(`Save error: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const del = async (w: Warehouse) => {
    if (moves.some((m) => m.warehouseId === w.id) || dispatches.some((d) => d.warehouseId === w.id)) return toast('This warehouse has stock movements and cannot be deleted.', 'error')
    if (!confirmAction(`Delete ${w.name}?`)) return

    try {
      const ok = await removeAsync('warehouses', w.id)
      if (ok) {
        toast('Warehouse deleted from database!', 'success')
      } else {
        toast('Deleted locally, but database delete failed.', 'error')
      }
    } catch (e: any) {
      toast(`Delete error: ${e?.message || 'Unknown error'}`, 'error')
    }
  }

  return (
    <section className="card table-card">
      <div className="toolbar-row">
        <div>
          <strong style={{ fontSize: 13 }}>Warehouses and district stores ({whs.length})</strong>
          <p className="muted" style={{ fontSize: 10, margin: '3px 0 0' }}>Sec-4 cl. 11(III): material is delivered to the district HQ store. Open point: central Raipur warehouse only, or district stores too.</p>
        </div>
        <button type="button" className="primary-btn" onClick={() => setEdit({ id: '', name: '', kind: 'Central', district: '', address: '' })}>
          <Plus className="w-4 h-4" /> Add warehouse
        </button>
      </div>
      {whs.length === 0 ? (
        <EmptyBlock title="No warehouses" text="Stock, GRN and dispatch need at least one warehouse." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>District</th>
                <th>Address</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {whs.map((w) => (
                <tr key={w.id}>
                  <td className="strong-cell">{w.name}</td>
                  <td>
                    <Chip tone={w.kind === 'Central' ? 'info' : undefined}>{w.kind}</Chip>
                  </td>
                  <td>{w.district || '—'}</td>
                  <td>{w.address || '—'}</td>
                  <td className="text-right">
                    <div className="row-actions">
                      <button type="button" className="action-icon-btn" onClick={() => setEdit(w)} title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className="action-icon-btn danger" onClick={() => del(w)} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Modal
          size="narrow"
          title={edit.id ? `Edit ${edit.name}` : 'Add warehouse'}
          onClose={() => setEdit(null)}
          onSubmit={() => save(edit)}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <TextField label="Name" required span2 value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
            <SelectField label="Type" value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: (v || 'Central') as Warehouse['kind'] })} options={['Central', 'District']} />
            {settings.districts.length ? (
              <SelectField label="District" required={edit.kind === 'District'} value={edit.district} onChange={(v) => setEdit({ ...edit, district: v })} options={settings.districts} />
            ) : (
              <TextField label="District" required={edit.kind === 'District'} value={edit.district} onChange={(v) => setEdit({ ...edit, district: v })} />
            )}
            <TextField label="Address" span2 value={edit.address} onChange={(v) => setEdit({ ...edit, address: v })} />
          </div>
        </Modal>
      )}
    </section>
  )
}

// ---------------- Items & BOM ----------------

type ItemRow = ItemMaster & { id: string }

// Standard rooftop kit item codes. Loaded only on request; quantities in templates must be confirmed by Engineering.
const SUGGESTED_ITEMS: ItemMaster[] = [
  { code: 'MOD-DCR', name: 'DCR solar PV module (ALMM List-I)', unit: 'Nos', category: 'Module', serialised: true },
  { code: 'INV-1KW', name: 'Grid-tie inverter 1 kW', unit: 'Nos', category: 'Inverter', serialised: true },
  { code: 'INV-2KW', name: 'Grid-tie inverter 2 kW', unit: 'Nos', category: 'Inverter', serialised: true },
  { code: 'STR-SET', name: 'Module mounting structure set', unit: 'Set', category: 'Structure', serialised: false },
  { code: 'ACDB', name: 'ACDB', unit: 'Nos', category: 'BOS', serialised: false },
  { code: 'DCDB', name: 'DCDB', unit: 'Nos', category: 'BOS', serialised: false },
  { code: 'EARTH-KIT', name: 'Earthing kit (3 pits)', unit: 'Set', category: 'BOS', serialised: false },
  { code: 'LA', name: 'Lightning arrester', unit: 'Nos', category: 'BOS', serialised: false },
  { code: 'DC-CABLE', name: 'DC cable', unit: 'm', category: 'BOS', serialised: false },
  { code: 'AC-CABLE', name: 'AC cable', unit: 'm', category: 'BOS', serialised: false },
  { code: 'LOGGER', name: 'Data logger with M2M SIM', unit: 'Nos', category: 'Logger', serialised: true },
]

function ItemsTab() {
  const items = useItems()
  const boms = useBomTemplates()
  const moves = useStockMoves()
  const settings = useSettings()
  const user = useUserName()
  const [editItem, setEditItem] = useState<ItemRow | null>(null)
  const [editBom, setEditBom] = useState<BomTemplate | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSuggested = async () => {
    const existing = new Set(items.map((i) => i.code))
    const add = SUGGESTED_ITEMS.filter((i) => !existing.has(i.code))
    if (!add.length) return toast('All standard items already exist', 'info')

    setSaving(true)
    try {
      const newItems = add.map((i) => ({ ...i, id: i.code }))
      upsertMany('items', newItems)
      const ok = await upsertManyRecords('items', newItems)
      if (ok) {
        toast(`${add.length} standard items added and saved to database!`, 'success')
        logActivity(user, 'Settings', 'items', `Loaded ${add.length} standard items`)
      } else {
        toast(`${add.length} standard items added locally, but database save failed.`, 'error')
      }
    } catch (e: any) {
      toast(`Error loading standard items: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveItem = async (i: ItemRow) => {
    const code = i.code.trim().toUpperCase()
    if (!code || !i.name.trim() || !i.unit.trim()) return toast('Code, name and unit are required', 'error')
    if (!i.id && items.some((x) => x.code === code)) return toast('Item code already exists', 'error')

    setSaving(true)
    try {
      const itemRecord = { ...i, code, id: code }
      const ok = await upsertAsync('items', itemRecord)
      if (ok) {
        toast(`${code} saved to database!`, 'success')
        setEditItem(null)
      } else {
        toast(`${code} saved locally, but database save failed.`, 'error')
        setEditItem(null)
      }
    } catch (e: any) {
      toast(`Save error: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const delItem = async (i: ItemRow) => {
    if (moves.some((m) => m.itemCode === i.code) || boms.some((b) => b.lines.some((l) => l.itemCode === i.code))) return toast('Item is used in stock or a BOM template', 'error')
    if (!confirmAction(`Delete ${i.code}?`)) return

    try {
      const ok = await removeAsync('items', i.code || i.id)
      if (ok) {
        toast(`${i.code} deleted from database!`, 'success')
      } else {
        toast(`Deleted locally, but database delete failed.`, 'error')
      }
    } catch (e: any) {
      toast(`Delete error: ${e?.message || 'Unknown error'}`, 'error')
    }
  }

  const saveBom = async (b: BomTemplate) => {
    if (!(b.kw > 0)) return toast('kW must be greater than 0', 'error')
    if (boms.some((x) => x.id !== b.id && x.kw === b.kw)) return toast(`A template for ${b.kw} kW already exists`, 'error')
    const lines = b.lines.filter((l) => l.itemCode && l.qty > 0)
    if (!lines.length) return toast('Add at least one item line with quantity', 'error')
    if (new Set(lines.map((l) => l.itemCode)).size !== lines.length) return toast('Each item can appear once per template', 'error')
    const saved = { ...b, lines, id: b.id || newId('BOM') }

    setSaving(true)
    try {
      const ok = await upsertAsync('bomTemplates', saved)
      if (ok) {
        toast(`BOM template for ${b.kw} kW saved to database!`, 'success')
        logActivity(user, 'Settings', saved.id, `BOM template ${b.kw} kW saved`)
        setEditBom(null)
      } else {
        toast(`BOM template saved locally, but database save failed.`, 'error')
        setEditBom(null)
      }
    } catch (e: any) {
      toast(`Save error: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const delBom = async (b: BomTemplate) => {
    if (!confirmAction(`Delete ${b.kw} kW template?`)) return
    try {
      const ok = await removeAsync('bomTemplates', b.id)
      if (ok) {
        toast('BOM template deleted from database!', 'success')
      } else {
        toast('Deleted locally, but database delete failed.', 'error')
      }
    } catch (e: any) {
      toast(`Delete error: ${e?.message || 'Unknown error'}`, 'error')
    }
  }

  const missingKw = settings.rateCard.map((r) => r.kw).filter((kw) => !boms.some((b) => b.kw === kw))

  return (
    <div className="stack">
      <section className="card table-card">
        <div className="toolbar-row">
          <strong style={{ fontSize: 13 }}>Item master ({items.length})</strong>
          <div className="row">
            <button type="button" className="outline-btn" onClick={loadSuggested}>
              <Wand2 className="w-4 h-4" /> Load standard rooftop items
            </button>
            <button type="button" className="primary-btn" onClick={() => setEditItem({ id: '', code: '', name: '', unit: 'Nos', category: 'BOS', serialised: false })}>
              <Plus className="w-4 h-4" /> Add item
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyBlock title="No items" text="Items are needed for BOM templates, POs and stock." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Serialised</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="strong-cell">{i.code}</td>
                    <td>{i.name}</td>
                    <td>{i.category}</td>
                    <td>{i.unit}</td>
                    <td>{i.serialised ? <Chip tone="info">Yes</Chip> : 'No'}</td>
                    <td className="text-right">
                      <div className="row-actions">
                        <button type="button" className="action-icon-btn" onClick={() => setEditItem(i)} title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className="action-icon-btn danger" onClick={() => delItem(i)} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card table-card">
        <div className="toolbar-row">
          <div>
            <strong style={{ fontSize: 13 }}>BOM templates per system size</strong>
            <p className="muted" style={{ fontSize: 10, margin: '3px 0 0' }}>The lot BOM is built from the 1 kW / 2 kW site counts × these templates.</p>
          </div>
          <button type="button" className="primary-btn" disabled={!items.length} onClick={() => setEditBom({ id: '', kw: missingKw[0] || 0, lines: [] })}>
            <Plus className="w-4 h-4" /> Add template
          </button>
        </div>
        {missingKw.length > 0 && (
          <div style={{ padding: '12px 18px 0' }}>
            <div className="gate-box">
              <strong>
                <AlertTriangle className="w-4 h-4" /> No BOM template for {missingKw.join(', ')} kW — material planning cannot compute those sites.
              </strong>
            </div>
          </div>
        )}
        {boms.length === 0 ? (
          <EmptyBlock title="No BOM templates" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>System size</th>
                  <th>Lines</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...boms]
                  .sort((a, b) => a.kw - b.kw)
                  .map((b) => (
                    <tr key={b.id}>
                      <td className="strong-cell">{b.kw} kW</td>
                      <td>{b.lines.map((l) => `${l.itemCode} × ${l.qty}`).join(' · ')}</td>
                      <td className="text-right">
                        <div className="row-actions">
                          <button type="button" className="action-icon-btn" onClick={() => setEditBom(b)} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" className="action-icon-btn danger" onClick={() => delBom(b)} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editItem && (
        <Modal
          size="narrow"
          title={editItem.id ? `Edit ${editItem.code}` : 'Add item'}
          onClose={() => setEditItem(null)}
          onSubmit={() => saveItem(editItem)}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setEditItem(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <TextField label="Item code" required value={editItem.code} disabled={!!editItem.id} onChange={(v) => setEditItem({ ...editItem, code: v })} />
            <SelectField label="Category" value={editItem.category} onChange={(v) => setEditItem({ ...editItem, category: (v || 'Other') as ItemMaster['category'] })} options={['Module', 'Inverter', 'Structure', 'BOS', 'Logger', 'Other']} />
            <TextField label="Name" required span2 value={editItem.name} onChange={(v) => setEditItem({ ...editItem, name: v })} />
            <TextField label="Unit" required value={editItem.unit} onChange={(v) => setEditItem({ ...editItem, unit: v })} />
            <CheckField label="Serial-numbered (scanned at dispatch)" checked={editItem.serialised} onChange={(c) => setEditItem({ ...editItem, serialised: c })} />
          </div>
        </Modal>
      )}

      {editBom && (
        <Modal
          title={editBom.id ? `Edit ${editBom.kw} kW template` : 'New BOM template'}
          onClose={() => setEditBom(null)}
          onSubmit={() => saveBom(editBom)}
          footer={
            <>
              <button type="button" className="secondary-btn" onClick={() => setEditBom(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                <Save className="w-4 h-4" /> Save template
              </button>
            </>
          }
        >
          <NumberField label="System size (kW)" required value={editBom.kw} onChange={(v) => setEditBom({ ...editBom, kw: v })} />
          <FormSection title="Items per site" aside={<button type="button" className="outline-btn btn-sm" onClick={() => setEditBom({ ...editBom, lines: [...editBom.lines, { itemCode: '', qty: 1 }] })}><Plus className="w-3 h-3" /> Add line</button>}>
            {editBom.lines.length === 0 && <span className="muted" style={{ fontSize: 11 }}>No lines yet.</span>}
            <div className="stack" style={{ gap: 8 }}>
              {editBom.lines.map((l, i) => (
                <div key={i} className="form-grid" style={{ gridTemplateColumns: '2fr 1fr auto', alignItems: 'end' }}>
                  <SelectField label="Item" value={l.itemCode} onChange={(v) => setEditBom({ ...editBom, lines: editBom.lines.map((x, j) => (j === i ? { ...x, itemCode: v } : x)) })} options={items.map((it) => ({ value: it.code, label: `${it.code} — ${it.name}` }))} />
                  <NumberField label="Qty per site" value={l.qty} min={0} onChange={(v) => setEditBom({ ...editBom, lines: editBom.lines.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} />
                  <button type="button" className="action-icon-btn danger" onClick={() => setEditBom({ ...editBom, lines: editBom.lines.filter((_, j) => j !== i) })} title="Remove line">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </FormSection>
        </Modal>
      )}
    </div>
  )
}

// ---------------- Data & backup ----------------

function DataTab() {
  const user = useUserName()
  const [kb, setKb] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [pulling, setPulling] = useState(false)
  useEffect(() => setKb(storageUsageKb()), [])

  const pushToSupabase = async () => {
    setSyncing(true)
    try {
      const res = await pushAllLocalDataToSupabase()
      if (res.success) {
        toast(`Supabase sync complete! ${res.details}`, 'success')
      } else {
        toast(`Sync completed with some warnings: ${res.details}`, 'error')
      }
    } catch (e: any) {
      toast(`Sync failed: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const pullFromSupabase = async () => {
    setPulling(true)
    try {
      await syncWithSupabase(true)
      toast('Latest data pulled from Supabase database successfully!', 'success')
      setKb(storageUsageKb())
    } catch (e: any) {
      toast(`Pull failed: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setPulling(false)
    }
  }

  const exportBackup = () => {
    const data = { exportedAt: nowIso(), exportedBy: user, ula: exportAllUlaData(), contracts: JSON.parse(localStorage.getItem('surya-setu-contracts') || '[]') }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `suryasetu-ula-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const importBackup = async (f?: File) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      if (!data || typeof data.ula !== 'object') throw new Error('Not a SuryaSetu backup file')
      if (!confirmAction('Restoring replaces all current ULA records in this browser with the backup. Continue?')) return
      clearAllUlaData()
      Object.entries(data.ula as Record<string, unknown>).forEach(([k, v]) => {
        if (k.startsWith('surya-setu-ula-')) writeKey(k.replace('surya-setu-ula-', ''), v)
      })
      if (Array.isArray(data.contracts)) localStorage.setItem('surya-setu-contracts', JSON.stringify(data.contracts))
      toast('Backup restored. Uploaded files are not part of the backup.', 'success')
      setKb(storageUsageKb())
    } catch (e) {
      toast(`Restore failed: ${(e as Error).message}`, 'error')
    }
  }

  const reset = async () => {
    if (!confirmAction('Delete ALL ULA execution data (lots, beneficiaries, work orders, purchase, dispatch, billing, CMC) and uploaded files from this browser? Contracts and user accounts are kept.')) return
    if (!confirmAction('This cannot be undone. Are you absolutely sure?')) return
    clearAllUlaData()
    await clearAllFiles()
    logActivity(user, 'Settings', 'data', 'All ULA data reset')
    toast('All ULA data removed', 'success')
    setKb(storageUsageKb())
  }

  return (
    <div className="stack">
      <NoteBanner>
        Software is connected to Supabase PostgreSQL Database and Cloud Storage (bucket: ula-files). Mutations automatically sync with the cloud database.
      </NoteBanner>
      <FormSection title="Supabase Database & Cloud Storage" icon={Database}>
        <p style={{ fontSize: 12 }}>
          Your system is configured to save all settings (rate card, SLAs, areas), installation partners, warehouses, items & BOM, lots, beneficiaries, work orders, purchase orders, dispatches, dockets, payments, CMC visits, and uploaded files to Supabase.
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="primary-btn"
            disabled={syncing || pulling}
            onClick={pushToSupabase}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            {syncing ? 'Pushing to Supabase...' : 'Push All Local Data to Supabase'}
          </button>
          <button
            type="button"
            className="outline-btn"
            disabled={syncing || pulling}
            onClick={pullFromSupabase}
          >
            {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {pulling ? 'Pulling from Supabase...' : 'Pull Latest from Supabase'}
          </button>
        </div>
      </FormSection>
      <FormSection title="Local Storage Cache" icon={Database}>
        <p style={{ fontSize: 12 }}>
          Local records currently use about <strong>{kb} KB</strong> of browser storage for instant offline previews. Photos and documents are uploaded to Supabase Storage.
        </p>
      </FormSection>
      <FormSection title="Backup and restore">
        <div className="row">
          <button type="button" className="outline-btn" onClick={exportBackup}>
            <Download className="w-4 h-4" /> Export backup (JSON)
          </button>
          <label className="outline-btn" style={{ position: 'relative' }}>
            <Upload className="w-4 h-4" /> Restore from backup
            <input type="file" accept=".json,application/json" style={{ position: 'absolute', inset: 0, opacity: 0 }} onChange={(e) => importBackup(e.target.files?.[0])} />
          </label>
        </div>
      </FormSection>
      <FormSection title="Danger zone">
        <button type="button" className="danger-btn" onClick={reset}>
          <Trash2 className="w-4 h-4" /> Reset all local ULA data
        </button>
      </FormSection>
    </div>
  )
}
