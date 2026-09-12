import assert from 'node:assert/strict'
import { it } from 'vitest'
import { getAppNavigation, isAppNavigationActive } from '../app/utils/app-navigation'

it('exposes navigation items according to the current role', () => {
  assert.deepEqual(getAppNavigation(null).map(item => item.to), ['/studio', '/projects'])
  assert.deepEqual(getAppNavigation('user').map(item => item.to), ['/studio', '/projects', '/dashboard'])
  assert.deepEqual(getAppNavigation('admin').map(item => item.to), ['/studio', '/projects', '/dashboard', '/workflow', '/admin'])
})

it('matches a navigation item to its route subtree without matching prefixes', () => {
  assert.equal(isAppNavigationActive('/projects', '/projects'), true)
  assert.equal(isAppNavigationActive('/projects/task-1', '/projects'), true)
  assert.equal(isAppNavigationActive('/projects-archive', '/projects'), false)
  assert.equal(isAppNavigationActive('/', '/studio'), false)
})
