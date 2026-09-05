import type { ComfyUIMode } from '#shared/types/comfyui'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

export interface ComfyServiceConfig {
  mode: ComfyUIMode
  /** 本地仓库目录（绝对路径） */
  dir: string
  host: string
  port: number
  extraArgs: string[]
  remoteBaseUrl: string
  startTimeoutMs: number
  /** 就绪探测的单次超时 */
  probeTimeoutMs: number
}

function expandHome(input: string): string {
  if (!input.startsWith('~'))
    return input
  return join(homedir(), input.slice(1).replace(/^[/\\]/, ''))
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function splitArgs(value: unknown): string[] {
  const raw = String(value ?? '').trim()
  if (!raw)
    return []
  // 允许 shell 风格的空格分隔与引号包裹，例如 --preview-method "auto"
  return raw.match(/(?:[^\s"']|"[^"]*"|'[^']*')+/g)?.map(part => part.replace(/^["']|["']$/g, '')) ?? []
}

function hasCommand(command: string): boolean {
  const paths = (process.env.PATH ?? '').split(':').filter(Boolean)
  return paths.some(dir => existsSync(join(dir, command)))
}

/** 解析接入模式：显式配置优先，auto 下配置了远端地址即走 remote。 */
export function resolveMode(mode: unknown, remoteBaseUrl: string): ComfyUIMode {
  const value = String(mode ?? 'auto').toLowerCase()
  if (value === 'remote')
    return 'remote'
  if (value === 'local')
    return 'local'
  return remoteBaseUrl ? 'remote' : 'local'
}

export function getComfyConfig(): ComfyServiceConfig {
  const config = useRuntimeConfig()
  const remoteBaseUrl = String(config.comfyuiRemoteBaseUrl || '').trim().replace(/\/+$/, '')
  const mode = resolveMode(config.comfyuiMode, remoteBaseUrl)
  if (process.env.NODE_ENV === 'production' && (mode !== 'remote' || !remoteBaseUrl)) {
    throw createError({
      statusCode: 503,
      statusMessage: '生产环境的 ComfyUI 必须配置为 remote 模式并提供远程地址',
    })
  }
  const configuredDir = String(config.comfyuiDir || '').trim()
  const dir = configuredDir
    ? resolve(expandHome(configuredDir))
    : resolve(process.cwd(), 'vendor', 'ComfyUI')
  const host = String(config.comfyuiHost || '127.0.0.1').trim() || '127.0.0.1'
  const port = toNumber(config.comfyuiPort, 8188)

  return {
    mode,
    dir,
    host,
    port,
    extraArgs: splitArgs(config.comfyuiArgs),
    remoteBaseUrl,
    startTimeoutMs: toNumber(config.comfyuiStartTimeoutMs, 180000),
    probeTimeoutMs: toNumber(config.comfyuiProbeTimeoutMs, 1500),
  }
}

/** 服务端访问 ComfyUI 的基地址。本地模式恒为本机地址，浏览器不会直接使用。 */
export function getComfyBaseUrl(config: ComfyServiceConfig = getComfyConfig()): string {
  if (config.mode === 'remote')
    return config.remoteBaseUrl
  return `http://${config.host}:${config.port}`
}

/**
 * 选择解释器：仓库内虚拟环境优先，其次是显式配置，最后回落到 PATH 上的 python3。
 * 返回 null 表示找不到可用解释器。
 */
export function resolvePythonBin(config: ComfyServiceConfig = getComfyConfig()): string | null {
  const venvCandidates = [
    join(config.dir, '.venv', 'bin', 'python'),
    join(config.dir, '.venv', 'bin', 'python3'),
    join(config.dir, 'venv', 'bin', 'python'),
    join(config.dir, 'venv', 'bin', 'python3'),
  ]
  for (const candidate of venvCandidates) {
    if (existsSync(candidate))
      return candidate
  }

  const configured = String(useRuntimeConfig().comfyuiPython || '').trim()
  if (configured) {
    const expanded = expandHome(configured)
    const absolute = isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded)
    if (existsSync(absolute))
      return absolute
  }

  for (const candidate of ['python3', 'python']) {
    if (hasCommand(candidate))
      return candidate
  }
  return null
}

/** 建虚拟环境用的工具：uv 更快，缺失时回落到标准库 venv。 */
export function resolveVenvTool(): 'uv' | 'venv' {
  return hasCommand('uv') ? 'uv' : 'venv'
}
