import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getTaskViewStatus,
  isTaskBusy,
  isTaskClosing,
} from '../../src/views/selectGoods/task-state.js'
import type { Task } from '../../src/types/selectGoods.js'

const task = (changes: Partial<Task>): Task => ({
  _id: 'task-1',
  taskName: 'test',
  targetUrl: '',
  aiSelectType: 1,
  expendType: false,
  taskStatus: 'running',
  ...changes,
})

test('clicking cancel immediately displays stopping without claiming cancellation has completed', () => {
  const row = task({ phase: 'collecting' })
  assert.equal(getTaskViewStatus(row, true).label, '终止中')
  assert.equal(isTaskClosing(row, true), true)
  assert.equal(isTaskBusy(row, true), true)
  assert.equal(row.taskStatus, 'running')
})

test('main-process stopping phase restores UI state after page reload', () => {
  const row = task({ phase: 'stopping' })
  assert.equal(getTaskViewStatus(row).label, '终止中')
  assert.equal(isTaskClosing(row), true)
  assert.equal(isTaskBusy(row), true)
})

test('terminal status cannot unlock controls while manager still owns cleanup', () => {
  const row = task({ taskStatus: 'cancelled', phase: 'stopping' })
  assert.equal(isTaskBusy(row), true)
  assert.equal(getTaskViewStatus(row).label, '终止中')
  const completed = task({ taskStatus: 'completed', phase: 'cleaning' })
  assert.equal(isTaskBusy(completed), true)
  assert.equal(getTaskViewStatus(completed).label, '收尾中')
})

test('final cancellation unlocks controls after cleanup is confirmed', () => {
  const row = task({ taskStatus: 'cancelled', phase: 'cancelled' })
  assert.equal(isTaskBusy(row), false)
  assert.equal(isTaskClosing(row), false)
  assert.equal(getTaskViewStatus(row).label, '取消')
})

test('a rejected cancellation request restores the original state instead of reporting cancelled', () => {
  const row = task({ phase: 'collecting' })
  assert.equal(getTaskViewStatus(row, true).label, '终止中')
  assert.equal(getTaskViewStatus(row, false).label, '执行中')
  assert.equal(row.taskStatus, 'running')
})

test('verification is visible while running and never overrides stopping or cleaning', () => {
  const row = task({ verification: { phase: 'verifying', attempt: 3 } })
  assert.equal(getTaskViewStatus(row).label, '验证中（3/3）')
  assert.equal(isTaskBusy(row), true)
  assert.equal(isTaskClosing(row), false)
  assert.equal(getTaskViewStatus(row, true).label, '终止中')
  row.phase = 'cleaning'
  assert.equal(getTaskViewStatus(row).label, '收尾中')
  row.phase = 'collecting'
  row.verification = { phase: 'ready' }
  assert.equal(getTaskViewStatus(row).label, '执行中')
})
