import type { ComfyCatalog, WorkflowGraph } from '../shared/types/workflow'
import { describe, expect, it } from 'vitest'
import { publicCatalog } from '../server/services/comfyui/catalog'
import { discoverComfyNodes } from '../shared/utils/comfy-discovery'
import { comfyOutputs } from '../shared/utils/comfy-output'
import { applyWorkflowPolicy, importWorkflow, validateWorkflow, workflowPolicySchema } from '../shared/utils/workflow'

const catalog: ComfyCatalog = {
  Source: { input: { required: { text: ['STRING', { multiline: true }] } }, output: ['STRING'] },
  Output: { input: { required: { text: ['STRING'] } }, output: [], output_node: true },
  Sampler: { input: { required: { steps: ['INT', { min: 1, max: 20 }], model: [['a', 'b']] } }, output: ['IMAGE'], output_node: true },
}
const graph: WorkflowGraph = { 1: { class_type: 'Source', inputs: { text: 'hello' } }, 2: { class_type: 'Output', inputs: { text: ['1', 0] } } }

describe('dynamic workflow contract', () => {
  it('accepts unknown-to-platform node classes from the backend and preserves API JSON', () => {
    expect(importWorkflow(JSON.parse(JSON.stringify(graph)))).toEqual(graph)
    expect(validateWorkflow(graph, catalog)).toEqual([])
  })
  it('preserves floating point controls and third-party class names', () => {
    expect(importWorkflow({ 1: { class_type: 'Provider: Chat (custom)', inputs: { temperature: 0.7 } } })['1']!.inputs.temperature).toBe(0.7)
  })
  it('rejects missing nodes, incompatible ports, cycles and missing outputs', () => {
    expect(validateWorkflow({ 1: { class_type: 'MissingPlugin', inputs: {} } }, catalog).join()).toContain('未安装')
    expect(validateWorkflow({ ...graph, 2: { class_type: 'Output', inputs: { text: ['1', 9] } } }, catalog).join()).toContain('连接类型不匹配')
    expect(validateWorkflow({ 1: { class_type: 'Output', inputs: { text: ['1', 0] } } }, catalog).join()).toContain('循环')
    expect(validateWorkflow({ 1: graph['1']! }, catalog).join()).toContain('输出节点')
  })
  it('validates current model choices, integer ranges and required inputs', () => {
    expect(validateWorkflow({ 1: { class_type: 'Sampler', inputs: { steps: 21, model: 'removed-model' } } }, catalog)).toHaveLength(2)
    expect(validateWorkflow({ 1: { class_type: 'Sampler', inputs: {} } }, catalog)).toHaveLength(2)
  })
  it('does not silently guess official frontend widget ordering', () => {
    expect(() => importWorkflow({ nodes: [], links: [] })).toThrow('API 格式')
  })
  it('allows unconfigured installed nodes and overrides protected fields without credentials in snapshots', () => {
    const policy = workflowPolicySchema.parse({ nodes: { Output: { credits: 5, fixedInputs: { endpoint: 'https://model.example/v1' }, secretInputs: { key: 'apiKey' }, assetInputs: ['image'] } } })
    const input = { prompt: 'test', graph: { 1: { class_type: 'Output', inputs: { endpoint: 'https://evil.test', key: 'leak', image: '/other-user/input.png' } } }, assets: { '1.image': '11111111-1111-4111-8111-111111111111' } }
    const result = applyWorkflowPolicy(input, policy)
    expect(result).not.toHaveProperty('credits')
    expect(result.graph['1']!.inputs).toEqual({ endpoint: 'https://model.example/v1', key: '__server_secret__', image: '__owner_asset__' })
    expect(() => applyWorkflowPolicy({ ...input, assets: {} }, policy)).toThrow('上传素材')
    expect(applyWorkflowPolicy({ ...input, graph: { 1: graph['1']! }, assets: {} }, policy, catalog).graph).toEqual({ 1: graph['1']! })
    expect(() => applyWorkflowPolicy({ ...input, assets: { ...input.assets, '2.image': 'id' } }, policy)).toThrow('素材绑定')
  })
  it('removes private backend filename lists and secret fields from the public catalog', () => {
    const raw: ComfyCatalog = { Load: { input: { required: { image: [['other-user.png']], key: ['STRING', { default: 'private' }], endpoint: ['STRING'] } }, output: ['IMAGE'] } }
    const policy = workflowPolicySchema.parse({ nodes: { Load: { credits: 0, assetInputs: ['image'], secretInputs: { key: 'apiKey' }, fixedInputs: { endpoint: 'local' } } } })
    const serialized = JSON.stringify(publicCatalog(raw, policy))
    expect(serialized).not.toContain('other-user')
    expect(serialized).not.toContain('private')
    expect(serialized).not.toContain('endpoint')
    expect(publicCatalog(raw, policy).Load!.input.required!.image![0]).toBe('STRING')
  })
  it('collects mixed output types without class-specific adapters and rejects unsafe paths', () => {
    expect(comfyOutputs({ n: { text: ['hello'], images: [{ filename: 'a.png', type: 'output', subfolder: 'run' }], gifs: [{ filename: 'b.mp4', type: 'output' }], preview: [{ filename: 'private.png', type: 'input' }] } }).map(o => o.kind)).toEqual(['text', 'image', 'video'])
    expect(() => comfyOutputs({ n: { images: [{ filename: 'a.png', type: 'output', subfolder: '../private' }] } })).toThrow('path')
  })
})

