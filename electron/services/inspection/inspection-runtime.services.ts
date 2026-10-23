import { MainWindowService } from './main-window.services.js'
import { ParseService } from './parse.services.js'
import { batchSaveSellDataAPI, saveSellListDataAPI, updateTaskStatusAPI } from './api.services.js'
import { memoryMonitor } from '../common/memory-monitor.services.js'
import log from '../../log/index.js'
import type { InspectionDependencies } from './index.services.js'

export const inspectionDependencies: InspectionDependencies = {
  createServices(onClosed, onVerification) {
    const main = new MainWindowService(onClosed, onVerification)
    return { main, parse: new ParseService(main) }
  },
  saveBatch: batchSaveSellDataAPI, saveSellers: saveSellListDataAPI, updateStatus: updateTaskStatusAPI,
  log, metrics: data => memoryMonitor.trackBusinessMetrics(data),
}
