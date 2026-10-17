'use client'

import React, { useState } from 'react'
import { PageHeader, Tabs, MiniStat } from '../ui'
import { useDispatches, useBeneficiaries, useLots } from '@/lib/ula/data'
import { hoursSince, useSettings, stageOf } from '@/lib/ula/workflow'
import { PlanTab } from './PlanTab'
import { DispatchTab } from './DispatchTab'
import { ReceivingTab } from './ReceivingTab'

const TABS = ['Dispatch Plan', 'Dispatch', 'Receiving'] as const
type Tab = (typeof TABS)[number]

export function DispatchView() {
  const [tab, setTab] = useState<Tab>('Dispatch Plan')
  const dispatches = useDispatches()
  const bens = useBeneficiaries()
  const lots = useLots()
  const settings = useSettings()

  const readyLots = new Set(lots.filter((l) => l.materialReadyAt).map((l) => l.id))
  const awaiting = bens.filter((b) => stageOf(b) === 'Awaiting Dispatch' && !b.dispatchId && readyLots.has(b.lotId)).length
  const planned = dispatches.filter((d) => d.status === 'Planned').length
  const approved = dispatches.filter((d) => d.status === 'Approved').length
  const inTransit = dispatches.filter((d) => d.status === 'Dispatched')
  const late = inTransit.filter((d) => d.dispatchedAt && hoursSince(d.dispatchedAt) > settings.sla.vehicleReceiveHours).length

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Execution · Stages 5–7"
        title="Dispatch & Receiving"
        description="Site-wise dispatch plan by cluster and route (Project approves), challan / invoice / e-way bill per vehicle, serials scanned and locked to each beneficiary, IP receipt with shortage and damage photos."
      />
      <div className="mini-stats">
        <MiniStat label="Sites ready to plan" value={awaiting} hint="Design approved, Material Ready sent" onClick={() => setTab('Dispatch Plan')} />
        <MiniStat label="Plans awaiting approval" value={planned} tone={planned ? 'warn' : undefined} onClick={() => setTab('Dispatch Plan')} />
        <MiniStat label="Approved, to dispatch" value={approved} onClick={() => setTab('Dispatch')} />
        <MiniStat label="Vehicles in transit" value={inTransit.length} onClick={() => setTab('Receiving')} />
        <MiniStat label={`Not received in ${settings.sla.vehicleReceiveHours} h`} value={late} tone={late ? 'bad' : undefined} onClick={() => setTab('Receiving')} />
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ 'Dispatch Plan': planned, Dispatch: approved, Receiving: inTransit.length }} />
      {tab === 'Dispatch Plan' && <PlanTab />}
      {tab === 'Dispatch' && <DispatchTab />}
      {tab === 'Receiving' && <ReceivingTab />}
    </div>
  )
}