describe('comfyUI V3 metadata compatibility', () => {
  it('connects named image groups, exposes a spare port and rejects invalid references', async () => {
    const { nodeInputs } = await import('../shared/utils/workflow')
    const edit: ComfyCatalog[string] = { input: { required: { images: ['COMFY_AUTOGROW_V3', { template: { min: 0, names: ['image_1', 'image_2'], input: { required: { image: ['IMAGE'] } } } }] } }, output: ['IMAGE'], output_node: true }
    const definitions = { Edit: edit, Image: { input: {}, output: ['IMAGE'] }, Text: catalog.Source! }
    const graph: WorkflowGraph = { 1: { class_type: 'Image', inputs: {} }, 2: { class_type: 'Edit', inputs: { 'images.image_1': ['1', 0] } } }
    expect(validateWorkflow(graph, definitions)).toEqual([])
    expect(Object.keys(nodeInputs(edit, graph['2']!.inputs))).toEqual(['images.image_1', 'images.image_2'])
    expect(validateWorkflow({ ...graph, 1: { class_type: 'Text', inputs: { text: 'not an image' } } }, definitions).join()).toContain('连接类型不匹配')
    expect(validateWorkflow({ ...graph, 2: { class_type: 'Edit', inputs: { 'images.image_3': ['1', 0] } } }, definitions).join()).toContain('未知输入')
    expect(validateWorkflow({ ...graph, 2: { class_type: 'Edit', inputs: { 'images.image_1': 'shared-file.png' } } }, definitions).join()).toContain('不符合节点定义')
    edit.input.required!.images![1]!.template!.min = 1
    expect(validateWorkflow({ 2: { class_type: 'Edit', inputs: {} } }, definitions).join()).toContain('缺少 images.image_1')
  })
  it('allows an empty zero-minimum Autogrow group without accepting unsupported reference ports', () => {
    const definition: ComfyCatalog[string] = { input: { required: { prompt: ['STRING'], images: ['COMFY_AUTOGROW_V3', { template: { min: 0 } }] } }, output: ['IMAGE'], output_node: true }
    const textOnly: WorkflowGraph = { 1: { class_type: 'Encode', inputs: { prompt: 'a cat' } } }
    expect(validateWorkflow(textOnly, { Encode: definition })).toEqual([])
    expect(validateWorkflow({ 1: { class_type: 'Encode', inputs: { 'prompt': 'a cat', 'images.image_1': ['1', 0] } } }, { Encode: definition }).join()).toContain('未知输入')
    expect(validateWorkflow({ 1: { class_type: 'Encode', inputs: { prompt: 'a cat', images: 'invalid' } } }, { Encode: definition }).join()).toContain('不符合节点定义')
    definition.input.required!.images = ['COMFY_AUTOGROW_V3', { template: { min: 1 } }]
    expect(validateWorkflow(textOnly, { Encode: definition }).join()).toContain('缺少 images')
  })
  it('expands nested DynamicCombo inputs and validates their current branch', async () => {
    const { defaultNodeInputs, nodeInputs } = await import('../shared/utils/workflow')
    const definition: ComfyCatalog[string] = { input: { required: { format: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'mp4', inputs: { required: { codec: ['COMBO', { options: ['h264', 'av1'] }] } } }] }] } }, output: [], output_node: true }
    expect(defaultNodeInputs(definition)).toEqual({ 'format': 'mp4', 'format.codec': 'h264' })
    expect(Object.keys(nodeInputs(definition))).toEqual(['format', 'format.codec'])
    expect(validateWorkflow({ 1: { class_type: 'Save', inputs: { 'format': 'mp4', 'format.codec': 'h264' } } }, { Save: definition })).toEqual([])
    expect(validateWorkflow({ 1: { class_type: 'Save', inputs: { 'format': 'mp4', 'format.codec': 'not-installed' } } }, { Save: definition })).toHaveLength(1)
  })
  it('rejects plain-text credentials and ambiguous protected-field policies', () => {
    expect(workflowPolicySchema.safeParse({ nodes: { Model: { credits: 1, fixedInputs: { api_key: 'private' } } } }).success).toBe(false)
    expect(workflowPolicySchema.safeParse({ nodes: { Model: { credits: 1, fixedInputs: { image: 'x' }, assetInputs: ['image'] } } }).success).toBe(false)
    expect(workflowPolicySchema.safeParse({ nodes: { Model: { credits: 1, fixedInputs: { api_key: '', max_tokens: 2048 } } } }).success).toBe(true)
  })
})

