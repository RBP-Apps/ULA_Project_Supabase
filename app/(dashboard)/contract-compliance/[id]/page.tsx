'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Contract } from '@/lib/types'
import { getStoredContracts, saveStoredContract } from '@/lib/contracts-store'
import { ContractDetailView } from '@/components/contracts/ContractDetailView'
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ContractDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const all = getStoredContracts()
    const found = all.find((c) => c.id === id)
    if (found) {
      setContract(found)
    }
    setLoading(false)
  }, [id])

  const handleUpdate = (updated: Contract) => {
    saveStoredContract(updated)
    setContract(updated)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-teal-600" />
          <p className="text-sm font-medium">Loading contract details...</p>
        </div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="page-wrap">
        <div className="card p-12 text-center max-w-lg mx-auto">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">Contract Not Found</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            The contract with identifier <strong>{id}</strong> could not be located in the current database.
          </p>
          <Link href="/contract-compliance" className="primary-btn inline-flex">
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Contract List</span>
          </Link>
        </div>
      </div>
    )
  }

  return <ContractDetailView contract={contract} onUpdate={handleUpdate} />
}
