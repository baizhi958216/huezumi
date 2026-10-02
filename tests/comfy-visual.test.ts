import type { ComfyCatalog } from '../shared/types/workflow'
import { describe, expect, it } from 'vitest'
import { previewVisualWorkflow, workflowNodeCount } from '../shared/utils/comfy-visual'
import { workflowPolicySchema } from '../shared/utils/workflow'

const catalog: ComfyCatalog = {
  Source: { input: { required: { prompt: ['STRING'] } }, output: ['MODEL'] },
  Sampler: { input: { required: { model: ['MODEL'], seed: ['INT', { control_after_generate: true }], steps: ['INT'], cfg: ['FLOAT'] } }, input_order: { required: ['model', 'seed', 'steps', 'cfg'] }, output: ['IMAGE'] },
}
const visual = {
  nodes: [
    { id: 1, type: 'Source', pos: [30, 50], widgets_values: ['hello'], outputs: [{ name: 'MODEL', type: 'MODEL' }] },
    { id: 2, type: 'Sampler', pos: [440, 60], widgets_values: [42, 'randomize', 20, 7.5], inputs: [{ name: 'model', type: 'MODEL', link: 1 }] },
  ],
  links: [[1, 1, 0, 2, 0, 'MODEL']],
}
describe('official canvas loading', () => {
  it('restores positions and connections while skipping seed control widgets', () => {
    const result = previewVisualWorkflow(visual, catalog)
    expect(result.issues).toEqual([])
    expect(result.graph['2']!.inputs).toEqual({ model: ['1', 0], seed: 42, steps: 20, cfg: 7.5 })
    expect(result.layout.positions['2']).toEqual({ x: 440, y: 60 })
    expect(workflowNodeCount(visual)).toBe(2)
    expect(workflowNodeCount(result.graph)).toBe(2)
  })
  it('preserves unavailable nodes and ports, reports incomplete parameters, and leaves the original untouched', () => {
    const original = structuredClone(visual)
    const result = previewVisualWorkflow(visual, {})
    expect(Object.keys(result.graph)).toHaveLength(2)
    expect(result.graph['2']!.inputs.model).toEqual(['1', 0])
    expect(result.ports['1']!.output).toEqual(['MODEL'])
    expect(result.issues).toHaveLength(2)
    expect(visual).toEqual(original)
  })
  it('reports ambiguous widgets and bypass modes rather than silently accepting partial conversion', () => {
    const changed = structuredClone(visual)
    changed.nodes[1]!.widgets_values.push('extension state')
    expect(previewVisualWorkflow(changed, catalog).issues.join()).toContain('控件数量')
    expect(previewVisualWorkflow({ ...visual, nodes: [{ ...visual.nodes[0], mode: 4 }] }, catalog).issues.join()).toContain('旁路')
  })
  it('rejects malformed positions and duplicate ids without returning a partial graph', () => {
    expect(() => previewVisualWorkflow({ ...visual, nodes: [{ ...visual.nodes[0], pos: ['bad', 0] }] }, catalog)).toThrow()
    expect(() => previewVisualWorkflow({ ...visual, nodes: [visual.nodes[0], visual.nodes[0]] }, catalog)).toThrow('编号重复')
  })
  it('does not expose backend defaults, credentials or shared asset filenames', () => {
    const raw: ComfyCatalog = { Load: { input: { required: { api_key: ['STRING', { default: 'server-key' }], image: [['private.png'], { image_upload: true }], endpoint: ['STRING'] } }, output: ['IMAGE'] } }
    const policy = workflowPolicySchema.parse({ nodes: { Load: { fixedInputs: { endpoint: 'private-endpoint' } } } })
    const result = previewVisualWorkflow({ nodes: [{ id: 1, type: 'Load', pos: [0, 0], widgets_values: ['old-key', 'private.png', 'private-endpoint'] }] }, raw, policy)
    expect(result.graph['1']!.inputs).toEqual({})
    expect(JSON.stringify(result)).not.toMatch(/server-key|old-key|private\.png|private-endpoint/)
  })
})
