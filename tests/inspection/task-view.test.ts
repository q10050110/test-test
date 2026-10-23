import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectionViewStatus, isInspectionBusy, isInspectionClosing } from '../../src/views/automaticInspection/task-state.js'
import type { Inspection } from '../../src/types/inspection.js'
test('pending and closing inspection tasks stay locked until the final snapshot', () => {
  const task = { status: 'pending' } as Inspection
  assert.equal(isInspectionBusy(task), true)
  assert.equal(inspectionViewStatus(task).label, '待执行')
  assert.equal(inspectionViewStatus(task, true).label, '终止中')
  task.status = 'cancelled'; task.phase = 'stopping'
  assert.equal(isInspectionBusy(task), true)
  assert.equal(isInspectionClosing(task), true)
  task.phase = 'cancelled'
  assert.equal(isInspectionBusy(task), false)
})
test('verification is displayed without disabling the ability to cancel', () => {
  const task = { status: 'running', verification: { phase: 'verifying', attempt: 3 } } as Inspection
  assert.equal(inspectionViewStatus(task).label, '验证中（3/3）')
  assert.equal(isInspectionClosing(task), false)
  task.phase = 'cleaning'
  assert.equal(inspectionViewStatus(task).label, '收尾中')
})
