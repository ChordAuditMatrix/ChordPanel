import { LosslessNumber, stringify as stringifyLossless } from 'lossless-json'

const losslessNumberStringifiers = [{
  test: (value: unknown) => value instanceof LosslessNumber,
  stringify: (value: unknown) => (value as LosslessNumber).toString(),
}]

/** JSON text for evidence display and local download; numeric literals keep their digits. */
export function exactJsonText(value: unknown): string {
  try {
    return stringifyLossless(value, undefined, 2, losslessNumberStringifiers) ?? ''
  } catch {
    return String(value)
  }
}

export function fileSizeLabel(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    return false
  }
  return false
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
