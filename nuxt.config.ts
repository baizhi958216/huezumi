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
    // 阿里云百炼 DashScope
    dashscopeApiKey: '',
    dashscopeWorkspaceId: '',
    dashscopeRegion: 'cn-beijing',
    dashscopeBaseUrl: '',
    dashscopeModel: 'wan3.0-video-prime',
    // MiniMax
    minimaxApiKey: '',
    minimaxGroupId: '',
    // 可灵 Kling
    klingAccessKey: '',
    klingSecretKey: '',
    // Seedance（火山方舟）
    seedanceApiKey: '',
    seedanceBaseUrl: '',
    seedanceModel: 'doubao-seedance-1-5-pro-251215',
    // RollDek WAN 3.0
    rolldekApiKey: '',
    rolldekBaseUrl: '',
    // Runway Dev
    runwayApiKey: '',
    runwayBaseUrl: '',
    runwayModel: 'gen4.5',
    // MiniMax / 可灵 / Seedance 均可通过对应 *_BASE_URL 覆盖默认接入点
    minimaxBaseUrl: '',
    klingBaseUrl: '',
    // 阿里云 OSS：配置完整后，输入素材和生成结果都会转存并返回 OSS URL
    ossAccessKeyId: '',
    ossAccessKeySecret: '',
    ossBucket: '',
    ossRegion: 'cn-beijing',
    ossEndpoint: '',
    ossPublicBaseUrl: '',
    ossPrefix: 'forkvdo/uploads',
    ossOutputPrefix: 'forkvdo/outputs',
    ossMaxOutputBytes: 1073741824,
    ossTransferTimeoutMs: 300000,
    public: {
      appUrl: 'http://localhost:3000',
    },
  },
  nitro: {
    storage: {
      data: {
        driver: 'fs',
        base: './.data',
      },
    },
    routeRules: {
      '/api/**': { cors: true },
    },
  },
  typescript: {
    strict: true,
  },
})
