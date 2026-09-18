import type { ComfyHistoryEntry } from '../shared/types/comfyui'
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { workflowProjectsFromHistory } from '../server/services/comfyui/project-output'
import { workflowGraphFromHistory } from '../shared/utils/comfy-history-workflow'

const owned = { promptId: '72e17718-af2e-41ee-96a4-a93b9fdc8ab9', createdAt: new Date('2026-09-16T00:56:18Z') }
const file = { filename: 'Bailian_Wan3_930d7eb4bf114accae98c61b749a78a8.mp4', subfolder: '', type: 'output' }
const graph = {
  name: '阿里云百炼工作流',
  last_node_id: 1,
  last_link_id: 0,
  nodes: [{ id: 1, type: 'ForkVdoBailianWan3Video', pos: [80, 120], size: [260, 120], order: 0, mode: 0, widgets_values: ['480P'] }],
  links: [],
}
const success: ComfyHistoryEntry = {
  status: { status_str: 'success', completed: true },
  prompt: [0, owned.promptId, {
    1: { class_type: 'ForkVdoBailianImage', inputs: { file: 'fixture.png' } },
    4: { class_type: 'ForkVdoBailianWan3Video', inputs: {
      positive_prompt: ['6', 0],
      model: 'wan3.0-video',
      resolution: '480P',
      ratio: '16:9',
      duration: -1,
    } },
    6: { class_type: 'ForkVdoText', inputs: { text: '测试生成提示词' } },
  }, { extra_pnginfo: { workflow: graph } }, ['4', '5']],
  outputs: {
    4: { videos: [file] },
    5: { videos: [file] },
  },
}

it('lists an owned successful video once, with a playable owner-gated URL', () => {
  const records = workflowProjectsFromHistory(owned, success)
  assert.equal(records.length, 1)
  const record = records[0]
  assert.equal(record?.promptId, owned.promptId)
  assert.equal(record?.prompt, '测试生成提示词')
  assert.equal(record?.name, '阿里云百炼工作流')
  assert.equal(record?.hasOriginalWorkflow, true)
  assert.deepEqual(record?.mediaTypes, ['image'])
  assert.equal(record?.videoUrl, `/api/comfyui/view?filename=${file.filename}&type=output`)
})

it('offers only structurally valid execution snapshots as original workflows', () => {
  assert.equal(workflowGraphFromHistory(success)?.nodes.length, 1)
  const noGraph = { ...success, prompt: [0, owned.promptId, {}, {}, []] as ComfyHistoryEntry['prompt'] }
  assert.equal(workflowProjectsFromHistory(owned, noGraph)[0]?.hasOriginalWorkflow, false)
  assert.equal(workflowProjectsFromHistory(owned, noGraph)[0]?.name, '工作流视频')
  const invalid = { ...success, prompt: [0, owned.promptId, {}, { extra_pnginfo: { workflow: { ...graph, nodes: [{ type: 'broken' }] } } }, []] as ComfyHistoryEntry['prompt'] }
  assert.equal(workflowGraphFromHistory(invalid), null)
  assert.equal(workflowProjectsFromHistory(owned, invalid)[0]?.hasOriginalWorkflow, false)
})

it('omits incomplete, failed, and untrusted output filenames', () => {
  assert.deepEqual(workflowProjectsFromHistory(owned, { ...success, status: { status_str: 'success', completed: false } }), [])
  assert.deepEqual(workflowProjectsFromHistory(owned, { ...success, status: { status_str: 'error', completed: true } }), [])
  assert.deepEqual(workflowProjectsFromHistory(owned, {
    ...success,
    outputs: { 4: { videos: [
      { ...file, filename: '../other.mp4' },
      { ...file, filename: 'outside.mp4', type: 'input' },
    ] } },
  }), [])
})
