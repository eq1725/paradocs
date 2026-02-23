'use client'

import React, { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS = {
  success: 'border-green-500/30 bg-green-500/10 text-green-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  info: 'border-primary-500/30 bg-primary-500/10 text-primary-300',
}

const ICON_COLORS = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-primary-400',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false)
  const Icon = ICONS[toast.type]

  useEffect(() => {
    const duration = toast.duration || 3000
    const exitTimer = setTimeout(() => setExiting(true), duration - 300)
    const removeTimer = setTimeout(() => onDismiss(toast.id), duration)
    return () => {
      clearTimeout(exitTimer)
      clearTimeout(removeTimer)
    }
  }, [toast, onDismiss])

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg transition-all duration-300 ${COLORS[toast.type]} ${
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${ICON_COLORS[toast.type]}`} />
      <span className="text-sm font-medium flex-1">{toast.message}</span>
      <button
        onClick={() => {
          setExiting(true)
          setTimeout(() => onDismiss(toast.id), 300)
        }}
        className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
      >
        <X className="w-3.5 h-3.5 opacity-60" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((prev) => [...prev.slice(-4), { id, type, message, duration }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container - bottom right on desktop, top center on mobile */}
      <div className="fixed z-[100] pointer-events-none inset-x-0 bottom-20 md:bottom-auto md:top-20 md:right-4 md:left-auto flex flex-col items-center md:items-end gap-2 px-4 md:px-0">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto w-full max-w-sm">
            <ToastItem toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
