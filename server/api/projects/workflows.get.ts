import type { WorkflowProjectRecord } from '#shared/types/workflow-project'
import { desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { comfyExecutions } from '../../database/schema'
import { fetchHistoryEntry } from '../../services/comfyui/client'
import { workflowProjectsFromHistory } from '../../services/comfyui/project-output'
import { requireUser } from '../../utils/auth'
import { withComfyUpstream } from '../../utils/comfyui'

export default defineEventHandler(async (event): Promise<WorkflowProjectRecord[]> => {
  const user = await requireUser(event)
  if (user.role !== 'admin')
    return []

  const executions = await useDatabase().select({
    promptId: comfyExecutions.promptId,
    createdAt: comfyExecutions.createdAt,
  }).from(comfyExecutions).where(eq(comfyExecutions.ownerId, user.id)).orderBy(desc(comfyExecutions.createdAt)).limit(100)

  const projects: WorkflowProjectRecord[] = []
  for (let offset = 0; offset < executions.length; offset += 8) {
    const batch = executions.slice(offset, offset + 8)
    const histories = await withComfyUpstream(() => Promise.all(batch.map(execution => fetchHistoryEntry(execution.promptId))))
    histories.forEach((entry, index) => {
      const execution = batch[index]
      if (execution)
        projects.push(...workflowProjectsFromHistory(execution, entry))
    })
  }
  return projects
})
