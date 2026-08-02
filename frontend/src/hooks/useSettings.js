import { useState, useEffect, useCallback } from 'react'

const DEFAULT_SETTINGS = {
  model: 'deepseek/deepseek-v4-flash',
  temperature: 0.7,
  colorScheme: 'light',
  fontSize: 14,
  matrixEnabled: true,
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('mbk_chat_settings')
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  useEffect(() => {
    localStorage.setItem('mbk_chat_settings', JSON.stringify(settings))
  }, [settings])

  const updateSettings = useCallback((newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }, [])

  return { settings, updateSettings }
}
