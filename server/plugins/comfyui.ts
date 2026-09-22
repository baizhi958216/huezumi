import { getComfyStatus, startComfy } from '../services/comfyui/process'
import { appendRuntimeLog } from '../services/comfyui/state'

export default defineNitroPlugin(() => {
  // Python 初始化可能较慢；保留页面服务，让管理员可以查看状态或处理安装问题。
  void checkComfyOnStartup()
})

async function checkComfyOnStartup() {
  try {
    const status = await getComfyStatus()
    if (status.state === 'running') {
      appendRuntimeLog('[comfyui] 已运行，复用现有服务')
      return
    }
    if (status.mode === 'remote') {
      console.warn('[comfyui] 远程服务不可达，请检查远程 ComfyUI 和连接配置')
      return
    }
    if (status.state === 'starting') {
      appendRuntimeLog('[comfyui] 正在启动，复用现有启动任务')
      return
    }
    if (!status.installed) {
      console.warn('[comfyui] 尚未安装，请由管理员在 /studio/workflow 安装后启动')
      return
    }
    appendRuntimeLog('[comfyui] 未运行，正在自动启动')
    const started = await startComfy()
    if (started.state !== 'running')
      throw new Error('ComfyUI 未就绪')
    appendRuntimeLog('[comfyui] 自动启动完成，服务已就绪')
  }
  catch {
    console.warn('[comfyui] 启动检查或自动启动失败，请检查 ComfyUI 配置，并在 /studio/workflow 查看状态和重试')
  }
}
