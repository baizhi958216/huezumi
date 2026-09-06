import type { ComfyObjectInfo, ComfyWorkflowJSON } from '../shared/types/comfyui'
import assert from 'node:assert/strict'
import { it } from 'vitest'
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
