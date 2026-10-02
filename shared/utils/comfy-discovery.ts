import type { ComfyCatalog, ComfyInstalledNode, ComfyNodeDefinition } from '../types/workflow'
import { isCredentialInput } from './workflow'

/** Scan every installed node, including dynamic branches, without exposing field values. */
export function discoverComfyNodes(catalog: ComfyCatalog): ComfyInstalledNode[] {
  return Object.entries(catalog).map(([name, node]) => {
    const assets = new Set<string>()
    const credentials = new Set<string>()
    const visit = (groups: ComfyNodeDefinition['input'], prefix = '', depth = 0) => {
      if (depth > 8)
        return
      for (const spec of [groups.required, groups.optional]) {
        for (const [field, input] of Object.entries(spec || {})) {
          const path = `${prefix}${field}`
          if (input[1]?.image_upload || input[1]?.video_upload)
            assets.add(path)
          if (isCredentialInput(path))
            credentials.add(path)
          if (input[0] === 'COMFY_DYNAMICCOMBO_V3') {
            for (const option of input[1]?.options || []) {
              if (typeof option === 'object')
                visit(option.inputs, `${path}.`, depth + 1)
            }
          }
        }
      }
    }
    visit(node.input)
    return { name, displayName: node.display_name || name, category: node.category || '其他', assetInputs: [...assets], credentialInputs: [...credentials] }
  }).sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName))
}
