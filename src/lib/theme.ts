import type { Theme } from '../vite-env.d'

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  window.ontology?.window?.setTheme(theme)
}

export function getMonacoTheme(theme: Theme) {
  return theme === 'dark' ? 'vs-dark' : 'vs'
}

export function getTerminalTheme(theme: Theme) {
  if (theme === 'dark') {
    return {
      background: '#181818',
      foreground: '#e4e4e4',
      cursor: '#e4e4e4',
      selectionBackground: 'rgba(255, 255, 255, 0.15)',
      black: '#181818',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#e4e4e4',
      brightBlack: '#5a5a5a',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    }
  }
  return {
    background: '#ffffff',
    foreground: '#1a1a1a',
    cursor: '#1a1a1a',
    selectionBackground: 'rgba(0, 0, 0, 0.12)',
    black: '#1a1a1a',
    red: '#c62828',
    green: '#2e7d32',
    yellow: '#f9a825',
    blue: '#1565c0',
    magenta: '#6a1b9a',
    cyan: '#00838f',
    white: '#1a1a1a',
    brightBlack: '#999999',
    brightRed: '#c62828',
    brightGreen: '#2e7d32',
    brightYellow: '#f9a825',
    brightBlue: '#1565c0',
    brightMagenta: '#6a1b9a',
    brightCyan: '#00838f',
    brightWhite: '#000000',
  }
}
