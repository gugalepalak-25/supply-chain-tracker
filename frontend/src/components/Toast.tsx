import { useEffect, useState } from 'react'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

let toastId = 0

/**
 * Global toast notification system.
 * Call `showToast(message, type)` from anywhere to display a notification.
 */
const listeners = new Set<(toasts: Toast[]) => void>()
let toasts: Toast[] = []

function notify() {
  listeners.forEach((fn) => fn([...toasts]))
}

export function showToast(message: string, type: Toast['type'] = 'info') {
  const id = String(++toastId)
  toasts = [...toasts, { id, message, type }]
  notify()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    notify()
  }, 5000)
}

export function useToasts(): Toast[] {
  const [state, setState] = useState(toasts)
  useEffect(() => {
    listeners.add(setState)
    const unsub = () => { listeners.delete(setState) }
    return unsub
  }, [])
  return state
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

/**
 * Toast container component. Mount once at the app root.
 */
export function ToastContainer() {
  const toasts = useToasts()

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.message}</span>
          <button className="toast-dismiss" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
