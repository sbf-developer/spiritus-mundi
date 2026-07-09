import { detectLanguage } from '../store/ideStore'
import type { OpenTab } from '../store/ideStore'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'])

export function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.has(ext)
}

export async function openFileAsTab(entry: { path: string; name: string }): Promise<OpenTab | null> {
  if (isImageFile(entry.name)) {
    const result = await window.spiritus.readFileBase64(entry.path)
    if (!result.success || !result.dataUrl) return null
    return {
      path: entry.path,
      name: entry.name,
      content: '',
      isDirty: false,
      language: 'plaintext',
      viewMode: 'image',
      previewDataUrl: result.dataUrl,
    }
  }

  const result = await window.spiritus.readFile(entry.path)
  if (!result.success) return null

  return {
    path: entry.path,
    name: entry.name,
    content: result.content,
    isDirty: false,
    language: detectLanguage(entry.name),
    viewMode: 'code',
  }
}
