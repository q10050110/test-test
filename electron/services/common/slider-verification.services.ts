import { app, type WebContents } from 'electron'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TaskScope, abortableDelay } from './task-scope.services.js'

export const MAX_SLIDER_ATTEMPTS = 3
const directory = path.dirname(fileURLToPath(import.meta.url))
export interface SliderResult { success: boolean; reason?: string; message?: string; [key: string]: unknown }

/** 复用现有图像匹配和拖动算法；调用方必须用接口响应确认解除限制。 */
export class SliderVerificationService {
  async hasChallenge(wc: WebContents, signal?: AbortSignal): Promise<boolean> {
    const scope = new TaskScope(signal)
    try {
      return Boolean(await scope.run(() => wc.executeJavaScript('Boolean(document.querySelector("#slider"))'), 5000, '检测滑块'))
    } finally { scope.stop() }
  }

  async prepare(wc: WebContents, signal?: AbortSignal) {
    const scope = new TaskScope(signal)
    try {
      const clicked = await scope.run(() => wc.executeJavaScript(
        '(() => { const button = document.querySelector("body > div.con p.h") && document.querySelector(".rb"); if (!button) return false; button.click(); return true; })()',
      ), 5000, '准备验证页面')
      if (clicked) await abortableDelay(2000, signal)
    } finally { scope.stop() }
  }

