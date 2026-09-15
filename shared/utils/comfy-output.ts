import type { ComfyHistoryEntry, ComfyOutputFile } from '../types/comfyui'

/** ComfyUI may register the same video in both a generator and a preview node. */
export function collectOutputFiles(entry?: ComfyHistoryEntry): ComfyOutputFile[] {
  const files: ComfyOutputFile[] = []
  const seen = new Set<string>()
  for (const group of Object.values(entry?.outputs ?? {})) {
    for (const value of Object.values(group ?? {})) {
      if (!Array.isArray(value))
        continue
      for (const item of value) {
        if (item && typeof item === 'object' && 'filename' in item) {
          const filename = String(item.filename)
          const subfolder = String(item.subfolder ?? '')
          const type = String(item.type ?? 'output')
          const key = `${type}\0${subfolder}\0${filename}`
          if (seen.has(key))
            continue
          seen.add(key)
          files.push({
            filename,
            subfolder,
            type,
            format: item.format ? String(item.format) : undefined,
          })
        }
      }
    }
  }
  return files
}
