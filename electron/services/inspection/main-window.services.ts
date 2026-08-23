import { BrowserWindow } from 'electron'
import log from '../../log/index.js'

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
        },
      })
      this.browserWindow.webContents.openDevTools()
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
        await this.browserWindow?.webContents.executeJavaScript(`
          ()=>{
            const script = document.createElement('script')
            script.src = 'https://docs.opencv.org/4.5.4/opencv.js'
            document.body.appendChild(script)
          }  
        `)
        await new Promise((resolve) => setTimeout(resolve, 3000))
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
   * 获取页面
   */
  async getHTML() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      return { html: undefined, domain: '' }
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
      if (result?.ok) await new Promise((resolve) => setTimeout(resolve, 2000))
      await wc.executeJavaScript(`async () => {
          const cv = (window as any).cv;
          const bgImg = document.querySelector('#image');
          const puzzleImg = document.querySelector('#puzzle');
          const slider = document.querySelector('#slider');
          if (!cv?.imread) {
            console.error('OpenCV 未加载');
            return;
          }
          if (!bgImg || !puzzleImg || !slider) {
            console.error('找不到 #image / #puzzle / #slider');
            return;
          }
          // =========================================================
          // Image -> Canvas
          // =========================================================
          function imageToCanvas(img: any) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d', {
              willReadFrequently: true
            });
            ctx?.drawImage(img, 0, 0);
            return canvas;
          }
          // =========================================================
          // Alpha Bounds
          // =========================================================
          function getAlphaBounds(img: any) {
            const canvas = imageToCanvas(img);
            const ctx = canvas.getContext('2d', {
              willReadFrequently: true
            });
            const {
              width,
              height
            } = canvas;
            const data =
              ctx?.getImageData(
                0,
                0,
                width,
                height
              ).data;
            let minX = width;
            let minY = height;
            let maxX = -1;
            let maxY = -1;
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {

                const alpha =
                  data?.[
                  (y * width + x) * 4 + 3
                  ];

                if (alpha && alpha > 20) {

                  if (x < minX) minX = x;
                  if (y < minY) minY = y;

                  if (x > maxX) maxX = x;
                  if (y > maxY) maxY = y;
                }
              }
            }

            return {
              canvas,

              left: minX,
              top: minY,

              right: maxX,
              bottom: maxY,

              width: maxX - minX + 1,
              height: maxY - minY + 1
            };
          }

          // =========================================================
          // Canvas -> Mat
          // =========================================================

          function canvasToMat(canvas: any) {
            return cv.imread(canvas);
          }

          // =========================================================
          // OpenCV
          // Alpha Crop + Edge
          // =========================================================

          function findTargetX(alpha: any) {

            const bgCanvas =
              imageToCanvas(bgImg);

            const bg =
              canvasToMat(bgCanvas);

            const puzzle =
              canvasToMat(alpha.canvas);

            const bgGray =
              new cv.Mat();

            const puzzleGray =
              new cv.Mat();

            cv.cvtColor(
              bg,
              bgGray,
              cv.COLOR_RGBA2GRAY
            );

            cv.cvtColor(
              puzzle,
              puzzleGray,
              cv.COLOR_RGBA2GRAY
            );

            // =======================================================
            // Alpha Crop
            // =======================================================

            const roi =
              new cv.Rect(
                alpha.left,
                alpha.top,
                alpha.width,
                alpha.height
              );

            const puzzleCrop =
              puzzleGray.roi(roi);

            // =======================================================
            // Edge
            // =======================================================

            const bgEdge =
              new cv.Mat();

            const puzzleEdge =
              new cv.Mat();

            cv.Canny(
              bgGray,
              bgEdge,
              40,
              120
            );

            cv.Canny(
              puzzleCrop,
              puzzleEdge,
              40,
              120
            );

            // =======================================================
            // Match
            // =======================================================

            const result =
              new cv.Mat();

            cv.matchTemplate(
              bgEdge,
              puzzleEdge,
              result,
              cv.TM_CCOEFF_NORMED
            );

            const mm =
              cv.minMaxLoc(result);

            const contentX =
              mm.maxLoc.x;

            // =======================================================
            // 转换为 Puzzle canvas left
            // =======================================================

            const puzzleLeft =
              contentX - alpha.left;

            // =======================================================
            // 清理
            // =======================================================

            bg.delete();
            puzzle.delete();

            bgGray.delete();
            puzzleGray.delete();

            puzzleCrop.delete();

            bgEdge.delete();
            puzzleEdge.delete();

            result.delete();

            return {
              contentX,
              puzzleLeft,
              score: mm.maxVal
            };
          }

          // =========================================================
          // 计算
          // =========================================================

          const alpha =
            getAlphaBounds(puzzleImg);

          const result =
            findTargetX(alpha);

          const puzzleInitialLeft =
            parseFloat(
              getComputedStyle(puzzleImg).left
            );

          const puzzleMove =
            result.puzzleLeft -
            puzzleInitialLeft;

          // =========================================================
          // 你的页面实际比例
          // =========================================================

          const ratio =
            0.6862940987394774;

          const sliderMove =
            puzzleMove / ratio;

          // =========================================================
          // Slider 当前 DOM
          // =========================================================

          const sliderRect =
            slider.getBoundingClientRect();

          const sliderStartX =
            sliderRect.left +
            sliderRect.width / 2;

          const sliderStartY =
            sliderRect.top +
            sliderRect.height / 2;

          const sliderInitialLeft =
            parseFloat(
              getComputedStyle(slider).left
            );

          // =========================================================
          // 输出计算结果
          // =========================================================

          console.table({
            'OpenCV content X':
              result.contentX,

            'Puzzle Alpha left':
              alpha.left,

            'OpenCV Puzzle left':
              result.puzzleLeft,

            'Puzzle 当前 left':
              puzzleInitialLeft,

            'Puzzle 移动距离':
              puzzleMove,

            'Slider 当前 left':
              sliderInitialLeft,

            'Slider 滑动距离':
              sliderMove,

            'OpenCV score':
              result.score
          });

          // =========================================================
          // 防止 OpenCV 匹配明显错误
          // =========================================================

          if (
            !Number.isFinite(sliderMove) ||
            result.score < 0.45
          ) {
            console.error(
              'OpenCV 匹配结果可信度不足，取消拖动',
              result
            );

            return;
          }

          // =========================================================
          // 模拟 PointerEvent
          // =========================================================

          function dispatchPointer(
            type: string,
            x: any,
            y: any,
            buttons: any
          ) {
            const event =
              new PointerEvent(type, {
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
                buttons,
                button: 0,

                pressure:
                  buttons ? 0.5 : 0
              });

            slider?.dispatchEvent(event);
          }

          // =========================================================
          // 生成拖动轨迹
          // =========================================================

          function createTrack(distance: any) {

            const track = [];

            const duration = 700;

            const steps = 45;

            for (let i = 1; i <= steps; i++) {

              const t =
                i / steps;

              // easeInOut
              const ease =
                t < 0.5
                  ? 2 * t * t
                  : 1 -
                  Math.pow(
                    -2 * t + 2,
                    2
                  ) / 2;

              const x =
                distance * ease;

              track.push({
                x,
                delay:
                  duration / steps
              });
            }

            return track;
          }

          // =========================================================
          // 开始拖动
          // =========================================================

          console.log(
            '开始拖动:',
            {
              sliderStartX,
              sliderStartY,
              sliderMove
            }
          );

          dispatchPointer(
            'pointerover',
            sliderStartX,
            sliderStartY,
            0
          );

          dispatchPointer(
            'pointerenter',
            sliderStartX,
            sliderStartY,
            0
          );

          dispatchPointer(
            'pointermove',
            sliderStartX,
            sliderStartY,
            0
          );

          // =========================================================
          // pointerdown
          // =========================================================

          dispatchPointer(
            'pointerdown',
            sliderStartX,
            sliderStartY,
            1
          );

          // =========================================================
          // pointermove
          // =========================================================

          const track =
            createTrack(sliderMove);

          let previousX = 0;

          for (const point of track) {

            const currentX =
              sliderStartX + point.x;

            // 使用 window/document 派发，
            // 兼容页面监听 document/window pointermove 的情况

            const event =
              new PointerEvent(
                'pointermove',
                {
                  bubbles: true,
                  cancelable: true,
                  composed: true,

                  pointerId: 1,
                  pointerType: 'mouse',
                  isPrimary: true,

                  clientX: currentX,
                  clientY: sliderStartY,

                  screenX: currentX,
                  screenY: sliderStartY,
                  movementX:
                    currentX -
                    (
                      sliderStartX +
                      previousX
                    ),

                  movementY: 0,

                  buttons: 1,
                  button: 0,

                  pressure: 0.5
                }
              );

            document.dispatchEvent(event);

            previousX = point.x;

            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  point.delay
                )
            );
          }

          // =========================================================
          // pointerup
          // =========================================================

          const finalX =
            sliderStartX +
            sliderMove;

          dispatchPointer(
            'pointermove',
            finalX,
            sliderStartY,
            1
          );

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                80
              )
          );

          dispatchPointer(
            'pointerup',
            finalX,
            sliderStartY,
            0
          );

          dispatchPointer(
            'pointerout',
            finalX,
            sliderStartY,
            0
          );
        }`)
    }

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

  /**
   * 关闭采集窗口
   */
  async destroy() {
    this.browserWindow?.destroy()
    this.browserWindow = null
    this.closeHandle = null
  }
}
