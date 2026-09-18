import type { Page, ProjectSummary } from '#shared/types/platform'

export async function useProjectOptions() {
  const { data: page, refresh } = await useFetch<Page<ProjectSummary>>('/api/projects')
  const extra = ref<ProjectSummary[]>([])
  const cursor = ref<string | null>(null)
  watch(page, () => {
    extra.value = []
    cursor.value = page.value?.nextCursor || null
  }, { immediate: true })
  const items = computed(() => [...(page.value?.items || []), ...extra.value])
  async function loadMore() {
    if (!cursor.value)
      return
    const next = await $fetch<Page<ProjectSummary>>('/api/projects', { query: { cursor: cursor.value } })
    extra.value.push(...next.items)
    cursor.value = next.nextCursor
  }
  return { items, cursor, loadMore, refresh }
}
