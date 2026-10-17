'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'

export default function RootPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
    }
  }, [isAuthenticated, isLoading, router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#f4f7f9]">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        <p className="text-sm font-medium">Entering SuryaSetu Control Room...</p>
      </div>
    </div>
  )
}
