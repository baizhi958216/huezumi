import type { ComfyInstallState } from '#shared/types/comfyui'
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { getComfyConfig, resolvePythonBin, resolveVenvTool } from './config'
import { comfyChildEnvironment } from './environment'
import { appendInstallLog, appendRuntimeLog, getRuntime, invalidateObjectInfo } from './state'

export const COMFY_REPO_URL = 'https://github.com/comfyanonymous/ComfyUI.git'
/** 判定仓库是否可用：以 main.py 是否存在为准，比目录存在更可靠。 */
export function isComfyInstalled(dir?: string): boolean {
  const config = getComfyConfig()
  return existsSync(join(dir ?? config.dir, 'main.py'))
}
export function getInstallState(): ComfyInstallState {
  const { install } = getRuntime()
  return { ...install, log: install.log.slice(-40) }
}
function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    appendInstallLog(`$ ${command} ${args.join(' ')}`)
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: comfyChildEnvironment(process.env),
    })
    child.stdout?.on('data', (chunk: Buffer) => appendInstallLog(String(chunk)))
    child.stderr?.on('data', (chunk: Buffer) => appendInstallLog(String(chunk)))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0)
        resolve()
      else
        reject(new Error(`${command} 退出码 ${code ?? '未知'}`))
    })
  })
}
async function installDependencies(config: ReturnType<typeof getComfyConfig>) {
  const venvPython = join(config.dir, '.venv', 'bin', 'python')
  const requirements = join(config.dir, 'requirements.txt')
  if (!existsSync(requirements))
    throw new Error('仓库中缺少 requirements.txt')
  const state = getRuntime().install
  const tool = resolveVenvTool()
  if (!existsSync(venvPython)) {
    state.step = '创建虚拟环境'
    if (tool === 'uv')
      await run('uv', ['venv', '--seed', '.venv'], config.dir)
    else
      await run(resolvePythonBin(config) || 'python3', ['-m', 'venv', '.venv'], config.dir)
  }
  const pipPython = existsSync(venvPython) ? venvPython : (resolvePythonBin(config) || 'python3')
  state.step = '安装依赖（首次需要下载 torch，可能较久）'
  if (tool === 'uv') {
    await run('uv', ['pip', 'install', '-r', 'requirements.txt', '--python', pipPython], config.dir)
  }
  else {
    await run(pipPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], config.dir)
    await run(pipPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], config.dir)
  }
}
/**
 * 启动安装任务并立即返回；进度通过 `getInstallState()` / `/api/admin/comfyui/status` 轮询。
 * 克隆与 pip 安装耗时可能达数十分钟，绝不能同步阻塞 HTTP 请求。
 */
export function startInstall(options: {
  installDeps?: boolean
} = {}): ComfyInstallState {
  const config = getComfyConfig()
  if (config.mode === 'remote') {
    throw createError({ statusCode: 409, statusMessage: '远程模式不需要安装 ComfyUI' })
  }
  const state = getRuntime().install
  if (state.phase === 'running')
    return getInstallState()
  state.phase = 'running'
  state.step = '准备'
  state.message = undefined
  state.log = []
  state.startedAt = new Date().toISOString()
  state.finishedAt = undefined
  void (async () => {
    try {
      if (!isComfyInstalled(config.dir)) {
        state.step = `克隆 ${COMFY_REPO_URL}`
        const parentDir = dirname(config.dir)
        if (!existsSync(parentDir))
          mkdirSync(parentDir, { recursive: true })
        await run('git', ['clone', '--depth', '1', COMFY_REPO_URL, config.dir], parentDir)
      }
      if (options.installDeps)
        await installDependencies(config)
      state.phase = 'succeeded'
      state.step = '完成'
      invalidateObjectInfo()
      appendRuntimeLog('[comfyui] 安装完成')
    }
    catch (error) {
      state.phase = 'failed'
      state.message = error instanceof Error ? error.message : String(error)
      appendInstallLog(`[error] ${state.message}`)
    }
    finally {
      state.finishedAt = new Date().toISOString()
    }
  })()
  return getInstallState()
}
