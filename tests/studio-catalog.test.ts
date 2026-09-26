import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ rows: [] as unknown[][] }))
vi.mock('../server/database/client', () => ({
  useDatabase: () => ({
    select: () => {
      const rows = state.rows.shift()
      const query: any = { then: (resolve: (value: unknown) => void) => resolve(rows) }
      for (const method of ['from', 'where', 'innerJoin', 'orderBy'])
        query[method] = () => query
      return query
    },
  }),
}))
const { listModels } = await import('../server/services/platform/connections')
const id = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
function connection(connectionId: string, enabled = true) {
  return { c: { id: connectionId, name: '测试连接', kind: 'text', enabled }, v: { settings: { models: ['first', 'assigned'], defaultModel: 'assigned' } } }
}
beforeEach(() => {
  state.rows = []
})
it('only exposes the assigned connection default, regardless of list order', async () => {
  state.rows = [[{ value: { defaultTextConnectionId: id } }], [connection(otherId), connection(id)], [{ connectionId: id, model: 'assigned' }], []]
  expect(await listModels()).toMatchObject([{ connectionId: id, model: 'assigned', available: true }])
})
it('does not choose another connection when no service is assigned', async () => {
  state.rows = [[], [connection(otherId)], [{ connectionId: otherId, model: 'assigned' }], []]
  expect(await listModels()).toEqual([])
})
it('does not fall back to a priced model when the assigned model has no price', async () => {
  state.rows = [[{ value: { defaultTextConnectionId: id } }], [connection(id)], [{ connectionId: id, model: 'first' }], []]
  expect(await listModels()).toMatchObject([{ model: 'assigned', available: false }])
})
it('keeps disabled assignments unavailable rather than choosing another service', async () => {
  state.rows = [[{ value: { defaultTextConnectionId: id } }], [connection(otherId), connection(id, false)], [{ connectionId: id, model: 'assigned' }], []]
  expect(await listModels()).toMatchObject([{ connectionId: id, available: false }])
})
