import { spawn } from 'node:child_process'
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const directory = resolve(root, 'vendor/ComfyUI')
const bootstrap = resolve(root, '.data/comfyui/bootstrap')
const executable = (base: string, name: string) => resolve(base, process.platform === 'win32' ? `Scripts/${name}.exe` : `bin/${name}`)
async function run(command: string, args: string[], cwd = root) {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)))
  })
}
async function exists(path: string) {
  return access(path).then(() => true, () => false)
}
const lock = JSON.parse(await readFile(resolve(root, 'integrations/comfyui/runtime.json'), 'utf8')) as { commit: string }
if (!await exists(resolve(directory, '.git'))) {
  await mkdir(resolve(root, 'vendor'), { recursive: true })
  await run('git', ['init', directory])
  await run('git', ['remote', 'add', 'origin', 'https://github.com/Comfy-Org/ComfyUI.git'], directory)
  await run('git', ['fetch', '--depth', '1', 'origin', lock.commit], directory)
  await run('git', ['checkout', '--detach', 'FETCH_HEAD'], directory)
}
else {
  // Never reset an operator's third-party node or runtime changes.
  console.log('保留现有 ComfyUI 检出，不自动更新或重置。')
}
if (!await exists(executable(bootstrap, 'python'))) {
  await mkdir(resolve(root, '.data/comfyui'), { recursive: true })
  await run(process.env.COMFY_BOOTSTRAP_PYTHON || 'python3', ['-m', 'venv', bootstrap])
  await run(executable(bootstrap, 'python'), ['-m', 'pip', 'install', 'uv==0.8.22'])
}
const uv = executable(bootstrap, 'uv')
const python = executable(resolve(directory, '.venv'), 'python')
if (!await exists(python))
  await run(uv, ['venv', '--python', '3.12', resolve(directory, '.venv')])
await run(uv, ['pip', 'install', '--python', python, '-r', 'requirements.txt'], directory)
await cp(resolve(root, 'integrations/comfyui/huezumi_nodes'), resolve(directory, 'custom_nodes/huezumi_nodes'), { recursive: true })
await writeFile(resolve(root, '.data/comfyui/installation.json'), JSON.stringify({ requestedCommit: lock.commit, installedAt: new Date().toISOString() }))
console.log('ComfyUI 已安装。pnpm dev 随项目启动；管理员可在工作流页面控制启停。模型权重需自行配置。')
