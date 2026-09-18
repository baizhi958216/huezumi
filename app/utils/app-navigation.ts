export type AppNavigationRole = 'user' | 'admin' | null | undefined

export interface AppNavigationItem {
  label: string
  to: string
  icon: string
}

const publicItems: AppNavigationItem[] = [
  { label: '创作台', to: '/studio', icon: 'i-lucide-clapperboard' },
  { label: '作品库', to: '/projects', icon: 'i-lucide-library' },
]

const userItem: AppNavigationItem = {
  label: '我的空间',
  to: '/dashboard',
  icon: 'i-lucide-layout-dashboard',
}

const adminItems: AppNavigationItem[] = [
  { label: '控制面板', to: '/admin', icon: 'i-lucide-shield-check' },
]

export function getAppNavigation(role: AppNavigationRole): AppNavigationItem[] {
  return [
    ...publicItems,
    ...(role ? [userItem] : []),
    ...(role === 'admin' ? adminItems : []),
  ]
}

export function getStudioNavigation(role: AppNavigationRole): AppNavigationItem[] {
  return [
    { label: '文案剧本', to: '/studio', icon: 'i-lucide-file-pen-line' },
    { label: '视频生成', to: '/studio/video', icon: 'i-lucide-video' },
    ...(role === 'admin'
      ? [{ label: '图片与工作流', to: '/studio/workflow', icon: 'i-lucide-workflow' }]
      : []),
  ]
}

export function isAppNavigationActive(path: string, target: string): boolean {
  return path === target || path.startsWith(`${target}/`)
}
