import type { ComfyObjectInfo, ComfyWorkflowJSON } from '../shared/types/comfyui'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { it } from 'vitest'
import { getUploadTargets, nextSeedValues } from '../app/utils/comfy-controls'
import { buildNodeTypeInfo, serializeGraphToApiPrompt } from '../shared/types/comfyui'

function graph(values: unknown[]): ComfyWorkflowJSON {
  return {
    last_node_id: 1,
    last_link_id: 0,
    nodes: [{
      id: 1,
      type: 'CheckpointLoaderSimple',
      pos: [0, 0],
      size: [260, 120],
      order: 0,
      mode: 0,
      inputs: [],
      outputs: [],
      widgets_values: values,
    }],
    links: [],
  }
}

const objectInfo: ComfyObjectInfo = {
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: [[], {}] } },
    output: ['MODEL'],
    name: 'CheckpointLoaderSimple',
  },
}

it('reports combo inputs with no available choices before submission', () => {
  const result = serializeGraphToApiPrompt(graph(['']), objectInfo)
  assert.match(result.issues[0] || '', /没有可用选项/)
})

it('reports stale combo values before submission', () => {
  const result = serializeGraphToApiPrompt(graph(['missing.safetensors']), {
    CheckpointLoaderSimple: {
      ...objectInfo.CheckpointLoaderSimple,
      input: { required: { ckpt_name: [['model.safetensors'], {}] } },
    },
  })
  assert.match(result.issues[0] || '', /当前值无效/)
})

it('recognizes upload-enabled COMBO inputs from current ComfyUI definitions', () => {
  const audio = buildNodeTypeInfo('LoadAudio', {
    input: { required: { audio: ['COMBO', { options: [], audio_upload: true }] } },
    output: ['AUDIO'],
    name: 'LoadAudio',
  })
  const video = buildNodeTypeInfo('LoadVideo', {
    input: { required: { file: ['COMBO', { options: ['demo.mp4'], video_upload: true }] } },
    output: ['VIDEO'],
    name: 'LoadVideo',
  })

  assert.equal(audio.widgets[0]?.uploadType, 'audio')
  assert.deepEqual(audio.widgets[0]?.choices, [])
  assert.equal(video.widgets[0]?.uploadType, 'video')
  assert.deepEqual(video.widgets[0]?.choices, ['demo.mp4'])
})

const imageInfo: ComfyObjectInfo = JSON.parse(readFileSync(new URL('./fixtures/comfy-image-nodes.json', import.meta.url), 'utf8'))

it('serializes the single image workflow with independent text and separate model inputs', () => {
  const workflow: ComfyWorkflowJSON = JSON.parse(readFileSync('workflows/image-creation.json', 'utf8'))
  const { prompt, issues } = serializeGraphToApiPrompt(workflow, imageInfo)
  assert.deepEqual(issues, [])
  assert.equal(workflow.nodes.length, 10)
  assert.deepEqual(prompt['3']?.inputs.user_request, ['2', 0])
  assert.deepEqual(prompt['3']?.inputs.llm_config, ['10', 0])
  assert.deepEqual(prompt['6']?.inputs.positive, ['4', 0])
  assert.deepEqual(prompt['6']?.inputs.negative, ['5', 0])
  assert.deepEqual(prompt['8']?.inputs.model, ['7', 0])
  assert.deepEqual(prompt['8']?.inputs.clip, ['7', 1])
  assert.deepEqual(prompt['8']?.inputs.vae, ['7', 2])
  assert.equal(prompt['8']?.inputs.steps, 24)
  assert.equal(prompt['8']?.inputs.control_after_generate, undefined)
  assert.equal(prompt['3']?.inputs.connection_id, 'workflow')
  assert.equal(existsSync('workflows/anima-llm-prompt-generate.json'), false)
  assert.equal(existsSync('workflows/anima-llm-multi-image-edit.json'), false)
  for (const [id, sourceId, sourceSlot, targetId, targetSlot, type] of workflow.links) {
    const source = workflow.nodes.find(node => node.id === sourceId)?.outputs?.[sourceSlot]
    const target = workflow.nodes.find(node => node.id === targetId)?.inputs?.[targetSlot]
    assert.equal(source?.type, type)
    assert.equal(target?.type, type)
    assert.ok(source?.links?.includes(id))
    assert.equal(target?.link, id)
  }
})

it('uses forceInput sockets without shifting positional widget values', () => {
  const info = buildNodeTypeInfo('ForkVdoImagePlan', imageInfo.ForkVdoImagePlan!)
  assert.equal(info.widgets[0]?.name, 'mode')
  assert.deepEqual(info.inputs.slice(0, 2).map(slot => slot.name), ['positive', 'negative'])
  assert.ok(!info.widgets.some(widget => widget.name === 'positive'))
  const oldPrompt = buildNodeTypeInfo('ForkVdoPrompt', imageInfo.ForkVdoPrompt!)
  assert.deepEqual(oldPrompt.widgets.map(widget => widget.name), ['connection_id', 'model_name', 'user_request', 'default_rules', 'target_config', 'refresh_token'])
  const llmConfig = buildNodeTypeInfo('ForkVdoLLMConfig', imageInfo.ForkVdoLLMConfig!)
  assert.equal(llmConfig.widgets.find(widget => widget.name === 'api_key')?.options.secret, true)
})

it('allocates multi-file uploads only to empty slots without overwriting earlier inputs', () => {
  const info = buildNodeTypeInfo('ForkVdoImageCollection', imageInfo.ForkVdoImageCollection!)
  const values = { image_1: 'one.png', image_3: 'two.png' }
  assert.deepEqual(getUploadTargets(info.widgets, values, 'image_1', 2).map(widget => widget.name), ['image_2', 'image_4'])
  assert.deepEqual(getUploadTargets(info.widgets, values, 'image_3', 1).map(widget => widget.name), ['image_3'])
  assert.throws(() => getUploadTargets(info.widgets, values, 'image_8', 2), /只有 1 个/)
})

it('recognizes seed controls from metadata and advances only the next-run seed', () => {
  const info = buildNodeTypeInfo('ForkVdoImageGenerate', imageInfo.ForkVdoImageGenerate!)
  assert.deepEqual(info.widgets.slice(0, 3).map(widget => widget.name), ['seed', 'control_after_generate', 'steps'])
  const values = { seed: 7, control_after_generate: 'randomize', steps: 24 }
  const next = nextSeedValues(info.widgets, values, () => 0.5)
  assert.equal(next.seed, 2147483648)
  assert.equal(values.seed, 7)
  assert.equal(next.steps, 24)
  assert.equal(nextSeedValues(info.widgets, { ...values, control_after_generate: 'fixed' }).seed, 7)
  assert.equal(nextSeedValues(info.widgets, { ...values, seed: 0, control_after_generate: 'decrement' }).seed, 4294967295)
})
