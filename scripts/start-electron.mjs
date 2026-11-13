import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

export async function waitForVite(url, { timeoutMs = 120_000, retryMs = 250, requestTimeoutMs = 3000 } = {}) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    try {
      const remaining = Math.max(1, Math.ceil(deadline - performance.now()))
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)) })
      const html = await response.text()
      if (response.ok && html.includes('/@vite/client')) return
    } catch {
      // Vite 加载配置和首个页面期间继续等待。
    }
    await delay(Math.max(0, Math.min(retryMs, deadline - performance.now())))
  }
  throw new Error(`等待 Vite 开发页面超时（${timeoutMs}ms）：${url}`)
}

export async function startElectron({
  serverUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000',
  args = process.argv.slice(2),
  wait = waitForVite,
  launch = spawn,
} = {}) {
  const url = new URL('login', `${serverUrl.replace(/\/$/, '')}/`).href
  console.log(`等待 Vite 开发页面就绪：${url}`)
  await wait(url)
  const hasInspector = args.some(arg => /^--inspect(?:-brk)?(?:=|$)/.test(arg))
  return launch(electron, [...(hasInspector ? [] : ['--inspect=0']), ...args, '.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: serverUrl },
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const child = await startElectron()
    child.once('error', error => {
      console.error('启动 Electron 失败:', error)
      process.exitCode = 1
    })
    child.once('exit', code => { process.exitCode = code ?? 1 })
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
