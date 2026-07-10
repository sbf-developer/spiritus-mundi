import { useIDEStore } from '../store/ideStore'
import type { Theme } from '../vite-env.d'

export function useTheme() {
  const theme = useIDEStore((s) => s.theme)
  const setTheme = useIDEStore((s) => s.setTheme)

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    persistTheme(next)
  }

  const setThemePersisted = (t: Theme) => {
    setTheme(t)
    persistTheme(t)
  }

  return { theme, setTheme: setThemePersisted, toggleTheme }
}

async function persistTheme(theme: Theme) {
  const saved = await window.ontology.settings.get()
  await window.ontology.settings.save({
    ai: saved?.ai ?? useIDEStore.getState().settings,
    theme,
  })
}

export function loadSavedTheme() {
  window.ontology.settings.get().then((saved) => {
    if (saved?.ai) useIDEStore.getState().setSettings(saved.ai)
    if (saved?.theme) useIDEStore.getState().setTheme(saved.theme)
  })
}
