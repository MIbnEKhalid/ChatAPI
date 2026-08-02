import { useCallback } from 'react'

/**
 * Wraps fetch with automatic 401 → login redirect.
 * Returns the raw Response (caller parses).
 */
export function useApi() {
  const apiFetch = useCallback(async (url, options = {}) => {
    const res = await fetch(url, options)
    if (res.status === 401) {
      const currentPath = window.location.pathname + window.location.search
      window.location.href = `/mbkauthe/login?redirect=${encodeURIComponent(currentPath)}`
      throw new Error('Unauthorized — redirecting to login')
    }
    return res
  }, [])

  return { apiFetch }
}
