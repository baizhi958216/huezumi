<script setup lang="ts">
import type { ComfyNodeDefinition, WorkflowValue } from '#shared/types/workflow'
import { nodeInputs } from '#shared/utils/workflow'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{ id: string, selected?: boolean, data: { classType: string, title?: string, inputs: Record<string, WorkflowValue>, definition?: ComfyNodeDefinition, previewPorts?: ComfyNodeDefinition } }>()
const ports = computed(() => props.data.previewPorts || props.data.definition)
const inputs = computed(() => Object.entries(nodeInputs(ports.value, props.data.inputs)))
</script>

<template>
  <div class="workflow-node" :class="{ 'is-selected': selected, 'is-missing': !data.definition }">
    <div class="workflow-node-heading">
      <UIcon name="i-lucide-box" />
      <strong>{{ data.title || data.definition?.display_name || data.classType }}</strong>
      <span>#{{ id }}</span>
    </div>
    <small>{{ data.definition?.category || data.classType }}</small>
    <p v-if="!data.definition" class="text-error">
      当前 ComfyUI 未加载此节点
    </p>
    <div class="workflow-node-ports">
      <div class="workflow-inputs">
        <div v-for="[name, spec] in inputs" :key="name" class="workflow-port">
          <Handle :id="name" type="target" :position="Position.Left" />
          <span :title="String(spec[0])">{{ name }}</span>
        </div>
      </div>
      <div class="workflow-outputs">
        <div v-for="(type, index) in ports?.output || []" :key="index" class="workflow-port">
          <span>{{ ports?.output_name?.[index] || type }}</span>
          <Handle :id="String(index)" type="source" :position="Position.Right" />
        </div>
      </div>
    </div>
    <div v-if="Object.values(data.inputs).some(value => typeof value === 'string' && value.length > 20)" class="workflow-node-preview">
      {{ Object.values(data.inputs).find(value => typeof value === 'string' && value.length > 20) }}
    </div>
  </div>
</template>