  async injectOpenCV(wc: WebContents, signal?: AbortSignal) {
    const scope = new TaskScope(signal)
    try {
      if (await scope.run(() => wc.executeJavaScript('Boolean(window.cv && window.cv.imread)'), 5000, '检测 OpenCV')) return
      const file = app.isPackaged ? path.join(process.resourcesPath, 'preloads', 'opencv.js') : path.join(directory, '../../preloads/opencv.js')
      let content: string
      try { content = await readFile(file, { encoding: 'utf8', signal }) }
      catch (error) {
        if (app.isPackaged || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        content = await readFile(path.join(directory, '../../../electron/preloads/opencv.js'), { encoding: 'utf8', signal })
      }
      await scope.run(() => wc.executeJavaScript(content), 10_000, '注入 OpenCV')
      await scope.run(async innerSignal => {
        while (!await wc.executeJavaScript('Boolean(window.cv && window.cv.imread)')) await abortableDelay(100, innerSignal)
      }, 10_000, '初始化 OpenCV')
    } finally { scope.stop() }
  }

  async verify(wc: WebContents, signal?: AbortSignal): Promise<SliderResult> {
    const scope = new TaskScope(signal)
    try {
      await this.injectOpenCV(wc, scope.signal)
      const result = await scope.run(() => wc.executeJavaScript(`
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

            // 图片加载后，响应式缩放和容器布局可能仍在更新，连续稳定后再取坐标。
            let lastLayout = null;
            let stableFrames = 0;
            const layoutDeadline = performance.now() + 1500;
            while (stableFrames < 3) {
              if (performance.now() >= layoutDeadline) {
                return { success: false, reason: 'layout_not_stable' };
              }
              const layout = [bgImg, puzzleImg, slider].flatMap(element => {
                const rect = element.getBoundingClientRect();
                return [rect.left, rect.top, rect.width, rect.height];
              });
              stableFrames = lastLayout && layout.every((value, i) => Math.abs(value - lastLayout[i]) < 0.1)
                ? stableFrames + 1 : 0;
              lastLayout = layout;
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
            // 每次反馈都读取当前位置，背景整体位移或等比缩放后仍使用同一坐标系。
            const readPosition = () => {
              const background = bgImg.getBoundingClientRect();
              const puzzle = puzzleImg.getBoundingClientRect();
              const targetX = background.left + matchResult.contentX * background.width / bgImg.naturalWidth;
              const contentX = puzzle.left + alphaInfo.left * puzzle.width / templateWidth;
              return { targetX, contentX, error: targetX - contentX };
            };
            const puzzleMove = readPosition().error;

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

            // 等待样式更新稳定，不能只等两个动画帧就将中间位置用作反馈。
            async function settlePosition() {
              const start = performance.now();
              let previous = readPosition();
              let stable = 0;
              while (performance.now() - start < 350) {
                await new Promise(resolve => setTimeout(resolve, 25));
                const position = readPosition();
                stable = Math.abs(position.contentX - previous.contentX) < 0.1 &&
                  Math.abs(position.targetX - previous.targetX) < 0.1 ? stable + 1 : 0;
                if (stable >= 3 && performance.now() - start >= 100) return position;
                previous = position;
              }
              return readPosition();
            }
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
              const calibratedPosition = await settlePosition();
              if (!isCurrentCaptcha()) {
                return { success: false, reason: 'captcha_changed' };
              }
              const movedPuzzle = puzzleMove - calibratedPosition.error;
              let ratio = movedPuzzle / currentMove;
              const initialRatio = ratio;
              if (!Number.isFinite(ratio) || ratio <= 0) {
                return { success: false, reason: 'slider_not_responding' };
              }
              const sliderMove = puzzleMove / ratio;
              if (!Number.isFinite(sliderMove)) {
                return { success: false, reason: 'invalid_slider_move', sliderMove, ratio };
              }
              // 首次测量可能含取整或瞬时位置偏差，先限制到轨道内，再根据反馈修正。
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
              let position = await settlePosition();
              if (!isCurrentCaptcha()) {
                return { success: false, reason: 'captcha_changed' };
              }
              const corrections = [];
              let stalled = 0;
              // 闭环微调：每次都用实际响应更新比例，避免反复沿用首个 8px 样本。
              for (let attempt = 0; attempt < 8 && Math.abs(position.error) > 0.5; attempt++) {
                if (!isCurrentCaptcha()) return { success: false, reason: 'captcha_changed' };
                const before = position;
                const previousMove = currentMove;
                const correction = Math.max(-64, Math.min(64, position.error / ratio));
                currentMove = Math.max(minMove, Math.min(maxMove, currentMove + correction));
                if (Math.abs(currentMove - previousMove) < 0.1) break;
                dispatchPointer('pointermove', sliderStartX + currentMove, sliderStartY, 1);
                position = await settlePosition();
                if (!isCurrentCaptcha()) return { success: false, reason: 'captcha_changed' };
                const pointerDelta = currentMove - previousMove;
                const puzzleDelta = before.error - position.error;
                const observedRatio = puzzleDelta / pointerDelta;
                if (Math.abs(pointerDelta) >= 1 && Number.isFinite(observedRatio) && observedRatio > 0.01) {
                  ratio = observedRatio;
                }
                corrections.push({ pointerDelta, puzzleDelta, ratio, alignmentError: position.error });
                stalled = Math.abs(puzzleDelta) < 0.1 ? stalled + 1 : 0;
                if (stalled >= 2) break;
              }
              const finalError = position.error;
              if (Math.abs(finalError) > Math.max(1, bgScaleX)) {
                const atLimit = (finalError > 0 && currentMove >= maxMove - 0.1) ||
                  (finalError < 0 && currentMove <= minMove + 0.1);
                return {
                  success: false, reason: atLimit ? 'target_out_of_range' : 'alignment_failed',
                  alignmentError: finalError, score: matchResult.score, puzzleMove,
                  sliderMove: currentMove, initialRatio, ratio, minMove, maxMove,
                  targetX: position.targetX, contentX: position.contentX, corrections
                };
              }
              return {
                success: true, message: 'slide_completed', score: matchResult.score,
                puzzleMove, sliderMove: currentMove, initialRatio, ratio, alignmentError: finalError,
                corrections
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
      `), 30_000, '滑块拖动');
      scope.check()
      return result
    } finally { scope.stop() }
  }

  async checkPage(wc: WebContents, signal?: AbortSignal) {
    await this.prepare(wc, signal)
    for (let attempt = 1; attempt <= MAX_SLIDER_ATTEMPTS; attempt++) {
      if (!await this.hasChallenge(wc, signal)) return
      await this.verify(wc, signal)
      await abortableDelay(1000, signal)
    }
    if (await this.hasChallenge(wc, signal)) throw new Error('滑块验证失败，已达到 3 次上限')
  }
}
