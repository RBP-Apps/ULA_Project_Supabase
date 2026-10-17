'use client'

import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { LotDetail } from '@/components/ula/lots/LotDetail'
import { useLots } from '@/lib/ula/data'
import { useHydrated } from '@/lib/ula/storage'

export default function LotDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const lots = useLots()
  const hydrated = useHydrated()
  const lot = lots.find((l) => l.id === id)

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 className="w-7 h-7 animate-spin text-teal-600" />
      </div>
    )
  }
  if (!lot) {
    return (
      <div className="page-wrap">
        <div className="card p-12 text-center max-w-lg mx-auto">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">Lot not found</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">No lot with id {id} exists in this browser&apos;s storage.</p>
          <Link href="/lots" className="primary-btn inline-flex">
            <ArrowLeft className="w-4 h-4" /> Back to lot register
          </Link>
        </div>
      </div>
    )
  }
  return <LotDetail lot={lot} />
}