describe('installed ComfyUI node discovery', () => {
  it('discovers nodes beyond enabled policy without leaking field defaults or file choices', () => {
    const nodes = discoverComfyNodes({ ...catalog, ThirdParty: { display_name: 'Custom loader', category: 'plugin/image', input: { required: { image: [['private-user/file.png'], { image_upload: true }], api_key: ['STRING', { default: 'private-key' }] } }, output: ['IMAGE'] } })
    expect(nodes).toHaveLength(4)
    expect(nodes.find(node => node.name === 'ThirdParty')).toEqual({ name: 'ThirdParty', displayName: 'Custom loader', category: 'plugin/image', assetInputs: ['image'], credentialInputs: ['api_key'] })
    expect(JSON.stringify(nodes)).not.toContain('private-')
  })
  it('detects protected inputs in every dynamic option, including unselected branches', () => {
    const nodes = discoverComfyNodes({ Dynamic: { input: { required: { source: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'plain', inputs: { required: { text: ['STRING'] } } }, { key: 'upload', inputs: { required: { video: ['STRING', { video_upload: true }], token: ['STRING'] } } }] }] } }, output: ['VIDEO'] } })
    expect(nodes[0]).toMatchObject({ assetInputs: ['source.video'], credentialInputs: ['source.token'] })
  })
})

describe('automatic installed node availability', () => {
  it('exposes all installed nodes even with an old partial node configuration', () => {
    const policy = workflowPolicySchema.parse({ nodes: { Source: {} } })
    expect(Object.keys(publicCatalog(catalog, policy)).sort()).toEqual(Object.keys(catalog).sort())
    expect(() => applyWorkflowPolicy({ prompt: 'new plugin', graph: { 1: { class_type: 'Absent', inputs: {} } }, assets: {} }, policy, catalog)).toThrow('ComfyUI 未加载')
  })
  it('automatically binds upload fields for an unconfigured plugin without exposing file choices', () => {
    const installed: ComfyCatalog = { PluginLoader: { input: { required: { image: [['private-other.png'], { image_upload: true }] } }, output: ['IMAGE'] } }
    const policy = workflowPolicySchema.parse({ nodes: {} })
    expect(JSON.stringify(publicCatalog(installed, policy))).not.toContain('private-other.png')
    const input = { prompt: 'upload', graph: { 1: { class_type: 'PluginLoader', inputs: { image: 'private-other.png' } } }, assets: {} }
    expect(() => applyWorkflowPolicy(input, policy, installed)).toThrow('需要上传素材')
    expect(applyWorkflowPolicy({ ...input, assets: { '1.image': 'owned-asset' } }, policy, installed).graph['1']!.inputs.image).toBe('__owner_asset__')
  })
  it('only binds upload fields of the selected dynamic branch and permits omitted optional uploads', () => {
    const installed: ComfyCatalog = { Dynamic: { input: { required: { source: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'text', inputs: { required: { prompt: ['STRING'] } } }, { key: 'image', inputs: { required: { file: [[], { image_upload: true }] } } }] }] }, optional: { reference: [[], { image_upload: true }] } }, output: ['IMAGE'] } }
    const input = { prompt: 'text branch', graph: { 1: { class_type: 'Dynamic', inputs: { 'source': 'text', 'source.prompt': 'hello', 'reference': '' } } }, assets: {} }
    expect(applyWorkflowPolicy(input, workflowPolicySchema.parse({ nodes: {} }), installed).graph['1']!.inputs).toEqual({ 'source': 'text', 'source.prompt': 'hello' })
  })
})

describe('live model choice diagnostics', () => {
  it('explains empty backend choices even when a template omitted the field', () => {
    const raw: ComfyCatalog = { Loader: { input: { required: { ckpt_name: [[]] } }, output: [], output_node: true } }
    for (const inputs of [{}, { ckpt_name: '' }, { ckpt_name: '请选择已安装的模型' }]) {
      const issues = validateWorkflow({ 1: { class_type: 'Loader', inputs } }, raw)
      expect(issues).toHaveLength(1)
      expect(issues[0]).toContain('ComfyUI 暂无可选项')
      expect(issues[0]).toContain('ckpt_name')
    }
  })
  it('distinguishes an unselected model from a removed model without choosing a replacement', () => {
    const raw: ComfyCatalog = { Loader: { input: { required: { ckpt_name: [['installed.safetensors']] } }, output: [], output_node: true } }
    const graph: WorkflowGraph = { 1: { class_type: 'Loader', inputs: { ckpt_name: 'old.safetensors' } } }
    expect(validateWorkflow(graph, raw)[0]).toContain('原选项已不在')
    expect(graph['1']!.inputs.ckpt_name).toBe('old.safetensors')
    graph['1']!.inputs.ckpt_name = ''
    expect(validateWorkflow(graph, raw)[0]).toContain('请从当前可用列表中选择')
    graph['1']!.inputs.ckpt_name = 'installed.safetensors'
    expect(validateWorkflow(graph, raw)).toEqual([])
  })
})
