import type { ComfyServiceConfig } from './config'
import { existsSync, lstatSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 把仓库维护的节点包挂载到本地 ComfyUI。不会覆盖运行时目录中的已有目录，
 * 这样本地安装的第三方节点不会被应用启动流程静默替换。
 */
export function ensureForkvdoCustomNode(config: ComfyServiceConfig) {
  if (!existsSync(join(config.customNodeSourceDir, '__init__.py')) || !existsSync(join(config.customNodeSourceDir, 'nodes.py'))) {
    throw new Error(`找不到 forkvdo ComfyUI 自定义节点源目录：${config.customNodeSourceDir}`)
  }

  const target = join(config.dir, 'custom_nodes', 'forkvdo_prompt')
  mkdirSync(dirname(target), { recursive: true })

  if (existsSync(target)) {
    const stats = lstatSync(target)
    if (!stats.isSymbolicLink())
      throw new Error(`ComfyUI 自定义节点目录已存在且不是 forkvdo 挂载：${target}`)
    if (realpathSync(target) !== realpathSync(config.customNodeSourceDir))
      throw new Error(`ComfyUI 自定义节点目录指向其他源：${target}`)
    return target
  }

  symlinkSync(config.customNodeSourceDir, target, 'dir')
  return target
}
