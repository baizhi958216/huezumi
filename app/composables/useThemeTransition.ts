export function useThemeTransition() {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')
  let isTransitioning = false
  let pointerOrigin: { x: number, y: number } | undefined

  function captureThemePointer(event: PointerEvent) {
    pointerOrigin = { x: event.clientX, y: event.clientY }
  }

  async function toggleTheme(event?: MouseEvent) {
    const origin = event?.detail === 0
      ? undefined
      : pointerOrigin ?? (event ? { x: event.clientX, y: event.clientY } : undefined)
    pointerOrigin = undefined
    const nextDark = !isDark.value
    const nextPreference = nextDark ? 'dark' : 'light'

    // 检查浏览器是否支持 View Transitions 以及用户是否开启减弱动效
    const supportsViewTransition
      = typeof document !== 'undefined'
        && 'startViewTransition' in document
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!supportsViewTransition) {
      colorMode.preference = nextPreference
      return
    }

    if (isTransitioning) {
      return
    }

    isTransitioning = true

    // 指针按下时记录坐标，避免按钮组件转发的 click 事件丢失原始位置。
    let x = origin?.x
    let y = origin?.y

    // 键盘触发时从按钮中心扩散；没有触发元素时使用视口中心。
    if (x === undefined || y === undefined) {
      const target = (event?.currentTarget || event?.target) as HTMLElement | null
      if (target && typeof target.getBoundingClientRect === 'function') {
        const rect = target.getBoundingClientRect()
        x = rect.left + rect.width / 2
        y = rect.top + rect.height / 2
      }
      else {
        x = window.innerWidth / 2
        y = window.innerHeight / 2
      }
    }

    // 计算从点击位置到达视口 4 个角的最大距离，作为扩散结束半径
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    document.documentElement.classList.add('theme-transitioning')

    try {
      const transition = document.startViewTransition(async () => {
        colorMode.preference = nextPreference
        if (nextDark) {
          document.documentElement.classList.add('dark')
        }
        else {
          document.documentElement.classList.remove('dark')
        }
        await nextTick()
      })

      await transition.ready

      const animation = document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 480,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )

      await Promise.allSettled([animation.finished, transition.finished])
    }
    catch {
      colorMode.preference = nextPreference
    }
    finally {
      document.documentElement.classList.remove('theme-transitioning')
      isTransitioning = false
    }
  }

  return {
    colorMode,
    isDark,
    captureThemePointer,
    toggleTheme,
  }
}
