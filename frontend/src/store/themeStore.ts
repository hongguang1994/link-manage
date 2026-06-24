import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
  } else {
    root.setAttribute('data-theme', mode)
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      setMode: (mode) => {
        set({ mode })
        applyTheme(mode)
      },
    }),
    { name: 'simnexus-theme' }
  )
)

// Call on app init to apply saved theme
export function initTheme() {
  const raw = localStorage.getItem('simnexus-theme')
  const mode: ThemeMode = raw ? (JSON.parse(raw).state?.mode ?? 'dark') : 'dark'
  applyTheme(mode)

  // Track system preference changes when in 'system' mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = JSON.parse(localStorage.getItem('simnexus-theme') || '{}').state?.mode
    if (current === 'system') applyTheme('system')
  })
}
