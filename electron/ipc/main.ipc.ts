import { BrowserWindow } from 'electron'
import { accountIpc } from './account.ipc.js'
import { storeIpc } from './store.ipc.js'
import { windowIpc } from './system.ipc.js'
import { collectionIpc } from './collection.ipc.js'
import { registerLogIpc } from './log.ipc.js'

export const resisterAllIpc = (win: BrowserWindow) => {
  accountIpc(win)
  storeIpc()
  windowIpc(win)
  collectionIpc(win)
  registerLogIpc()
}


