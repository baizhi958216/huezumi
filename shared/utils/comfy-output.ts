import type { ComfyOutput } from '../types/workflow'

const media = /\.(?:png|jpe?g|webp|gif|mp4|webm|mov)$/i
/** Generic history UI outputs: no node class names or provider implementation here. */
export function comfyOutputs(outputs: Record<string, unknown>): ComfyOutput[] {
  const result: ComfyOutput[] = []
  for (const [nodeId, output] of Object.entries(outputs)) {
    if (!output || typeof output !== 'object')
      continue
    for (const [key, values] of Object.entries(output)) {
      if (!Array.isArray(values))
        continue
      for (const value of values) {
        if (key === 'text' && typeof value === 'string') {
          result.push({ nodeId, kind: 'text', text: value.slice(0, 200000) })
        }
        else if (value && typeof value === 'object' && typeof value.filename === 'string' && value.type === 'output' && media.test(value.filename)) {
          const filename = value.filename as string
          const subfolder: string = typeof value.subfolder === 'string' ? value.subfolder : ''
          if (filename.includes('/') || filename.includes('\\') || subfolder.split(/[\\/]/).includes('..') || subfolder.startsWith('/'))
            throw new Error('Invalid ComfyUI output path')
          result.push({ nodeId, kind: /\.(?:mp4|webm|mov)$/i.test(filename) ? 'video' : 'image', filename, subfolder, type: 'output' })
        }
        if (result.length > 200)
          throw new Error('Too many workflow outputs')
      }
    }
  }
  return result.filter((item, index) => result.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index)
}
