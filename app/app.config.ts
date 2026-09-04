export default defineAppConfig({
  ui: {
    colors: {
      primary: 'signal',
      neutral: 'zinc',
    },

    // 统一的视觉基线：所有组件共用同一套圆角、字重与内边距节奏
    button: {
      slots: {
        base: 'rounded-md font-550 tracking-normal transition duration-150 active:translate-y-px disabled:opacity-40 disabled:saturate-0 aria-disabled:opacity-40 aria-disabled:saturate-0',
      },
      defaultVariants: {
        size: 'md',
      },
    },

    card: {
      slots: {
        root: 'rounded-lg border border-default bg-default shadow-soft',
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
        base: 'rounded-md font-550',
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
  },
})
