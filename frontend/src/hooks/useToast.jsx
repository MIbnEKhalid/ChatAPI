import { useState, useCallback, useRef } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const showToast = useCallback((message, type = 'info') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  const ToastContainer = () => (
    <div id="toast-container">
      {toasts.map(t => {
        const icon = t.type === 'error' ? 'fa-exclamation-triangle'
          : t.type === 'success' ? 'fa-check-circle'
          : 'fa-info-circle'
        return (
          <div key={t.id} className={`toast ${t.type}`}>
            <i className={`fas ${icon}`}></i>
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )

  return { showToast, ToastContainer }
}
