import { BrowserWindow, app } from 'electron'
import log from '../../log/index.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export class MainWindowService {
  private browserWindow: BrowserWindow | null = null
  private isCheck: boolean = false
  private closeHandle: (() => void) | null = null
  constructor(closeHandle: () => void) {
    this.closeHandle = closeHandle
  }
  /**
   * 创建采集窗口
   */
  createCollectionWindow(url: string) {
    return new Promise((resolve, reject) => {
      let settled = false
      const safeResolve = (v: any) => {
        if (settled) return
        settled = true
        resolve(v)
      }
      const safeReject = (e: any) => {
        if (settled) return
        settled = true
        reject(e)
      }
      this.browserWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: true,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          webSecurity: false
        },
      })
      const timeoutId = setTimeout(() => {
        if (this.browserWindow) {
          this.destroy()
        }
        safeReject('页面加载超时')
      }, 100000)

      // 监听页面加载完成事件
      this.browserWindow.webContents.once('dom-ready', async () => {
        log.info('页面 DOM 已准备就绪')
        clearTimeout(timeoutId)
        await this.checkPage()
        safeResolve(this.browserWindow)
      })

      // 监听窗口关闭事件
      this.browserWindow.once('closed', () => {
        this.closeHandle && this.closeHandle()
      })

      this.browserWindow.loadURL(url)
    })
  }

  /** 
   * 注入opencv.js
    */
  async injectOpenCV() {
    try {
      // 1. 注入 OpenCV 并等待加载完成
      const opencvPath = app.isPackaged
        ? path.join(process.resourcesPath, 'preloads', 'opencv.js')
        : path.join(__dirname, '..', '..', 'preloads', 'opencv.js');
      if (!fs.existsSync(opencvPath)) {
        throw new Error(`OpenCV file not found at ${opencvPath}`)
      }

      const opencvContent = fs.readFileSync(opencvPath, 'utf-8')
      await this.browserWindow?.webContents.executeJavaScript(`
            (function() {
              return new Promise((resolve, reject) => {
                if (window.cv && window.cv.imread) {
                  resolve('already loaded');
                  return;
                }
                
                try {
                  // 执行本地读取到的脚本内容
                  ${opencvContent}
                  
                  // 等待 cv 初始化
                  let retries = 0;
                  const timer = setInterval(() => {
                    if (window.cv && window.cv.imread) {
                      clearInterval(timer);
                      resolve('loaded');
                    } else {
                      retries++;
                      if (retries > 50) {
                        clearInterval(timer);
                        reject('init timeout');
                      }
                    }
                  }, 100);
                } catch (e) {
                  reject(e);
                }
              });
            })()
          `);

      log.info('OpenCV 注入并初始化成功');
    } catch (error) {
      log.error('OpenCV 注入失败:', error);
    }
  }
  /**
   * 获取domin
   */
  async getDomain() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      return ''
    }
    const wc = this.browserWindow.webContents
    const domain = new URL(wc.getURL()).origin
    return domain
  }

  /** 
   * 进入页面前的检查
    */
  async checkPage() {
    try {
      if (!this.browserWindow || this.browserWindow.isDestroyed()) {
        return
      }
      const wc = this.browserWindow.webContents
      if (!this.isCheck) {
        this.isCheck = true
        // 1. 点击
        const result = await wc.executeJavaScript(`
        (() => {
          try {
            const p = document.querySelector('body > div.con p.h')
            if (!p) return { ok: false, reason: 'p not found' }

            const btn = document.querySelector('.rb')
            if (!btn) return { ok: false, reason: 'btn not found' }
            
            btn.click()
            return { ok: true }
          } catch (e) {
            return {
              ok: false,
              error: e?.message || String(e)
            }
          }
        })()
      `)
        log.info('点击结果:', result)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const result2 = await wc.executeJavaScript(`
        (() => {
          try {
            const slider = document.querySelector('#slider');
            return { ok: slider ? true : false }
          } catch (e) {
            return {
              ok: false,
              error: e?.message || String(e)
            }
          }
        })()
      `)
        if (result2?.ok) {
          try {
            await this.injectOpenCV()
            await this.sliderVerification()
          } catch (error) {
            log.error('注入opencv失败')
          }
        }
      }
    } catch (error) {
      log.error('页面检查失败:', error)
    }
  }

  /**
   * 获取页面
   */
  async getHTML() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      return { html: undefined, domain: '' }
    }
    const wc = this.browserWindow.webContents
    const html = await wc.executeJavaScript('document.documentElement.outerHTML')
    const domain = new URL(wc.getURL()).origin
    return { html, domain }
  }
  /**
   * 滚动页面
   */
  async scrollPage() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return false

    try {
      const result = await this.browserWindow.webContents.executeJavaScript(`(function () {
        return new Promise(resolve => {
          const startY = window.scrollY;
          const windowHeight = window.innerHeight;
          const documentHeight = document.documentElement.scrollHeight;

          const scrollAmount = Math.floor(windowHeight * (0.65 + Math.random() * 0.25))
          const targetY = Math.min(
            startY + scrollAmount,
            documentHeight - windowHeight
          );

          if (startY >= documentHeight - windowHeight - 10) {
            resolve(false);
            return;
          }

          const duration = 1000 + Math.random() * 3000; // 滚动时长 ms
          const startTime = performance.now();

          function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = progress < 0.5
              ? 2 * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            window.scrollTo(0, startY + (targetY - startY) * ease);

            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              resolve(true);
            }
          }

          requestAnimationFrame(step);
        });
      })();`)
      return result === true
    } catch (error) {
      throw new Error(error as string)
    }
  }

  /**
   * 获取跟卖数据
   */
  async getSellingData(requestUrl: string) {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return
    try {
      return await this.browserWindow.webContents.executeJavaScript(`
      (async () => {
        try {
          const response = await fetch(
            ${JSON.stringify(requestUrl)},
            {
              credentials: 'include'
            }
          )
          const contentType =
            response.headers.get('content-type') || ''
          let data
          if (contentType.includes('application/json')) {
            data = await response.json()
          } else {
            data = await response.text()
          }
          return {
            success: response.ok,
            status: response.status,
            contentType,
            data
          }
        } catch (error) {
          return {
            success: false,
            status: 0,
            error: error?.message || String(error)
          }
        }
      })()
    `)
    } catch (error) {
      return false
    }
  }

  /** 将拼图对齐后释放滑块；success 表示完成拖动，服务端验证结果仍由页面处理。 */
  async sliderVerification() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return
    const wc = this.browserWindow.webContents
    try {
      const result = await wc.executeJavaScript(`
        (async () => {
          try {
            const cv = window.cv;
            let bgImg = document.querySelector('#image');
            let puzzleImg = document.querySelector('#puzzle');
            const slider = document.querySelector('#slider');
            
            // 1. 基础检查
            if (!cv || !cv.imread) {
              console.error('OpenCV 未加载');
              return { success: false, reason: 'opencv_not_loaded' };
            }
            if (!bgImg || !puzzleImg || !slider) {
              console.error('找不到 #image / #puzzle / #slider');
              return { success: false, reason: 'elements_not_found' };
            }

            // dom-ready 不代表验证码图片已经解码；重试过程中图片节点也可能被替换。
            const deadline = performance.now() + 5000;
            while (true) {
              bgImg = document.querySelector('#image');
              puzzleImg = document.querySelector('#puzzle');
              if (bgImg?.complete && bgImg.naturalWidth > 0 &&
                  puzzleImg?.complete && puzzleImg.naturalWidth > 0 &&
                  bgImg.getBoundingClientRect().width > 0 &&
                  puzzleImg.getBoundingClientRect().width > 0 &&
                  slider.getBoundingClientRect().width > 0) break;
              if (performance.now() >= deadline) {
                return { success: false, reason: 'images_not_ready' };
              }
              await new Promise(resolve => setTimeout(resolve, 50));
            }

            const bgRect = bgImg.getBoundingClientRect();
            const puzzleRect = puzzleImg.getBoundingClientRect();
            // OpenCV 使用背景图原始像素；PointerEvent 使用视口 CSS 像素。
            // rect 包含 #captcha 的 transform: scale(--scale)，不能用 style.left 混算。
            const bgScaleX = bgRect.width / bgImg.naturalWidth;
            const bgScaleY = bgRect.height / bgImg.naturalHeight;
            const templateWidth = Math.round(puzzleRect.width / bgScaleX);
            const templateHeight = Math.round(puzzleRect.height / bgScaleY);
            if (![bgScaleX, bgScaleY, templateWidth, templateHeight].every(value => Number.isFinite(value) && value > 0) ||
                templateWidth > bgImg.naturalWidth || templateHeight > bgImg.naturalHeight) {
              return { success: false, reason: 'invalid_image_geometry' };
            }
            const bgSource = bgImg.currentSrc;
            const puzzleSource = puzzleImg.currentSrc;
            const isCurrentCaptcha = () => bgImg === document.querySelector('#image') &&
              puzzleImg === document.querySelector('#puzzle') && slider.isConnected &&
              bgImg.currentSrc === bgSource && puzzleImg.currentSrc === puzzleSource;

            // 2. 辅助函数：Image -> Canvas
            function imageToCanvas(img, width = img.naturalWidth, height = img.naturalHeight) {
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(img, 0, 0, width, height);
              return canvas;
            }

            // 3. 辅助函数：获取 Alpha 通道边界
            function getAlphaBounds(img) {
              // 拼图与背景即使分辨率不同，也先归一到相同的背景像素坐标系。
              const canvas = imageToCanvas(img, templateWidth, templateHeight);
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              const { width, height } = canvas;
              const imageData = ctx.getImageData(0, 0, width, height);
              const data = imageData.data;
              
              let minX = width, minY = height, maxX = -1, maxY = -1;
              
              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const alpha = data[(y * width + x) * 4 + 3];
                  if (alpha > 20) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                  }
                }
              }
              
              return {
                left: minX,
                top: minY,
                right: maxX,
                bottom: maxY,
                width: maxX - minX + 1,
                height: maxY - minY + 1,
                canvas: canvas 
              };
            }

            // 4. 核心逻辑：查找目标 X 坐标 (带内存清理)
            function findTargetX(alphaInfo) {
              let bgMat = null, puzzleMat = null, bgGray = null, puzzleGray = null;
              let puzzleCrop = null, bgEdge = null, puzzleEdge = null, resultMat = null;
              let searchEdge = null, puzzleFullEdge = null;

              try {
                const bgCanvas = imageToCanvas(bgImg);
                
                // 读取 Mat
                bgMat = cv.imread(bgCanvas);
                puzzleMat = cv.imread(alphaInfo.canvas);

                // 转灰度
                bgGray = new cv.Mat();
                puzzleGray = new cv.Mat();
                cv.cvtColor(bgMat, bgGray, cv.COLOR_RGBA2GRAY);
                cv.cvtColor(puzzleMat, puzzleGray, cv.COLOR_RGBA2GRAY);

                // 先提取完整拼图的边缘再裁剪，保留 alpha 边界处的轮廓。
                const roi = new cv.Rect(alphaInfo.left, alphaInfo.top, alphaInfo.width, alphaInfo.height);

                // 边缘检测
                bgEdge = new cv.Mat();
                puzzleFullEdge = new cv.Mat();
                cv.Canny(bgGray, bgEdge, 40, 120);
                cv.Canny(puzzleGray, puzzleFullEdge, 40, 120);
                puzzleCrop = puzzleFullEdge.roi(roi);
                puzzleEdge = puzzleCrop.clone();
                if (cv.countNonZero(puzzleEdge) === 0) {
                  return { success: false, reason: 'empty_puzzle_edges' };
                }

                // 拼图只沿水平方向移动，在当前高度附近搜索，避免命中其他行的纹理。
                const expectedY = (puzzleRect.top - bgRect.top) / bgScaleY + alphaInfo.top;
                const searchTop = Math.max(0, Math.floor(expectedY) - 2);
                const searchBottom = Math.min(bgEdge.rows, Math.ceil(expectedY) + alphaInfo.height + 2);
                if (searchBottom - searchTop < alphaInfo.height || searchTop >= bgEdge.rows) {
                  return { success: false, reason: 'invalid_search_region' };
                }
                searchEdge = bgEdge.roi(new cv.Rect(0, searchTop, bgEdge.cols, searchBottom - searchTop));

                // 模板匹配
                resultMat = new cv.Mat();
                cv.matchTemplate(searchEdge, puzzleEdge, resultMat, cv.TM_CCOEFF_NORMED);

                const mm = cv.minMaxLoc(resultMat);
                const contentX = mm.maxLoc.x;

                return {
                  success: true,
                  contentX,
                  score: mm.maxVal
                };

              } finally {
                // 关键：清理所有 OpenCV 对象，防止内存泄漏
                if (searchEdge) searchEdge.delete();
                if (puzzleCrop) puzzleCrop.delete();
                if (puzzleFullEdge) puzzleFullEdge.delete();
                if (bgMat) bgMat.delete();
                if (puzzleMat) puzzleMat.delete();
                if (bgGray) bgGray.delete();
                if (puzzleGray) puzzleGray.delete();
                if (bgEdge) bgEdge.delete();
                if (puzzleEdge) puzzleEdge.delete();
                if (resultMat) resultMat.delete();
              }
            }

            // 5. 执行计算
            const alphaInfo = getAlphaBounds(puzzleImg);
            
            if (alphaInfo.width <= 0 || alphaInfo.height <= 0) {
               return { success: false, reason: 'invalid_puzzle_bounds' };
            }

            const matchResult = findTargetX(alphaInfo);

            if (!matchResult.success) {
              return matchResult;
            }

            // 匹配得到的是可见内容左边界，减去当前可见内容位置才是待移动距离。
            const targetContentX = bgRect.left + matchResult.contentX * bgScaleX;
            const contentOffsetX = alphaInfo.left * bgScaleX;
            const initialContentX = puzzleRect.left + contentOffsetX;
            const puzzleMove = targetContentX - initialContentX;

            // 可信度检查
            if (!Number.isFinite(puzzleMove) || !Number.isFinite(matchResult.score) || matchResult.score <= 0) {
              console.error('OpenCV 匹配结果可信度不足', matchResult);
              return { success: false, reason: 'low_score', score: matchResult.score };
            }

            // 6. 模拟拖动
            const sliderRect = slider.getBoundingClientRect();
            const sliderStartX = sliderRect.left + sliderRect.width / 2;
            const sliderStartY = sliderRect.top + sliderRect.height / 2;
            const trackElement = document.querySelector('#slider-container');
            if (!trackElement) return { success: false, reason: 'track_not_found' };
            const trackRect = trackElement.getBoundingClientRect();
            const minMove = trackRect.left - sliderRect.left;
            const maxMove = trackRect.right - sliderRect.right;
            if (maxMove - minMove <= 0) return { success: false, reason: 'invalid_slider_geometry' };

            const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
            let pointerDown = false;
            let currentMove = 0;
            let previousPointerX = sliderStartX;

            function dispatchPointer(type, x, y, buttons) {
              const event = new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                movementX: type === 'pointermove' ? x - previousPointerX : 0,
                movementY: 0,
                buttons,
                button: 0,
                pressure: buttons ? 0.5 : 0
              });
              slider.dispatchEvent(event);
              previousPointerX = x;
            }

            function createTrack(start, end) {
              const track = [];
              const duration = 700;
              const steps = 45;
              for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                track.push({ x: start + (end - start) * ease, delay: duration / steps });
              }
              return track;
            }

            // 用同一次拖动中的短距离移动测量实际比例，适配缩放和不同轨道宽度。
            try {
              dispatchPointer('pointerover', sliderStartX, sliderStartY, 0);
              dispatchPointer('pointerenter', sliderStartX, sliderStartY, 0);
              dispatchPointer('pointermove', sliderStartX, sliderStartY, 0);
              dispatchPointer('pointerdown', sliderStartX, sliderStartY, 1);
              pointerDown = true;

              currentMove = puzzleMove >= 0 ? Math.min(8, maxMove) : Math.max(-8, minMove);
              if (Math.abs(currentMove) < 1) return { success: false, reason: 'no_slider_travel' };
              dispatchPointer('pointermove', sliderStartX + currentMove, sliderStartY, 1);
              await nextFrame();
              await nextFrame();
              if (!isCurrentCaptcha()) {
                return { success: false, reason: 'captcha_changed' };
              }
              const movedPuzzle = puzzleImg.getBoundingClientRect().left - puzzleRect.left;
              const ratio = movedPuzzle / currentMove;
              if (!Number.isFinite(ratio) || ratio <= 0) {
                return { success: false, reason: 'slider_not_responding' };
              }
              const sliderMove = puzzleMove / ratio;
              if (!Number.isFinite(sliderMove) || sliderMove < minMove - 1 || sliderMove > maxMove + 1) {
                return { success: false, reason: 'target_out_of_range', sliderMove, minMove, maxMove };
              }
              const endMove = Math.max(minMove, Math.min(maxMove, sliderMove));
              const track = createTrack(currentMove, endMove);

              for (const point of track) {
                if (!isCurrentCaptcha()) return { success: false, reason: 'captcha_changed' };
                dispatchPointer('pointermove', sliderStartX + point.x, sliderStartY, 1);
                currentMove = point.x;
                await new Promise(resolve => setTimeout(resolve, point.delay));
              }

              const finalX = sliderStartX + endMove;
              dispatchPointer('pointermove', finalX, sliderStartY, 1);
              await new Promise(resolve => setTimeout(resolve, 80));
              if (!isCurrentCaptcha()) {
                return { success: false, reason: 'captcha_changed' };
              }
              const alignmentError = targetContentX - (puzzleImg.getBoundingClientRect().left + contentOffsetX);
              // 校准时的取整或布局更新可能产生误差，释放前按实际位置微调一次。
              if (Math.abs(alignmentError) > 0.5) {
                const correctedMove = endMove + alignmentError / ratio;
                if (correctedMove < minMove - 1 || correctedMove > maxMove + 1) {
                  return { success: false, reason: 'target_out_of_range' };
                }
                currentMove = Math.max(minMove, Math.min(maxMove, correctedMove));
                dispatchPointer('pointermove', sliderStartX + currentMove, sliderStartY, 1);
                await nextFrame();
                await nextFrame();
              }
              const finalError = targetContentX - (puzzleImg.getBoundingClientRect().left + contentOffsetX);
              if (Math.abs(finalError) > Math.max(1, bgScaleX)) {
                return { success: false, reason: 'alignment_failed', alignmentError: finalError };
              }
              return {
                success: true, message: 'slide_completed', score: matchResult.score,
                puzzleMove, sliderMove: currentMove, ratio, alignmentError: finalError
              };
            } finally {
              // 无论校准或匹配是否成功，都释放指针，避免页面停留在拖动状态。
              const finalX = sliderStartX + currentMove;
              if (pointerDown) {
                dispatchPointer('pointerup', finalX, sliderStartY, 0);
                dispatchPointer('pointerout', finalX, sliderStartY, 0);
              }
            }

          } catch (e) {
            console.error('Slider automation error:', e);
            return { success: false, error: e.message };
          }
        })()
      `);
      if (!result?.success) {
        log.warn('滑块拖动失败:', result)
      } else {
        log.info('滑块拖动完成:', result)
      }
      return result
    } catch (error) {
      log.error(error, '滑块验证错误')
      return { success: false, reason: 'execution_failed' }
    }
  }

  /**
   * 关闭采集窗口
   */
  async destroy() {
    this.browserWindow?.destroy()
    this.browserWindow = null
    this.closeHandle = null
  }
}
