import assert from 'node:assert/strict'
import { it } from 'vitest'
import { getAppNavigation, getStudioNavigation, isAppNavigationActive } from '../app/utils/app-navigation'

it('exposes navigation items according to the current role', () => {
  assert.deepEqual(getAppNavigation(null).map(item => item.to), ['/studio', '/projects'])
  assert.deepEqual(getAppNavigation('user').map(item => item.to), ['/studio', '/projects', '/dashboard'])
  assert.deepEqual(getAppNavigation('admin').map(item => item.to), ['/studio', '/projects', '/dashboard', '/admin'])
})

it('keeps creation modes in one role-aware header menu', () => {
  assert.deepEqual(getStudioNavigation('user').map(item => item.to), ['/studio', '/studio/video'])
  assert.deepEqual(getStudioNavigation('admin').map(item => item.to), ['/studio', '/studio/video', '/studio/workflow'])
})

it('matches a navigation item to its route subtree without matching prefixes', () => {
  assert.equal(isAppNavigationActive('/projects', '/projects'), true)
  assert.equal(isAppNavigationActive('/projects/task-1', '/projects'), true)
  assert.equal(isAppNavigationActive('/projects-archive', '/projects'), false)
  assert.equal(isAppNavigationActive('/', '/studio'), false)
  assert.equal(isAppNavigationActive('/studio/video', '/studio'), true)
  assert.equal(isAppNavigationActive('/studio/workflow', '/studio'), true)
})
