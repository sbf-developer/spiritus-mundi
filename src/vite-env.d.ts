/// <reference types="vite/client" />

import type { SpiritusAPI, AISettings, FileEntry, AppSettings, Theme } from '../electron/preload'

declare global {
  interface Window {
    spiritus: SpiritusAPI
  }
}

declare module '*?worker' {
  const workerConstructor: new () => Worker
  export default workerConstructor
}

export type { AISettings, FileEntry, AppSettings, Theme }
