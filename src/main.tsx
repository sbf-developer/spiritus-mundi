/**
 * React entry point.
 *
 * Boot order: Monaco setup → theme → mount App.
 * All UI lives under App.tsx; state in store/ideStore.ts.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import './monacoSetup'
import App from './App'
import { applyTheme } from './lib/theme'
import './index.css'

applyTheme('dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
