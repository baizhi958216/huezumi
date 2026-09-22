export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
  },
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '绘小宙 — 创作属于自己的小宇宙',
      meta: [
        { name: 'description', content: '写故事、构思角色、探索画面、生成视频。绘小宙，陪你创作属于自己的小宇宙。' },
        { name: 'theme-color', content: '#fffaf3', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#211b18', media: '(prefers-color-scheme: dark)' },
        { property: 'og:title', content: '绘小宙 — 创作属于自己的小宇宙' },
        { property: 'og:description', content: '让每个小小的灵感都被看见，从故事与角色，到画面与视频。' },
        { property: 'og:image', content: '/images/huixiaozhou-universe.png' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400..700&family=Noto+Sans+SC:wght@400..700&display=swap' },
      ],
    },
  },
  runtimeConfig: {
    connectionEncryptionKey: '',
    // 宿主机开发连接 docker-compose.dev.yml；连接信息由私有 .env 提供。
    databaseUrl: '',
    workerEnabled: false, // 本机 PostgreSQL 队列由 .env 启用，生产 Web 保持关闭。
    workerConcurrency: 4,
    // OSS 兼容对象存储：可接阿里云 OSS 或本地 SeaweedFS
    ossAccessKeyId: '',
    ossAccessKeySecret: '',
    ossBucket: '',
    ossRegion: 'cn-beijing',
    ossEndpoint: '',
    ossSecure: '',
    ossPublicBaseUrl: '',
    ossPrefix: 'huezumi/uploads',
    ossOutputPrefix: 'huezumi/outputs',
    ossMaxOutputBytes: 1073741824,
    ossTransferTimeoutMs: 300000,
    ossSignedUrlTtlSeconds: 86400,
    // 启动时自动探活：本地已安装则按需启动，远程服务由外部管理
    comfyuiMode: 'auto',
    comfyuiDir: '',
    comfyuiPython: '',
    comfyuiHost: '127.0.0.1',
    comfyuiPort: 8188,
    comfyuiArgs: '',
    comfyuiRemoteBaseUrl: '',
    comfyuiCustomNodeSourceDir: '',
    // JSON remains private and is passed only to a local ComfyUI child process.
    comfyuiLlmConnectionsJson: '',
    comfyuiStartTimeoutMs: 180000,
    comfyuiProbeTimeoutMs: 1500,
    public: {
      appUrl: 'http://localhost:3000',
    },
  },
  nitro: {
    experimental: {
      // 工作流页面通过服务端的 WebSocket 代理接收 ComfyUI 的执行事件
      websocket: true,
    },
    storage: {
      data: {
        driver: 'fs',
        base: './.data',
      },
    },
  },
  typescript: {
    strict: true,
  },
})
