import { useEffect } from 'react'
import { useIDEStore } from '../store/ideStore'
import type { Theme } from '../vite-env.d'

export function useTheme() {
  const { theme, setTheme } = useIDEStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    persistTheme(next)
  }

  return { theme, setTheme: (t: Theme) => { setTheme(t); persistTheme(t) }, toggleTheme }
}

async function persistTheme(theme: Theme) {
  const saved = await window.spiritus.settings.get()
  await window.spiritus.settings.save({
    ai: saved?.ai ?? useIDEStore.getState().settings,
    theme,
  })
}

export function loadSavedTheme() {
  window.spiritus.settings.get().then((saved) => {
    if (saved?.theme) useIDEStore.getState().setTheme(saved.theme)
    if (saved?.ai) useIDEStore.getState().setSettings(saved.ai)
  })
}
