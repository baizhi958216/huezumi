import type { ComfyWidgetSpec } from '../../shared/types/comfyui'

/** A single file replaces the selected slot; batches only fill empty slots. */
export function getUploadTargets(widgets: ComfyWidgetSpec[], values: Record<string, unknown>, targetName: string, count: number): ComfyWidgetSpec[] {
  const start = widgets.findIndex(widget => widget.name === targetName)
  const selected = widgets[start]
  if (!selected?.uploadType)
    return []
  const targets = count <= 1
    ? [selected]
    : widgets.slice(start)
        .filter(widget => widget.uploadType === selected.uploadType && !values[widget.name])
  if (count > targets.length)
    throw new Error(`需要 ${count} 个空槽，目标位置之后只有 ${targets.length} 个；请清空槽位或减少图片。`)
  return targets.slice(0, count)
}

/** Advance the seed for the next run only after the current prompt is accepted. */
export function nextSeedValues(widgets: ComfyWidgetSpec[], values: Record<string, unknown>, random = Math.random): Record<string, unknown> {
  const next = { ...values }
  widgets.forEach((widget, index) => {
    if (widget.kind !== 'CONTROL_AFTER_GENERATE')
      return
    const seed = widgets[index - 1]
    if (seed?.kind !== 'INT')
      return
    const minimum = seed.options.min ?? 0
    const maximum = Math.min(seed.options.max ?? 0xFFFFFFFF, Number.MAX_SAFE_INTEGER)
    const current = Number(values[seed.name] ?? minimum)
    switch (values[widget.name]) {
      case 'increment':
        next[seed.name] = current >= maximum ? minimum : current + 1
        break
      case 'decrement':
        next[seed.name] = current <= minimum ? maximum : current - 1
        break
      case 'randomize':
        next[seed.name] = minimum + Math.floor(random() * (Math.min(maximum, 0xFFFFFFFF) - minimum + 1))
        break
    }
  })
  return next
}
