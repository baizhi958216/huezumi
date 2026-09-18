import type { ComfyRuntimeState, ComfySystemStats, ComfyUIStatus } from '#shared/types/comfyui'
import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { ComfyServiceConfig } from './config'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { fetchSystemStats } from './client'
import { getComfyConfig, resolvePythonBin } from './config'
import { ensureForkvdoCustomNode } from './custom-nodes'
import { comfyChildEnvironment } from './environment'
import { isComfyInstalled } from './installer'
import {
  appendRuntimeLog,
  getRuntime,
  invalidateObjectInfo,
  isChildAlive,
  LOG_TAIL,
} from './state'

const STOP_GRACE_MS = 5000

/** 探测上游是否可用，返回系统信息；不可用时返回 undefined。 */
export async function probeComfy(timeoutMs?: number): Promise<ComfySystemStats | undefined> {
  try {
    return await fetchSystemStats(timeoutMs)
  }
  catch {
    return undefined
  }
}

function resolveState(config: ComfyServiceConfig, reachable: boolean): ComfyRuntimeState {
  if (reachable)
    return 'running'
  const runtime = getRuntime()
  if (runtime.error)
    return 'error'
  if (isChildAlive(runtime.child) || runtime.starting)
    return 'starting'
  return config.mode === 'local' && !isComfyInstalled(config.dir) ? 'not_installed' : 'stopped'
}

export async function getComfyStatus(): Promise<ComfyUIStatus> {
  const config = getComfyConfig()
  const runtime = getRuntime()
  const stats = await probeComfy(config.probeTimeoutMs)
  const state = resolveState(config, Boolean(stats))

  return {
    mode: config.mode,
    installed: config.mode === 'remote' ? true : isComfyInstalled(config.dir),
    state,
    baseUrl: config.mode === 'remote' ? config.remoteBaseUrl : `http://${config.host}:${config.port}`,
    dir: config.mode === 'local' ? config.dir : undefined,
    pid: isChildAlive(runtime.child) ? runtime.child?.pid : undefined,
    systemStats: stats,
    install: { ...runtime.install, log: runtime.install.log.slice(-LOG_TAIL) },
    log: runtime.log.slice(-LOG_TAIL),
    error: runtime.error,
  }
}

function waitUntilReady(config: ComfyServiceConfig, child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + config.startTimeoutMs
    let exited = false

    const timer = setInterval(async () => {
      if (exited)
        return
      if (await probeComfy(Math.min(2000, config.probeTimeoutMs))) {
        finish()
        resolve()
        return
      }
      if (Date.now() > deadline) {
        finish()
        getRuntime().error = '等待 ComfyUI 就绪超时'
        reject(new Error('等待 ComfyUI 就绪超时'))
      }
    }, 700)

    function finish() {
      clearInterval(timer)
      child.off('exit', onExit)
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null) {
      exited = true
      finish()
      const recentLogs = getRuntime().log.slice(-8).join('\n')
      const details = recentLogs ? `：\n${recentLogs}` : ''
      reject(new Error(`ComfyUI 进程提前退出（code=${code} signal=${signal}）${details}`))
    }

    child.once('exit', onExit)
  })
}

/** 拉起本地 ComfyUI 进程并等待就绪；remote 模式拒绝执行。 */
export async function startComfy(): Promise<ComfyUIStatus> {
  const config = getComfyConfig()
  if (config.mode === 'remote')
    throw createError({ statusCode: 409, statusMessage: '远程模式下 ComfyUI 由外部负责启动' })
  if (!isComfyInstalled(config.dir))
    throw createError({ statusCode: 409, statusMessage: '尚未安装 ComfyUI，请先执行安装' })

  const runtime = getRuntime()
  if (runtime.starting) {
    await runtime.starting.catch(() => {})
    return getComfyStatus()
  }

  // 端口上已有 ComfyUI（可能是外部手动启动的实例）时直接复用，不重复拉起。
  if (await probeComfy(config.probeTimeoutMs)) {
    runtime.error = undefined
    return getComfyStatus()
  }

  const python = resolvePythonBin(config)
  if (!python) {
    throw createError({ statusCode: 500, statusMessage: '未找到可用的 Python 解释器，请配置 NUXT_COMFYUI_PYTHON' })
  }

  ensureForkvdoCustomNode(config)

  runtime.error = undefined
  appendRuntimeLog(`[comfyui] 启动：${python} main.py --listen ${config.host} --port ${config.port}`)

  const child = spawn(python, [
    'main.py',
    '--listen',
    config.host,
    '--port',
    String(config.port),
    '--disable-auto-launch',
    ...config.extraArgs,
  ], {
    cwd: config.dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: comfyChildEnvironment(process.env, config.llmConnectionsJson),
  })

  runtime.child = child
  invalidateObjectInfo()

  child.stdout?.on('data', (chunk: Buffer) => appendRuntimeLog(String(chunk)))
  child.stderr?.on('data', (chunk: Buffer) => appendRuntimeLog(String(chunk)))
  child.on('exit', (code, signal) => {
    appendRuntimeLog(`[comfyui] 进程退出 code=${code} signal=${signal}`)
    if (runtime.child === child)
      runtime.child = undefined
    invalidateObjectInfo()
  })
  child.on('error', (error) => {
    appendRuntimeLog(`[comfyui] 启动失败：${error.message}`)
    runtime.error = error.message
  })

  runtime.starting = waitUntilReady(config, child)
  try {
    await runtime.starting
  }
  finally {
    runtime.starting = undefined
  }
  return getComfyStatus()
}

/** 停止本地进程：先 SIGTERM，宽限期后 SIGKILL。 */
export async function stopComfy(): Promise<ComfyUIStatus> {
  const config = getComfyConfig()
  if (config.mode === 'remote')
    throw createError({ statusCode: 409, statusMessage: '远程模式下无法停止外部 ComfyUI' })

  const runtime = getRuntime()
  const child = runtime.child
  if (!isChildAlive(child)) {
    runtime.child = undefined
    return getComfyStatus()
  }

  const target = child as ChildProcess
  await new Promise<void>((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | undefined

    const finish = () => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      target.off('exit', finish)
      resolve()
    }

    target.once('exit', finish)
    timer = setTimeout(() => {
      if (isChildAlive(target))
        target.kill('SIGKILL')
      finish()
    }, STOP_GRACE_MS)

    try {
      if (!target.kill('SIGTERM') && !isChildAlive(target))
        finish()
    }
    catch {
      // The process may have exited between the liveness check and SIGTERM.
      finish()
    }
  })

  runtime.child = undefined
  invalidateObjectInfo()
  return getComfyStatus()
}
