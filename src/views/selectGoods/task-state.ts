import type { Task } from '@/types/selectGoods'
export type TaskViewState = Pick<Task, '_id' | 'taskStatus' | 'phase'>

export const taskStatusOptions = [
  { label: '未执行', value: 'noExecuted', color: '' },
  { label: '待执行', value: 'pending', color: 'warning' },
  { label: '执行中', value: 'running', color: 'processing' },
  { label: '已完成', value: 'completed', color: 'success' },
  { label: '失败', value: 'failed', color: 'error' },
  { label: '取消', value: 'cancelled', color: 'warning' },
]

export function isTaskClosing(task: TaskViewState, cancelRequested = false) {
  return cancelRequested || task.phase === 'stopping' || task.phase === 'cleaning'
}

export function isTaskBusy(task: TaskViewState, cancelRequested = false) {
  return (
    isTaskClosing(task, cancelRequested) ||
    task.taskStatus === 'running' ||
    task.taskStatus === 'pending'
  )
}

export function getTaskViewStatus(task: TaskViewState, cancelRequested = false) {
  if (cancelRequested || task.phase === 'stopping') return { label: '终止中', color: 'processing' }
  if (task.phase === 'cleaning') return { label: '收尾中', color: 'processing' }
  return (
    taskStatusOptions.find((option) => option.value === task.taskStatus) || taskStatusOptions[0]!
  )
}
