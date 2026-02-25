import ExcelJS from 'exceljs'
import { promises as fsPromises } from 'fs'
import { dirname } from 'path'
import type { Workbook, Worksheet, Row, Font, Fill, Border, CellValue } from 'exceljs'
import log from '../log/index.js'

export class ExcelWriter {
  private workbook!: Workbook
  private worksheet!: Worksheet
  private filePath: string
  private sheetName: string

  /** 是否已初始化加载过文件 */
  private initialized = false

  /** 是否正在写入磁盘 */
  private saving = false

  /** 内存写入队列（仅操作内存，不碰磁盘） */
  private memoryQueue: Promise<void> = Promise.resolve()

  constructor(filePath: string, sheetName = 'Sheet1') {
    this.filePath = filePath
    this.sheetName = sheetName
  }

  /**
   * 检查文件是否被其他进程占用
   */
  private async isFileInUse(filePath: string): Promise<boolean> {
    try {
      // 尝试以写入模式打开文件
      const fileHandle = await fsPromises.open(filePath, 'r+')
      await fileHandle.close()
      return false // 能够打开说明未被占用
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      // 如果是 EBUSY 或 EPERM 错误，说明文件被占用
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EBADF') {
        return true
      }
      // 文件不存在不算被占用
      if (err.code === 'ENOENT') {
        return false
      }
      // 其他错误也视为无法访问
      return true
    }
  }

  /**
   * 初始化工作簿（只允许执行一次）
   * 应用生命周期内禁止重复 load
   */
  async init(): Promise<void> {
    if (this.initialized) return
    try {
      await fsPromises.access(this.filePath)

      this.workbook = new ExcelJS.Workbook()
      await this.workbook.xlsx.readFile(this.filePath)

      this.worksheet = this.workbook.getWorksheet(this.sheetName) || this.workbook.worksheets[0]

      if (!this.worksheet) {
        this.worksheet = this.workbook.addWorksheet(this.sheetName)
      }
    } catch {
      this.workbook = new ExcelJS.Workbook()
      this.worksheet = this.workbook.addWorksheet(this.sheetName)
    }

    this.initialized = true
  }

  /**
   * 追加数据（仅写入内存，不写磁盘）
   * 该方法可高频调用，不会损坏文件
   */
  async appendRows(rows: Array<Record<string, any>>): Promise<void> {
    await this.init()

    this.memoryQueue = this.memoryQueue.then(async () => {
      for (const row of rows) {
        this.worksheet.addRow(row)
      }
    })

    return this.memoryQueue
  }

  /**
   * 追加数据并立即保存到磁盘
   * @param rows 要追加的数据行
   * @returns 返回布尔值表示是否成功保存
   */
  async appendAndSave(rows: Array<Record<string, any>>): Promise<boolean> {
    await this.init()

    // 创建一个独立的 promise 来处理保存逻辑
    const savePromise = this.memoryQueue.then(async () => {
      // 检查文件是否被其他进程占用
      const isInUse = await this.isFileInUse(this.filePath)
      if (isInUse) {
        log.warn(`文件 ${this.filePath} 被其他进程占用，无法保存`)
        return false
      }

      for (const row of rows) {
        this.worksheet.addRow(row)
      }

      // 立即保存到磁盘
      const saveResult = await this.flushToDisk()
      return saveResult
    })

    // 等待当前队列完成并返回结果
    try {
      const result = await savePromise
      return result
    } catch (error) {
      log.error(`保存Excel数据失败:`, error)
      return false
    }
  }

  /**
   * 获取真实有效行数（不使用 rowCount）
   */
  getRealRowCount(): number {
    let count = 0
    this.worksheet.eachRow((row) => {
      if (row.hasValues) count++
    })
    return count
  }

  /**
   * 安全写入磁盘
   * 只允许串行执行，避免并发损坏文件
   * @returns 返回布尔值表示是否成功保存
   */
  async flushToDisk(): Promise<boolean> {
    await this.init()

    if (this.saving) {
      log.warn(`已有写盘任务进行中，跳过本次 flush`)
      return false
    }

    this.saving = true

    try {
      const dir = dirname(this.filePath)
      await fsPromises.mkdir(dir, { recursive: true })

      // 如果写入失败，检查是否被占用
      const writeResult = await this.writeFileWithProcessHandling(this.filePath)
      return writeResult
    } finally {
      this.saving = false
    }
  }

  /**
   * 尝试写入文件，如果被占用则返回false
   */
  private async writeFileWithProcessHandling(filePath: string): Promise<boolean> {
    try {
      // 尝试直接写入
      await this.workbook.xlsx.writeFile(filePath)
      log.info(`Excel 写入完成: ${this.filePath}`)
      return true
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'EBUSY' ||
        (error as NodeJS.ErrnoException).code === 'EPERM'
      ) {
        log.warn(`文件 ${filePath} 被占用，无法写入`)
        return false
      } else {
        // 其他错误记录并抛出
        log.error(`写入Excel文件时发生错误:`, error)
        throw error
      }
    }
  }

  /**
   * 设置列定义
   */
  setColumns(columns: Array<{ header: string; key: string; width?: number }>) {
    this.worksheet.columns = columns
  }

  /**
   * 设置单元格值
   */
  setCellValue(row: number, col: number | string, value: CellValue) {
    this.worksheet.getCell(row, col).value = value
  }

  /**
   * 设置标题行样式
   */
  setTitleRowStyle(
    style: {
      font?: Partial<Font>
      fill?: Partial<Fill>
      border?: Partial<Border>
    } & Partial<Row> = {},
  ) {
    const titleRow = this.worksheet.getRow(1)

    if (style.font) titleRow.font = style.font
    if (style.fill) titleRow.fill = style.fill
    if (style.border) titleRow.border = style.border

    titleRow.font = { ...(titleRow.font || {}), bold: true }
  }

  /**
   * 设置行的样式
   * @param rowNumber 行号
   * @param style 样式对象
   */
  setRowStyle(
    rowNumber: number,
    style: {
      font?: Partial<Font>
      fill?: Partial<Fill>
      border?: Partial<Border>
    } & Partial<Row>,
  ) {
    const row = this.worksheet.getRow(rowNumber)

    if (style.font) {
      row.font = style.font
    }
    if (style.fill) {
      row.fill = style.fill
    }
    if (style.border) {
      row.border = style.border
    }

    Object.keys(style).forEach((key) => {
      if (!['font', 'fill', 'border'].includes(key)) {
        ;(row as any)[key] = (style as any)[key]
      }
    })
  }

  /**
   * 自动调整列宽
   */
  autoFitColumns() {
    this.worksheet.columns.forEach((column: any) => {
      let max = 10

      column.eachCell({ includeEmpty: true }, (cell: any) => {
        const len = cell.value ? String(cell.value).length : 10
        if (len > max) max = len
      })

      column.width = Math.min(Math.max(max, 10), 50)
    })
  }

  /**
   * 合并单元格
   * @param range 合并范围，例如 'A1:B2'
   */
  mergeCells(range: string) {
    this.worksheet.mergeCells(range)
  }

  /**
   * 获取工作簿实例
   */
  getWorkbook(): Workbook {
    return this.workbook
  }

  /**
   * 获取工作表实例
   */
  getWorksheet(): Worksheet {
    return this.worksheet
  }

  /**
   * 应用退出前调用，确保数据安全落盘
   */
  async dispose(): Promise<void> {
    log.info(`应用退出，执行最终 Excel 落盘`)
    await this.flushToDisk()
  }

  /**
   * 设置特定单元格的样式
   * @param row 行号
   * @param col 列号或列名
   * @param style 样式对象
   */
  setCellStyle(
    row: number,
    col: number | string,
    style: {
      font?: Partial<Font>
      fill?: Partial<Fill>
      border?: Partial<Border>
    },
  ) {
    const cell = this.worksheet.getCell(row, col)

    if (style.font) cell.font = style.font
    if (style.fill) cell.fill = style.fill as any
    if (style.border) cell.border = style.border as any
  }

  /**
   * 清空工作表内容（保留列定义）
   */
  clearContent() {
    log.info(`清空工作表内容（重建工作表）`)

    const sheetName = this.worksheet.name
    const workbook = this.workbook

    // 删除旧工作表
    workbook.removeWorksheet(this.worksheet.id)

    // 新建同名工作表
    this.worksheet = workbook.addWorksheet(sheetName)
  }

  /**
   * 检查文件是否可写入
   */
  async checkFileStatus(): Promise<{ writable: boolean; inUse: boolean }> {
    let inUse = false
    try {
      inUse = await this.isFileInUse(this.filePath)
    } catch (error) {
      log.warn(`检查文件状态失败:`, error)
    }

    return {
      writable: !inUse,
      inUse,
    }
  }

  /**
   * 获取表格文件路径
   */
  getFilePath() {
    return this.filePath
  }

  reset(filePath?: string) {
    this.workbook = new ExcelJS.Workbook()
    this.worksheet = this.workbook.addWorksheet(this.sheetName)

    this.initialized = true // 已初始化，但用的是新 workbook
    this.saving = false
    this.memoryQueue = Promise.resolve()

    if (filePath) {
      this.filePath = filePath
    }
  }
}
