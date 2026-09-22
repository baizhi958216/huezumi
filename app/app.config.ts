export default defineAppConfig({
  ui: {
    colors: {
      primary: 'signal',
      neutral: 'stone',
      secondary: 'lime',
      info: 'amber',
      success: 'lime',
    },

    // 统一的视觉基线：所有组件共用同一套圆角、字重与内边距节奏
    button: {
      slots: {
        base: 'rounded-xl font-550 tracking-normal transition duration-150 active:translate-y-px disabled:opacity-40 disabled:saturate-0 aria-disabled:opacity-40 aria-disabled:saturate-0',
      },
      defaultVariants: {
        size: 'md',
      },
    },

    card: {
      slots: {
        root: 'rounded-xl border border-default bg-default shadow-soft',
        body: 'p-5',
        header: 'p-5 pb-0',
        footer: 'p-5 pt-0',
      },
    },

    input: {
      slots: {
        base: 'rounded-md',
      },
    },

    textarea: {
      slots: {
        base: 'rounded-md leading-6',
      },
    },

    select: {
      slots: {
        base: 'rounded-md',
      },
    },

    badge: {
      slots: {
        base: 'rounded-xl font-550',
      },
    },

    formField: {
      slots: {
        label: 'type-label mb-1.5',
        help: 'type-caption mt-1.5',
        error: 'type-caption mt-1.5',
        hint: 'type-caption',
        description: 'type-caption mt-1.5',
      },
    },

    checkbox: {
      slots: {
        label: 'text-sm font-normal',
        description: 'text-xs text-dimmed',
      },
    },

    progress: {
      slots: {
        base: 'rounded-full',
      },
    },

    tooltip: {
      slots: {
        content: 'rounded-md px-3 py-1.5 text-xs shadow-card',
      },
    },

    modal: {
      slots: {
        wrapper: 'min-w-0 pe-8',
        overlay: 'fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md',
        content: 'rounded-2xl border border-default/70 dark:border-white/10 bg-elevated/95 dark:bg-elevated/95 shadow-cinema backdrop-blur-2xl divide-y-0',
      },
      variants: {
        transition: {
          true: {
            overlay: 'data-[state=open]:animate-[fade-in_250ms_ease-out] data-[state=closed]:animate-[fade-out_180ms_ease-in]',
            content: 'data-[state=open]:animate-[scale-in_280ms_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[scale-out_180ms_ease-in]',
          },
        },
      },
    },
  },
})
