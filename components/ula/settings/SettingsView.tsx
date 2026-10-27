'use client'

import React, { useEffect, useState } from 'react'
import { Save, Plus, Pencil, Trash2, Download, Upload, AlertTriangle, Database, Wand2, CloudUpload } from 'lucide-react'
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
import { upsert, remove, newId, logActivity, clearAllUlaData, exportAllUlaData, storageUsageKb, writeKey, syncWithSupabase } from '@/lib/ula/storage'
import { clearAllFiles } from '@/lib/ula/files'
import { saveContract } from '@/lib/supabase/repository'
import { useSettings, saveSettings, DEFAULT_SETTINGS, fmtInr, nowIso } from '@/lib/ula/workflow'
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
  useEffect(() => setS(settings), [settings])

  const save = () => {
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
    if (reportSave(saveSettings(s), 'Settings saved')) logActivity(user, 'Settings', 'settings', 'General settings updated')
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
        <button type="button" className="primary-btn" onClick={save}>
          <Save className="w-4 h-4" /> Save settings
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
  const update = (patchS: Partial<Settings>) => {
    if (reportSave(saveSettings({ ...settings, ...patchS }), 'Saved')) logActivity(user, 'Settings', 'areas', 'Area masters updated')
  }
  return (
    <div className="stack">
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

  const blank = (): InstallationPartner => ({ id: '', name: '', contactPerson: '', mobile: '', email: '', districts: [], ratePerKw: 0, active: true, createdAt: '' })

  const save = (ip: InstallationPartner) => {
    if (!ip.name.trim()) return toast('IP name is required', 'error')
    if (!/^\d{10}$/.test(ip.mobile.replace(/\D/g, '').slice(-10))) return toast('Enter a 10-digit mobile number', 'error')
    if (ips.some((x) => x.id !== ip.id && x.name.trim().toLowerCase() === ip.name.trim().toLowerCase())) return toast('An IP with this name already exists', 'error')
    const saved = { ...ip, id: ip.id || newId('IP'), createdAt: ip.createdAt || nowIso() }
    if (reportSave(upsert('ips', saved), `${saved.name} saved`)) {
      logActivity(user, 'IP', saved.id, ip.id ? 'IP updated' : 'IP onboarded')
      setEdit(null)
    }
  }

  const del = (ip: InstallationPartner) => {
    const used = bens.some((b) => b.ipId === ip.id) || wos.some((w) => w.ipId === ip.id)
    if (used) return toast(`${ip.name} has work orders — mark it inactive instead of deleting.`, 'error')
    if (confirmAction(`Delete ${ip.name}?`) && reportSave(remove('ips', ip.id), 'Deleted')) logActivity(user, 'IP', ip.id, 'IP deleted')
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
              <button type="submit" className="primary-btn">
                <Save className="w-4 h-4" /> Save
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

  const save = (w: Warehouse) => {
    if (!w.name.trim()) return toast('Warehouse name is required', 'error')
    if (w.kind === 'District' && !w.district.trim()) return toast('District store needs a district', 'error')
    const saved = { ...w, id: w.id || newId('WH') }
    if (reportSave(upsert('warehouses', saved), `${saved.name} saved`)) {
      logActivity(user, 'Warehouse', saved.id, w.id ? 'Warehouse updated' : 'Warehouse created')
      setEdit(null)
    }
  }
  const del = (w: Warehouse) => {
    if (moves.some((m) => m.warehouseId === w.id) || dispatches.some((d) => d.warehouseId === w.id)) return toast('This warehouse has stock movements and cannot be deleted.', 'error')
    if (confirmAction(`Delete ${w.name}?`)) reportSave(remove('warehouses', w.id), 'Deleted')
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
              <button type="submit" className="primary-btn">
                <Save className="w-4 h-4" /> Save
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

  const loadSuggested = () => {
    const existing = new Set(items.map((i) => i.code))
    const add = SUGGESTED_ITEMS.filter((i) => !existing.has(i.code))
    if (!add.length) return toast('All standard items already exist', 'info')
    let ok = true
    add.forEach((i) => (ok = ok && upsert('items', { ...i, id: i.code })))
    if (reportSave(ok, `${add.length} standard items added — review names and units`)) logActivity(user, 'Settings', 'items', `Loaded ${add.length} standard items`)
  }

  const saveItem = (i: ItemRow) => {
    const code = i.code.trim().toUpperCase()
    if (!code || !i.name.trim() || !i.unit.trim()) return toast('Code, name and unit are required', 'error')
    if (!i.id && items.some((x) => x.code === code)) return toast('Item code already exists', 'error')
    if (reportSave(upsert('items', { ...i, code, id: code }), `${code} saved`)) setEditItem(null)
  }
  const delItem = (i: ItemRow) => {
    if (moves.some((m) => m.itemCode === i.code) || boms.some((b) => b.lines.some((l) => l.itemCode === i.code))) return toast('Item is used in stock or a BOM template', 'error')
    if (confirmAction(`Delete ${i.code}?`)) reportSave(remove('items', i.id), 'Deleted')
  }
  const saveBom = (b: BomTemplate) => {
    if (!(b.kw > 0)) return toast('kW must be greater than 0', 'error')
    if (boms.some((x) => x.id !== b.id && x.kw === b.kw)) return toast(`A template for ${b.kw} kW already exists`, 'error')
    const lines = b.lines.filter((l) => l.itemCode && l.qty > 0)
    if (!lines.length) return toast('Add at least one item line with quantity', 'error')
    if (new Set(lines.map((l) => l.itemCode)).size !== lines.length) return toast('Each item can appear once per template', 'error')
    const saved = { ...b, lines, id: b.id || newId('BOM') }
    if (reportSave(upsert('bomTemplates', saved), `BOM template for ${b.kw} kW saved`)) {
      logActivity(user, 'Settings', saved.id, `BOM template ${b.kw} kW saved`)
      setEditBom(null)
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
                          <button type="button" className="action-icon-btn danger" onClick={() => confirmAction(`Delete ${b.kw} kW template?`) && reportSave(remove('bomTemplates', b.id), 'Deleted')} title="Delete">
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
              <button type="submit" className="primary-btn">
                <Save className="w-4 h-4" /> Save
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
  useEffect(() => setKb(storageUsageKb()), [])

  const pushToSupabase = async () => {
    setSyncing(true)
    try {
      await syncWithSupabase()
      const contracts = JSON.parse(localStorage.getItem('surya-setu-contracts') || '[]')
      for (const c of contracts) {
        await saveContract(c)
      }
      toast('Supabase sync complete! All records are synchronized with database.', 'success')
    } catch (e: any) {
      toast(`Sync failed: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setSyncing(false)
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
          Your system is configured to save all lots, beneficiaries, work orders, purchase orders, dispatches, dockets, payments, CMC visits, and uploaded files to Supabase.
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="primary-btn"
            disabled={syncing}
            onClick={pushToSupabase}
          >
            <CloudUpload className="w-4 h-4" />
            {syncing ? 'Synchronizing with Supabase...' : 'Synchronize Local Data to Supabase'}
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
