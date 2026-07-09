import type { SpiritusAPI, AISettings, FileEntry, AppSettings, Theme } from '../electron/preload'

declare global {
  interface Window {
    spiritus: SpiritusAPI
  }
}

export type { AISettings, FileEntry, AppSettings, Theme }
