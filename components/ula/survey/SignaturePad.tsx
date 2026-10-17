'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Eraser, Save, Loader2 } from 'lucide-react'
import { saveFile } from '@/lib/ula/files'
import { toast } from '../ui'
import type { FileRef } from '@/lib/ula/types'

/** Finger / mouse signature captured on a canvas and stored as a PNG in IndexedDB. */
export function SignaturePad({ onSaved }: { onSaved: (f: FileRef) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = 140 * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#12323e'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: React.PointerEvent) => {
    drawing.current = true
    ref.current!.setPointerCapture(e.pointerId)
    const ctx = ref.current!.getContext('2d')!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = ref.current!.getContext('2d')!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setDirty(true)
  }
  const up = () => {
    drawing.current = false
  }
  const clear = () => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.restore()
    setDirty(false)
  }
  const save = () => {
    if (!dirty) return toast('Ask the consumer to sign in the box first', 'error')
    setBusy(true)
    ref.current!.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error('Could not read the signature')
        const file = new File([blob], `signature-${Date.now()}.png`, { type: 'image/png' })
        const f = await saveFile(file, { accept: ['image/'], capturedVia: 'camera' })
        onSaved(f)
        clear()
        toast('Signature saved', 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setBusy(false)
      }
    }, 'image/png')
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: 140, border: '1px dashed #c0d3d8', borderRadius: 8, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        aria-label="Signature pad"
      />
      <div className="row">
        <button type="button" className="outline-btn btn-sm" onClick={clear}>
          <Eraser className="w-3 h-3" /> Clear
        </button>
        <button type="button" className="primary-btn btn-sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save signature
        </button>
      </div>
    </div>
  )
}
