/**
 * TypeScript global types for the renderer process.
 * window.ontology shape comes from electron/preload.ts (OntologyAPI).
 */
/// <reference types="vite/client" />

import type { OntologyAPI, AISettings, FileEntry, AppSettings, Theme } from '../electron/preload'

declare global {
  interface Window {
    ontology: OntologyAPI
  }
}

declare module '*?worker' {
  const workerConstructor: new () => Worker
  export default workerConstructor
}

export type { AISettings, FileEntry, AppSettings, Theme }
