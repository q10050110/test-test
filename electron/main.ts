import { app, BrowserWindow } from 'electron'
import { createWindow } from './windows/main.window.js'
import log, { initLogger } from './log/index.js'
import { CloseProcessService } from './services/closeProcess.services.js'

// 重启相关常量
const RESTART_COUNT_KEY = 'restart-count'
const MAX_RESTART_COUNT = 3

// 初始化日志系统
initLogger()

/**
 * 获取重启次数
 */
function getRestartCount(): number {
  const args = process.argv;
  const restartArg = args.find(arg => arg.startsWith(`${RESTART_COUNT_KEY}=`));

  if (restartArg) {
    const countStr = restartArg.split('=')[1];
    const count = parseInt(countStr, 10);
    return isNaN(count) ? 0 : count;
  }

  return 0;
}

/**
 * 安全重启应用
 */
function safeRelaunch() {
  const currentCount = getRestartCount();

  if (currentCount >= MAX_RESTART_COUNT) {
    log.error(`重启次数已达上限(${MAX_RESTART_COUNT}次)，应用将退出`);
    app.exit(1);
    return;
  }

  const newCount = currentCount + 1;
  log.info(`第 ${newCount} 次尝试重启应用（最大允许${MAX_RESTART_COUNT}次）`);

  try {
    // 构造新的命令行参数，包含重启次数
    const args = [...process.argv.slice(1), `${RESTART_COUNT_KEY}=${newCount}`];
    app.relaunch({ args });
    app.exit(0);
  } catch (error) {
    log.error('应用重启失败:', error);
    app.exit(1);
  }
}

/**
 * 检查是否应该允许重启
 */
function shouldAllowRestart(): boolean {
  const restartCount = getRestartCount();

  if (restartCount === 0) {
    return true; // 首次启动总是允许
  }

  if (restartCount >= MAX_RESTART_COUNT) {
    log.warn(`重启次数已达上限(${MAX_RESTART_COUNT}次)，不再重启`);
    return false;
  }

  return true;
}

/**
 * 应用准备就绪
 */
app.whenReady().then(() => {
  log.info('应用准备就绪，开始创建窗口');

  // 记录重启次数
  const restartCount = getRestartCount();
  if (restartCount > 0) {
    log.info(`当前为第 ${restartCount} 次重启`);
  }

  try {
    createWindow();
    log.info('主窗口创建成功');
  } catch (error) {
    log.error('创建主窗口失败:', error);
  }

  // macOS 激活时创建窗口
  app.on('activate', () => {
    log.info('应用被激活');
    if (BrowserWindow.getAllWindows().length === 0) {
      log.info('没有打开的窗口，重新创建窗口');
      createWindow();
    }
  });
});

/**
 * 所有窗口关闭时退出应用（macOS 除外）
 */
app.on('window-all-closed', () => {
  log.info('所有窗口已关闭');
  if (process.platform !== 'darwin') {
    log.info('非 macOS 平台，退出应用');
    app.quit();
  }
});

/**
 * 应用退出前的清理工作
 */
app.on('before-quit', () => {
  new CloseProcessService().run();
  log.info('应用即将退出');
});

/** 
 * 渲染进程崩溃事件
 */
app.on('render-process-gone', (event, webContents, details) => {
  log.error('渲染进程崩溃详情:', details);

  if (details.reason === 'crashed') {
    log.info('检测到渲染进程崩溃，执行重启策略...');

    if (shouldAllowRestart()) {
      log.info('符合重启条件，正在重启应用...');
      safeRelaunch();
    } else {
      log.info('超出重启限制，应用将退出');
      app.quit();
    }
  }
});

/**
 * 未捕获异常处理
 */
process.on('uncaughtException', (error) => {
  log.error('未捕获的异常:', error);

  if (app.isReady()) {
    log.info('检测到未捕获异常，执行重启策略...');

    if (shouldAllowRestart()) {
      log.info('符合重启条件，正在重启应用...');
      safeRelaunch();
    } else {
      log.info('超出重启限制，应用将退出');
      app.exit(1);
    }
  }
});

/**
 * 未处理的Promise拒绝处理
 */
process.on('unhandledRejection', (reason, promise) => {
  log.error('未处理的Promise拒绝:', reason);

  if (app.isReady()) {
    log.info('检测到未处理的Promise拒绝，执行重启策略...');

    if (shouldAllowRestart()) {
      log.info('符合重启条件，正在重启应用...');
      safeRelaunch();
    } else {
      log.info('超出重启限制，应用将退出');
      app.exit(1);
    }
  }
});