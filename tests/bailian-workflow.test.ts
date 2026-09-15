import type { ComfyObjectInfo, ComfyWorkflowJSON } from '../shared/types/comfyui'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { serializeGraphToApiPrompt } from '../shared/types/comfyui'
import { collectOutputFiles } from '../shared/utils/comfy-output'

const graph: ComfyWorkflowJSON = JSON.parse(readFileSync('workflows/bailian-wan3-multimodal-reference.json', 'utf8'))

function source(upload: string) {
  return {
    input: { required: { file: [['', 'fixture'], { [upload]: true }] } },
    output: ['FORKVDO_BAILIAN_MEDIA'],
  }
}

const info: ComfyObjectInfo = {
  ForkVdoText: {
    input: { required: { text: ['STRING', { multiline: true }] } },
    output: ['STRING'],
  },
  ForkVdoBailianImage: source('image_upload'),
  ForkVdoBailianVideo: source('video_upload'),
  ForkVdoBailianAudio: source('audio_upload'),
  ForkVdoBailianWan3Video: {
    input: {
      required: {
        positive_prompt: ['STRING', { multiline: true }],
        negative_prompt: ['STRING', { multiline: true }],
        model: [['wan3.0-video-prime', 'wan3.0-video'], {}],
        seed: ['INT', { default: -1, control_after_generate: true }],
        resolution: [['480P', '720P', '1080P'], {}],
        ratio: [['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'], {}],
        duration: ['INT', { default: 5 }],
        output_audio: ['BOOLEAN', { default: true }],
        prompt_extend: ['BOOLEAN', { default: true }],
        watermark: ['BOOLEAN', { default: false }],
        timeout_minutes: ['INT', { default: 20 }],
      },
      optional: {
        reference_image: ['FORKVDO_BAILIAN_MEDIA', {}],
        reference_video: ['FORKVDO_BAILIAN_MEDIA', {}],
        reference_audio: ['FORKVDO_BAILIAN_MEDIA', {}],
      },
    },
    output: ['FORKVDO_BAILIAN_VIDEO'],
  },
  ForkVdoBailianVideoOutput: {
    input: { required: { video: ['FORKVDO_BAILIAN_VIDEO', { forceInput: true }] } },
    output: [],
  },
}

it('loads the Wan 3.0 template with prompt, optional media and video output nodes', () => {
  assert.match(graph.name || '', /^阿里云百炼 · Wan 3\.0/)
  assert.deepEqual(graph.nodes.map(node => node.type), [
    'ForkVdoBailianImage',
    'ForkVdoBailianVideo',
    'ForkVdoBailianAudio',
    'ForkVdoBailianWan3Video',
    'ForkVdoBailianVideoOutput',
    'ForkVdoText',
    'ForkVdoText',
  ])
  assert.ok(graph.links.every(link => graph.nodes.some(node => node.id === link[1])
    && graph.nodes.some(node => node.id === link[3])))
  const { prompt, issues } = serializeGraphToApiPrompt(graph, info)
  assert.deepEqual(issues, [])
  assert.equal(prompt['4']?.inputs.model, 'wan3.0-video-prime')
  assert.equal(prompt['4']?.inputs.seed, -1)
  assert.equal(prompt['4']?.inputs.resolution, '720P')
  assert.equal(prompt['4']?.inputs.ratio, '16:9')
  assert.equal(prompt['4']?.inputs.duration, 5)
  assert.deepEqual(prompt['4']?.inputs.reference_image, ['1', 0])
  assert.deepEqual(prompt['4']?.inputs.reference_video, ['2', 0])
  assert.deepEqual(prompt['4']?.inputs.reference_audio, ['3', 0])
  assert.deepEqual(prompt['4']?.inputs.positive_prompt, ['6', 0])
  assert.deepEqual(prompt['4']?.inputs.negative_prompt, ['7', 0])
  assert.equal(prompt['6']?.inputs.text, '一位人物在夜色中的街道缓步前行，镜头平稳跟随，电影质感，自然环境音。')
  assert.equal(prompt['7']?.inputs.text, '模糊、低画质、肢体畸形')
  assert.deepEqual(prompt['5']?.inputs.video, ['4', 0])
})

it('can delete optional sources and still serialize a text-only request', () => {
  const textOnly = {
    ...graph,
    nodes: graph.nodes.filter(node => ![1, 2, 3].includes(node.id)),
    links: graph.links.filter(link => ![1, 2, 3].includes(link[0])),
  }
  const { prompt, issues } = serializeGraphToApiPrompt(textOnly, info)
  assert.deepEqual(issues, [])
  assert.equal(prompt['4']?.inputs.reference_image, undefined)
  assert.equal(prompt['4']?.inputs.reference_video, undefined)
  assert.equal(prompt['4']?.inputs.reference_audio, undefined)
  assert.deepEqual(prompt['4']?.inputs.positive_prompt, ['6', 0])
  assert.deepEqual(prompt['4']?.inputs.negative_prompt, ['7', 0])
})

it('keeps old saved graphs with prompts inside the generator compatible', () => {
  const oldGraph = {
    ...graph,
    nodes: graph.nodes.filter(node => ![6, 7].includes(node.id)).map(node => node.id === 4
      ? {
          ...node,
          inputs: node.inputs?.filter(input => !['positive_prompt', 'negative_prompt'].includes(input.name)),
          widgets_values: [
            '旧版正向提示词',
            '旧版反向提示词',
            ...node.widgets_values?.slice(2) ?? [],
          ],
        }
      : node),
    links: graph.links.filter(link => ![5, 6].includes(link[0])),
  }
  const { prompt, issues } = serializeGraphToApiPrompt(oldGraph, info)
  assert.deepEqual(issues, [])
  assert.equal(prompt['4']?.inputs.positive_prompt, '旧版正向提示词')
  assert.equal(prompt['4']?.inputs.negative_prompt, '旧版反向提示词')
})

it('shows a video file only once when old and new output nodes both register it', () => {
  const file = { filename: 'Bailian_Wan3_fixture.mp4', subfolder: '', type: 'output' }
  const files = collectOutputFiles({ outputs: {
    4: { videos: [file] },
    5: { videos: [file] },
  } })
  assert.equal(files.length, 1)
  assert.equal(files[0]?.filename, file.filename)
})
