import sharp, { type Sharp } from 'sharp'

export interface ImageRawData {
  data: Buffer
  width: number
  height: number
  channels: number
}

export interface ImageInfo {
  width: number
  height: number
  channels: number
  format?: string
  size?: number
}

export interface PuzzlePoint {
  x: number
  y: number
}

export interface PuzzleResult {
  /**
   * 小拼图在小图中的实际位置
   */
  piece: {
    x: number
    y: number
    width: number
    height: number
  }

  /**
   * 大图中匹配到的位置
   */
  target: {
    x: number
    y: number
    width: number
    height: number
  }

  /**
   * 拼图需要移动的距离
   */
  moveX: number
  moveY: number

  /**
   * 匹配分数
   * 越高代表越匹配
   */
  score: number
}

export class SharpServices {
  private static instance: SharpServices

  private constructor() { }

  /**
   * 获取单例
   */
  static getInstance(): SharpServices {
    if (!SharpServices.instance) {
      SharpServices.instance = new SharpServices()
    }

    return SharpServices.instance
  }

  /**
   * 创建 sharp 实例
   */
  create(input: string | Buffer): Sharp {
    return sharp(input)
  }

  /** 
   * 下载图片
    */
  async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `图片下载失败: ${response.status} ${url}`,
      )
    }
    return Buffer.from(await response.arrayBuffer())
  }
  /**
   * 获取图片信息
   */
  async getInfo(
    input: string | Buffer,
  ): Promise<ImageInfo> {
    const metadata = await sharp(input).metadata()

    return {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      channels: metadata.channels ?? 0,
      format: metadata.format,
      size: metadata.size,
    }
  }

  /**
   * 获取图片 RGBA 原始像素
   */
  async getRaw(
    input: string | Buffer,
  ): Promise<ImageRawData> {
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({
        resolveWithObject: true,
      })

    return {
      data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    }
  }

  /**
   * 获取灰度图像素
   */
  async getGrayRaw(input: string | Buffer) {
    const { data, info } = await sharp(input)
      .greyscale()
      .raw()
      .toBuffer({
        resolveWithObject: true,
      })

    return {
      data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    }
  }

  /**
   * 裁剪图片
   */
  async crop(
    input: string | Buffer,
    left: number,
    top: number,
    width: number,
    height: number,
  ): Promise<Buffer> {
    return sharp(input)
      .extract({
        left,
        top,
        width,
        height,
      })
      .png()
      .toBuffer()
  }

  /**
   * 调整图片大小
   */
  async resize(
    input: string | Buffer,
    width: number,
    height?: number,
  ): Promise<Buffer> {
    return sharp(input)
      .resize(width, height)
      .png()
      .toBuffer()
  }

  /**
   * 保存图片
   */
  async save(
    input: string | Buffer,
    outputPath: string,
  ): Promise<void> {
    await sharp(input)
      .png()
      .toFile(outputPath)
  }

  /**
   * 获取指定像素
   */
  async getPixel(
    input: string | Buffer,
    x: number,
    y: number,
  ): Promise<{
    r: number
    g: number
    b: number
    a: number
  }> {
    const image = await this.getRaw(input)

    if (
      x < 0 ||
      y < 0 ||
      x >= image.width ||
      y >= image.height
    ) {
      throw new Error(`像素坐标越界: (${x}, ${y})`)
    }

    const index =
      (y * image.width + x) * image.channels

    return {
      r: image.data[index],
      g: image.data[index + 1],
      b: image.data[index + 2],
      a: image.data[index + 3],
    }
  }

  /**
   * 计算两张图片的像素差异
   */
  async compare(
    imageA: string | Buffer,
    imageB: string | Buffer,
  ): Promise<number> {
    const a = await this.getRaw(imageA)
    const b = await this.getRaw(imageB)

    if (
      a.width !== b.width ||
      a.height !== b.height
    ) {
      throw new Error(
        `图片尺寸不一致: ${a.width}x${a.height} !== ${b.width}x${b.height}`,
      )
    }

    let total = 0
    const pixelCount = a.width * a.height

    for (let i = 0; i < pixelCount; i++) {
      const index = i * 4

      total += Math.abs(
        a.data[index] - b.data[index],
      )

      total += Math.abs(
        a.data[index + 1] - b.data[index + 1],
      )

      total += Math.abs(
        a.data[index + 2] - b.data[index + 2],
      )
    }

    return total / (pixelCount * 3)
  }

  // ============================================================
  // 拼图相关
  // ============================================================

  /**
   * 获取小拼图的实际边界
   *
   * 小图通常是：
   *
   * ┌──────────────────┐
   * │                  │
   * │   ┌────────┐     │
   * │   │ 拼图块 │     │
   * │   └────────┘     │
   * │                  │
   * └──────────────────┘
   *
   * 通过 Alpha 找到真正的拼图区域。
   */
  private async getPuzzleBounds(
    input: string | Buffer,
  ) {
    const image = await this.getRaw(input)

    let minX = image.width
    let minY = image.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const index =
          (y * image.width + x) * image.channels

        const alpha = image.data[index + 3]

        if (alpha > 20) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    if (maxX < 0) {
      throw new Error('没有检测到拼图块')
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    }
  }

  /**
   * 获取灰度值
   */
  private getGray(
    data: Buffer,
    index: number,
  ) {
    return data[index]
  }

  /**
   * 从灰度图生成简单边缘图
   *
   * 使用左右 + 上下像素差。
   *
   * 不使用 OpenCV，所以 Node 26 + sharp 可以直接运行。
   */
  private getEdgeMap(
    data: Buffer,
    width: number,
    height: number,
  ): Uint8Array {
    const edges = new Uint8Array(
      width * height,
    )

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x

        const left = data[index - 1]
        const right = data[index + 1]
        const top = data[index - width]
        const bottom = data[index + width]

        const gx = Math.abs(right - left)
        const gy = Math.abs(bottom - top)

        const value = gx + gy

        edges[index] = Math.min(
          255,
          value,
        )
      }
    }

    return edges
  }

  /**
   * 获取小拼图的轮廓模板
   */
  private async getPuzzleTemplate(
    input: string | Buffer,
    bounds: {
      x: number
      y: number
      width: number
      height: number
    },
  ) {
    const image = await this.getRaw(input)

    const template = new Uint8Array(
      bounds.width * bounds.height,
    )

    for (
      let y = 0;
      y < bounds.height;
      y++
    ) {
      for (
        let x = 0;
        x < bounds.width;
        x++
      ) {
        const imageX = bounds.x + x
        const imageY = bounds.y + y

        const index =
          (imageY * image.width + imageX) * 4

        const alpha = image.data[index + 3]

        /**
         * 判断当前像素附近有没有透明区域。
         *
         * 透明 -> 不透明的交界处就是拼图轮廓。
         */
        let isEdge = false

        if (alpha > 20) {
          const neighbors = [
            [imageX - 1, imageY],
            [imageX + 1, imageY],
            [imageX, imageY - 1],
            [imageX, imageY + 1],
          ]

          for (const [nx, ny] of neighbors) {
            if (
              nx < 0 ||
              ny < 0 ||
              nx >= image.width ||
              ny >= image.height
            ) {
              continue
            }

            const neighborIndex =
              (ny * image.width + nx) * 4

            const neighborAlpha =
              image.data[neighborIndex + 3]

            if (neighborAlpha <= 20) {
              isEdge = true
              break
            }
          }
        }

        template[y * bounds.width + x] =
          isEdge ? 255 : 0
      }
    }

    return template
  }

  /**
   * 找拼图目标位置
   *
   * background:
   *   大图
   *
   * piece:
   *   小拼图
   *
   * 返回：
   *
   * {
   *   piece: {
   *     x,
   *     y,
   *     width,
   *     height
   *   },
   *
   *   target: {
   *     x,
   *     y,
   *     width,
   *     height
   *   },
   *
   *   moveX,
   *   moveY,
   *   score
   * }
   */
  async findPuzzleTarget(
    background: string,
    piece: string,
  ): Promise<PuzzleResult> {
    try {
      const backgroundImg = await this.downloadImage(background)
      const pieceImg = await this.downloadImage(piece)
      /**
       * 1. 获取小拼图实际边界
       */
      const pieceBounds =
        await this.getPuzzleBounds(pieceImg)

      /**
       * 2. 获取小拼图轮廓
       */
      const template =
        await this.getPuzzleTemplate(
          pieceImg,
          pieceBounds,
        )

      /**
       * 3. 获取大图灰度
       */
      const backgroundGray =
        await this.getGrayRaw(backgroundImg)

      /**
       * 4. 获取大图边缘
       */
      const backgroundEdges =
        this.getEdgeMap(
          backgroundGray.data,
          backgroundGray.width,
          backgroundGray.height,
        )

      /**
       * 5. 找模板中的有效边缘点
       */
      const templatePoints: PuzzlePoint[] = []

      for (
        let y = 0;
        y < pieceBounds.height;
        y++
      ) {
        for (
          let x = 0;
          x < pieceBounds.width;
          x++
        ) {
          if (
            template[
            y * pieceBounds.width + x
            ] > 0
          ) {
            templatePoints.push({
              x,
              y,
            })
          }
        }
      }

      if (!templatePoints.length) {
        throw new Error('没有检测到拼图轮廓')
      }

      /**
       * 6. 限制搜索范围
       *
       * 不允许目标跑出大图。
       */
      const maxX =
        backgroundGray.width -
        pieceBounds.width

      const maxY =
        backgroundGray.height -
        pieceBounds.height

      let bestX = 0
      let bestY = 0
      let bestScore = -Infinity

      /**
       * 7. 滑动窗口匹配
       */
      for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= maxX; x++) {
          let score = 0

          for (const point of templatePoints) {
            const targetX = x + point.x
            const targetY = y + point.y

            const index =
              targetY * backgroundGray.width +
              targetX

            const edge =
              backgroundEdges[index]

            /**
             * 目标轮廓越明显，分数越高
             */
            score += edge
          }

          /**
           * 归一化
           */
          score =
            score / templatePoints.length

          if (score > bestScore) {
            bestScore = score
            bestX = x
            bestY = y
          }
        }
      }

      /**
       * 8. 计算移动距离
       *
       * pieceBounds.x/y 是小图中真正拼图块的位置
       *
       * bestX/bestY 是大图中目标的位置
       */
      const moveX =
        bestX - pieceBounds.x

      const moveY =
        bestY - pieceBounds.y

      return {
        piece: {
          x: pieceBounds.x,
          y: pieceBounds.y,
          width: pieceBounds.width,
          height: pieceBounds.height,
        },

        target: {
          x: bestX,
          y: bestY,
          width: pieceBounds.width,
          height: pieceBounds.height,
        },

        moveX,
        moveY,

        score: bestScore,
      }
    } catch (error) {
      throw error
    }
  }
}