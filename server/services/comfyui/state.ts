import type { ComfyInstallState, ComfyObjectInfo } from '#shared/types/comfyui'
import type { ChildProcess } from 'node:child_process'

export const LOG_LIMIT = 200
export const LOG_TAIL = 40

export interface ComfyRuntime {
  child?: ChildProcess
  starting?: Promise<void>
  log: string[]
  objectInfo?: ComfyObjectInfo
  install: ComfyInstallState
  error?: string
}

/**
 * 运行时状态挂在 globalThis 上：dev 下 Nitro 会热重载模块，
 * 进程句柄和日志必须跨模块实例存活，否则会重复拉起 ComfyUI。
 */
const globalRef = globalThis as typeof globalThis & { __forkvdoComfyRuntime?: ComfyRuntime }

export function getRuntime(): ComfyRuntime {
  globalRef.__forkvdoComfyRuntime ??= {
    log: [],
    install: { phase: 'idle', log: [] },
  }
  return globalRef.__forkvdoComfyRuntime
}

export function appendLog(target: string[], text: string) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim())
      continue
    target.push(line)
    if (target.length > LOG_LIMIT)
      target.splice(0, target.length - LOG_LIMIT)
  }
}

export function appendRuntimeLog(text: string) {
  appendLog(getRuntime().log, text)
}

export function appendInstallLog(text: string) {
  appendLog(getRuntime().install.log, text)
}

export function isChildAlive(child?: ChildProcess): boolean {
  return Boolean(child && child.exitCode === null && child.signalCode === null)
}

export function invalidateObjectInfo() {
  getRuntime().objectInfo = undefined
}

export function setCachedObjectInfo(info: ComfyObjectInfo) {
  getRuntime().objectInfo = info
}

export function getCachedObjectInfo(): ComfyObjectInfo | undefined {
  return getRuntime().objectInfo
}
