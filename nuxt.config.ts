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
      title: 'forkvdo — AI 视频生成平台',
      meta: [
        { name: 'description', content: '支持文字、图片、视频和音频输入的 AI 视频生成平台。一套任务结构接入多家模型供应商。' },
        { name: 'theme-color', content: '#f7f8fa', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#08090b', media: '(prefers-color-scheme: dark)' },
        { property: 'og:title', content: 'forkvdo — AI 视频生成平台' },
        { property: 'og:description', content: '支持文生视频、首尾帧和多模态参考生成，最高 4K / 30 秒。' },
        { property: 'og:image', content: '/images/hero-cinematic.png' },
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
    ossPrefix: 'forkvdo/uploads',
    ossOutputPrefix: 'forkvdo/outputs',
    ossMaxOutputBytes: 1073741824,
    ossTransferTimeoutMs: 300000,
    ossSignedUrlTtlSeconds: 86400,
    // ComfyUI 工作流：本地托管或连接其他机器上已运行的服务
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
