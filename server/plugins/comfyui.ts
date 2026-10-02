import { startComfyRuntime, stopComfyRuntime } from '../services/comfyui/runtime'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', async () => {
    await stopComfyRuntime()
  })
  if (String(useRuntimeConfig().comfyAutoStart) === 'true')
    void startComfyRuntime().catch(() => console.error('ComfyUI autostart failed; inspect local runtime log'))
})
