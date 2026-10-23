import { MainWindowService } from './main-window.services.js'
import { WindowService } from './1688-window.services.js'
import { ExcelService } from './excel.services.js'
import { DataProcessService } from './data-filter.services.js'
import { ParseService } from './parse.services.js'
import request from '../../utils/request.js'
import log from '../../log/index.js'
import { autoSaveData, autoUpGoods } from './interface.services.js'
import { memoryMonitor } from '../common/memory-monitor.services.js'
import type { CollectionDependencies } from './collection.services.js'

/** Electron 依赖留在组装层，生命周期和队列可直接在 Node 中测试。 */
export const collectionDependencies: CollectionDependencies = {
  createServices(onClosed, tableName, onVerification) {
    const main = new MainWindowService(onClosed, onVerification)
    const parse = new ParseService(main, log)
    return {
      main,
      parse,
      source: new WindowService(parse),
      data: new DataProcessService(),
      excel: new ExcelService(tableName),
    }
  },
  request: (config) => request(config),
  save: autoSaveData,
  upload: autoUpGoods,
  log,
  metrics: (data) => memoryMonitor.trackBusinessMetrics(data),
}
