import type { ComfyRuntimeStatus } from '#shared/types/workflow'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

interface Runtime {
  child?: ChildProcess
  starting?: Promise<ComfyRuntimeStatus>
  stopping?: Promise<ComfyRuntimeStatus>
  error?: string
  releasing?: Promise<void>
  lock?: string
}
const global = globalThis as typeof globalThis & { __huezumiComfy?: Runtime }
const state = global.__huezumiComfy ||= {}
function options() {
  const config = useRuntimeConfig()
  const enabled = String(config.comfyManaged) === 'true'
  const directory = resolve(String(config.comfyDirectory || 'vendor/ComfyUI'))
  const python = resolve(String(config.comfyPython || `${directory}/.venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`))
  const port = Number(config.comfyPort || 8188)
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid ComfyUI port')
  return { enabled, directory, python, port, cpu: String(config.comfyCpu) === 'true' }
}
async function ready() {
  try {
    return (await fetch(`http://127.0.0.1:${options().port}/system_stats`, { signal: AbortSignal.timeout(1500) })).ok
  }
  catch {
    return false
  }
}
export async function comfyRuntimeStatus(): Promise<ComfyRuntimeStatus> {
  const config = options()
  if (!config.enabled)
    return { state: 'disabled', managed: false, message: '本机进程托管未启用；可使用数据库配置的独立服务' }
  if (await ready())
    return { state: state.child ? 'running' : 'external', managed: Boolean(state.child), message: state.child ? undefined : '端口已有服务，本进程不会接管或停止它' }
  if (state.child)
    return { state: 'starting', managed: true }
  try {
    await access(config.python)
    await access(resolve(config.directory, 'main.py'))
  }
  catch {
    return { state: 'missing', managed: true, message: '请先执行 pnpm comfy:install 安装本地运行环境' }
  }
  return { state: state.error ? 'error' : 'stopped', managed: true, message: state.error }
}
export async function startComfyRuntime(): Promise<ComfyRuntimeStatus> {
  if (state.stopping)
    await state.stopping
  if (state.starting)
    return state.starting
  state.starting = (async () => {
    await state.releasing
    const current = await comfyRuntimeStatus()
    if (!['stopped', 'error'].includes(current.state))
      return current
    const config = options()
    const lock = resolve('.data/comfyui/process.lock')
    await mkdir(resolve('.data/comfyui'), { recursive: true })
    try {
      await mkdir(lock)
    }
    catch {
      const pid = Number(await readFile(resolve(lock, 'pid'), 'utf8').catch(() => '0'))
      let alive = true
      if (pid > 0) {
        try {
          process.kill(pid, 0)
        }
        catch (error) {
          alive = (error as NodeJS.ErrnoException).code !== 'ESRCH'
        }
      }
      if (alive)
        return { state: 'external', managed: false, message: '另一个平台进程管理此服务' }
      await rm(lock, { recursive: true })
      await mkdir(lock)
    }
    state.lock = lock
    await writeFile(resolve(lock, 'pid'), String(process.pid), { mode: 0o600 })
    const log = openSync(resolve('.data/comfyui/runtime.log'), 'a', 0o600)
    const args = ['main.py', '--listen', '127.0.0.1', '--port', String(config.port), '--disable-auto-launch', '--disable-metadata']
    if (config.cpu)
      args.push('--cpu')
    state.error = undefined
    // No user-controlled command, shell, bind address, or command-line flags.
    const child = spawn(config.python, args, { cwd: config.directory, shell: false, stdio: ['ignore', log, log], env: { PATH: process.env.PATH, HOME: process.env.HOME, SYSTEMROOT: process.env.SYSTEMROOT, PYTHONUNBUFFERED: '1' } })
    closeSync(log)
    state.child = child
    const cleanup = () => {
      if (state.child === child)
        state.child = undefined
      if (state.lock === lock) {
        state.lock = undefined
        state.releasing = rm(lock, { recursive: true, force: true })
      }
    }
    child.once('error', () => {
      state.error = 'ComfyUI 启动失败，请检查本机私有运行日志'
      cleanup()
    })
    child.once('exit', (code, signal) => {
      if (code && !signal)
        state.error = 'ComfyUI 异常退出，请检查本机私有运行日志'
      cleanup()
    })
    return { state: 'starting', managed: true }
  })()
  try {
    return await state.starting
  }
  finally {
    state.starting = undefined
  }
}
export async function stopComfyRuntime(): Promise<ComfyRuntimeStatus> {
  if (state.starting)
    await state.starting
  if (state.stopping)
    return state.stopping
  state.stopping = (async () => {
    const child = state.child
    if (!child)
      return comfyRuntimeStatus()
    await new Promise<void>((resolveStop) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolveStop()
      })
      child.kill('SIGTERM')
    })
    await state.releasing
    return { state: 'stopped', managed: true }
  })()
  try {
    return await state.stopping
  }
  finally {
    state.stopping = undefined
  }
}
