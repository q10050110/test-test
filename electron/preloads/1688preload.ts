import { ipcRenderer } from 'electron'

// preload1688.mjs
console.log('✅ preload for 1688 loaded')
const args = process.argv
const winIdArg = args.find((a) => a.startsWith('--winId='))
const winId = winIdArg?.split('=')[1]
// 每秒输出日志
const timer = setInterval(() => {
  const href = globalThis.location.href
  if (href.includes('tab=imageSearch') || href.includes('imageId')) {
    ipcRenderer.send(`result-page-${winId}`, winId)
    clearInterval(timer)
  }
}, 2000)
