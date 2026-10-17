'use client'

import React, { useMemo, useState } from 'react'
import { Plus, Save, Boxes } from 'lucide-react'
import { Modal, NumberField, DateField, SelectField, TextArea, EmptyBlock, Chip, usePaged, Pager, reportSave, toast, useUserName } from '../ui'
import { useStockMoves, useItems, useWarehouses } from '@/lib/ula/data'
import { upsert, newId, logActivity } from '@/lib/ula/storage'
import { today, fmtDate, downloadCsv } from '@/lib/ula/workflow'
import type { StockMove } from '@/lib/ula/types'
import { balanceByItemWarehouse, stockBalance } from './stock'

export function StockTab() {
  const moves = useStockMoves()
  const items = useItems()
  const whs = useWarehouses()
  const [adjust, setAdjust] = useState(false)
  const [itemF, setItemF] = useState('')
  const [whF, setWhF] = useState('')
  const [typeF, setTypeF] = useState('')

  const bal = useMemo(() => balanceByItemWarehouse(moves), [moves])
  const ledger = useMemo(
    () => [...moves].filter((m) => (!itemF || m.itemCode === itemF) && (!whF || m.warehouseId === whF) && (!typeF || m.refType === typeF)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [moves, itemF, whF, typeF]
  )
  const paged = usePaged(ledger, 25)
  const whName = (id: string) => whs.find((w) => w.id === id)?.name || id

  if (!items.length || !whs.length)
    return <EmptyBlock icon={Boxes} title="Masters missing" text="Stock needs at least one item and one warehouse. Add them in Settings." />

  return (
    <div className="stack">
      <section className="card table-card">
        <div className="toolbar-row">
          <strong style={{ fontSize: 13 }}>Stock balance by warehouse</strong>
          <div className="row">
            <button
              type="button"
              className="outline-btn"
              onClick={() =>
                downloadCsv('stock-balance.csv', [
                  ['Item', 'Name', ...whs.map((w) => w.name), 'Total'],
                  ...items.map((i) => [i.code, i.name, ...whs.map((w) => bal.get(`${i.code}|${w.id}`) || 0), stockBalance(moves, i.code)]),
                ])
              }
            >
              Export
            </button>
            <button type="button" className="primary-btn" onClick={() => setAdjust(true)}>
              <Plus className="w-4 h-4" /> Opening stock / adjustment
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                {whs.map((w) => (
                  <th key={w.id}>
                    {w.name}
                    <br />
                    <small>{w.kind}</small>
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const total = stockBalance(moves, i.code)
                return (
                  <tr key={i.code}>
                    <td>
                      <div className="cell-title">
                        <strong>{i.code}</strong>
                        <small>
                          {i.name} ({i.unit})
                        </small>
                      </div>
                    </td>
                    {whs.map((w) => (
                      <td key={w.id}>{bal.get(`${i.code}|${w.id}`) || 0}</td>
                    ))}
                    <td>{total > 0 ? <strong>{total}</strong> : <Chip tone={total < 0 ? 'bad' : undefined}>{total}</Chip>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card table-card">
        <div className="toolbar-row">
          <strong style={{ fontSize: 13 }}>Movement ledger</strong>
          <div className="row">
            <select className="filter-select" value={itemF} onChange={(e) => setItemF(e.target.value)} aria-label="Item">
              <option value="">All items</option>
              {items.map((i) => (
                <option key={i.code}>{i.code}</option>
              ))}
            </select>
            <select className="filter-select" value={whF} onChange={(e) => setWhF(e.target.value)} aria-label="Warehouse">
              <option value="">All warehouses</option>
              {whs.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select className="filter-select" value={typeF} onChange={(e) => setTypeF(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              {['Opening', 'GRN', 'Dispatch', 'Adjustment'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        {ledger.length === 0 ? (
          <EmptyBlock title="No stock movements" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Warehouse</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtDate(m.date)}</td>
                      <td>{m.itemCode}</td>
                      <td>{whName(m.warehouseId)}</td>
                      <td>
                        <Chip tone={m.refType === 'GRN' || m.refType === 'Opening' ? 'good' : m.refType === 'Dispatch' ? 'info' : 'warn'}>{m.refType}</Chip>
                      </td>
                      <td style={{ color: m.qty < 0 ? '#c2484d' : '#138f81', fontWeight: 700 }}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                      <td>{m.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...paged} />
          </>
        )}
      </section>
      {adjust && <AdjustModal onClose={() => setAdjust(false)} />}
    </div>
  )
}

function AdjustModal({ onClose }: { onClose: () => void }) {
  const moves = useStockMoves()
  const items = useItems()
  const whs = useWarehouses()
  const user = useUserName()
  const [m, setM] = useState({ type: 'Opening' as 'Opening' | 'Adjustment', itemCode: '', warehouseId: whs.length === 1 ? whs[0].id : '', qty: 0, date: today(), reason: '' })
  const current = m.itemCode && m.warehouseId ? stockBalance(moves, m.itemCode, m.warehouseId) : 0

  const save = () => {
    if (!m.itemCode || !m.warehouseId) return toast('Item and warehouse are required', 'error')
    if (!m.qty) return toast('Quantity cannot be zero', 'error')
    if (m.type === 'Opening' && m.qty < 0) return toast('Opening stock must be positive', 'error')
    if (!m.reason.trim()) return toast('Give a reason', 'error')
    if (current + m.qty < 0) return toast(`Balance would become negative (current ${current})`, 'error')
    const rec: StockMove = { id: newId('SM'), date: m.date, itemCode: m.itemCode, warehouseId: m.warehouseId, qty: m.qty, refType: m.type, refId: '', remarks: m.reason.trim() }
    if (reportSave(upsert('stockMoves', rec), `${m.type} of ${m.qty} ${m.itemCode} recorded`)) {
      logActivity(user, 'Stock', rec.id, `${m.type} ${m.qty} ${m.itemCode}: ${m.reason}`)
      onClose()
    }
  }

  return (
    <Modal
      size="narrow"
      title="Opening stock / adjustment"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            <Save className="w-4 h-4" /> Record
          </button>
        </>
      }
    >
      <div className="form-grid">
        <SelectField label="Type" required value={m.type} onChange={(v) => setM({ ...m, type: (v || 'Opening') as typeof m.type })} options={['Opening', 'Adjustment']} />
        <DateField label="Date" required value={m.date} onChange={(v) => setM({ ...m, date: v })} />
        <SelectField label="Item" required value={m.itemCode} onChange={(v) => setM({ ...m, itemCode: v })} options={items.map((i) => ({ value: i.code, label: `${i.code} — ${i.name}` }))} />
        <SelectField label="Warehouse" required value={m.warehouseId} onChange={(v) => setM({ ...m, warehouseId: v })} options={whs.map((w) => ({ value: w.id, label: w.name }))} />
        <NumberField label="Quantity" required value={m.qty} onChange={(v) => setM({ ...m, qty: v })} hint={m.type === 'Adjustment' ? `Use a negative number to reduce. Current: ${current}` : `Current: ${current}`} />
        <TextArea label="Reason" required span2 value={m.reason} onChange={(v) => setM({ ...m, reason: v })} rows={2} />
      </div>
    </Modal>
  )
}
