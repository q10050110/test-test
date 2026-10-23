import type { Inspection } from '@/types/inspection'
export const isInspectionClosing = (task: Inspection, requested = false) => requested || task.phase === 'stopping' || task.phase === 'cleaning'
export const isInspectionBusy = (task: Inspection, requested = false) => isInspectionClosing(task, requested) || task.status === 'pending' || task.status === 'running'
export function inspectionViewStatus(task: Inspection, requested = false) {
  if (requested || task.phase === 'stopping') return { label: '终止中', color: 'processing' }
  if (task.phase === 'cleaning') return { label: '收尾中', color: 'processing' }
  if (task.status === 'running') {
    if (task.verification?.phase === 'waiting') return { label: '等待验证', color: 'processing' }
    if (task.verification?.phase === 'verifying') return { label: `验证中（${task.verification.attempt ?? 1}/3）`, color: 'processing' }
    if (task.verification?.phase === 'retrying') return { label: '恢复请求中', color: 'processing' }
  }
  return ({
    noExecuted: { label: '未执行', color: '' }, pending: { label: '待执行', color: 'warning' },
    running: { label: '执行中', color: 'processing' }, completed: { label: '已完成', color: 'success' },
    failed: { label: '已失败', color: 'error' }, cancelled: { label: '已取消', color: 'warning' },
  })[task.status]
}
