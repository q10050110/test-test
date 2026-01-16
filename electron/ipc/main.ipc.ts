import { BrowserWindow } from 'electron'
import { accountIpc } from './account.ipc.ts'
import { storeIpc } from './store.ipc.ts'
import { windowIpc } from './system.ipc.ts'
export const resisterAllIpc = (win: BrowserWindow) => {
  accountIpc(win)
  storeIpc()
  windowIpc(win)
}

