import ExcelJS from 'exceljs'
import { promises as fsPromises } from 'fs'
import { dirname, join } from 'path'
import type { Workbook, Worksheet, Row, Font, Fill, Border, CellValue } from 'exceljs'
import log from '../log/index.js'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

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
   * 初始化工作簿（只允许执行一次）
   * 应用生命周期内禁止重复 load
   */
  async init(): Promise<void> {
    if (this.initialized) return

    log.info(`ExcelWriter 初始化: ${this.filePath}`)

    try {
      await fsPromises.access(this.filePath)

      this.workbook = new ExcelJS.Workbook()
      await this.workbook.xlsx.readFile(this.filePath)

      this.worksheet =
        this.workbook.getWorksheet(this.sheetName) ||
        this.workbook.worksheets[0]

      if (!this.worksheet) {
        this.worksheet = this.workbook.addWorksheet(this.sheetName)
      }

      log.info(`成功加载现有文件: ${this.filePath}`)
    } catch {
      this.workbook = new ExcelJS.Workbook()
      this.worksheet = this.workbook.addWorksheet(this.sheetName)

      log.info(`文件不存在，创建新工作簿: ${this.filePath}`)
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
      log.info(`内存追加 ${rows.length} 行数据`)

      for (const row of rows) {
        this.worksheet.addRow(row)
      }
    })

    return this.memoryQueue
  }

  /**
     * 追加数据并立即保存到磁盘
     * @param rows 要追加的数据行
     */
  async appendAndSave(rows: Array<Record<string, any>>): Promise<void> {
    await this.init()

    this.memoryQueue = this.memoryQueue.then(async () => {
      log.info(`内存追加 ${rows.length} 行数据并立即保存`)

      for (const row of rows) {
        this.worksheet.addRow(row)
      }

      // 立即保存到磁盘
      await this.flushToDisk()
    })

    return this.memoryQueue
  }


  /**
   * 获取真实有效行数（不使用 rowCount）
   */
  getRealRowCount(): number {
    let count = 0
    this.worksheet.eachRow(row => {
      if (row.hasValues) count++
    })
    return count
  }

  /**
   * 安全写入磁盘
   * 只允许串行执行，避免并发损坏文件
   */
  async flushToDisk(): Promise<void> {
    await this.init()

    if (this.saving) {
      log.warn(`已有写盘任务进行中，跳过本次 flush`)
      return
    }

    this.saving = true

    try {
      const dir = dirname(this.filePath)
      await fsPromises.mkdir(dir, { recursive: true })


      // 如果写入失败，尝试关闭占用文件的 Excel 进程
      await this.writeFileWithProcessHandling(this.filePath)

      log.info(`Excel 写入完成: ${this.filePath}`)
    } finally {
      this.saving = false
    }
  }

  /**
   * 尝试关闭占用 Excel 文件的进程并写入文件
   */
  private async writeFileWithProcessHandling(filePath: string): Promise<void> {
    try {
      // 尝试直接写入
      await this.workbook.xlsx.writeFile(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EBUSY' || (error as NodeJS.ErrnoException).code === 'EPERM') {
        log.warn(`文件 ${filePath} 被占用，尝试关闭相关进程...`)

        // 尝试关闭 Excel 进程
        await this.closeExcelProcesses()

        // 等待片刻再尝试写入
        await new Promise(resolve => setTimeout(resolve, 1000))

        try {
          await this.workbook.xlsx.writeFile(filePath)
          log.info(`成功在关闭 Excel 进程后写入文件`)
        } catch (finalError) {
          log.error(`即使关闭 Excel 进程后仍无法写入文件:`, finalError)
          throw finalError
        }
      } else {
        // 其他错误直接抛出
        throw error
      }
    }
  }

  /**
   * 关闭与 Excel 相关的进程（Windows）
   */
  private async closeExcelProcesses(): Promise<void> {
    try {
      // 检测操作系统
      if (process.platform === 'win32') {
        // Windows 系统 - 结束 Excel 相关进程
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq EXCEL.EXE"')
        if (stdout.includes('EXCEL.EXE')) {
          log.info('检测到 Excel 进程，正在关闭...')
          await execAsync('taskkill /F /IM EXCEL.EXE')
          log.info('Excel 进程已关闭')
        } else {
          log.info('未检测到 Excel 进程')
        }
      } else if (process.platform === 'darwin') {
        // macOS 系统
        const { stdout } = await execAsync('ps aux | grep -i excel | grep -v grep')
        if (stdout.trim()) {
          log.info('检测到 Excel 进程，正在关闭...')
          await execAsync('pkill -f "Microsoft Excel"')
          log.info('Excel 进程已关闭')
        }
      } else {
        // Linux 系统
        const { stdout } = await execAsync('ps aux | grep -i libreoffice | grep -v grep')
        if (stdout.trim()) {
          log.info('检测到 LibreOffice 进程，正在关闭...')
          await execAsync('pkill -f libreoffice')
          log.info('LibreOffice 进程已关闭')
        }
      }
    } catch (error) {
      log.warn(`关闭 Excel 进程时出错:`, error)
      // 不抛出错误，因为这只是一个辅助功能
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
    } & Partial<Row> = {}
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
    } & Partial<Row>
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

    Object.keys(style).forEach(key => {
      if (!['font', 'fill', 'border'].includes(key)) {
        ; (row as any)[key] = (style as any)[key]
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
  setCellStyle(row: number, col: number | string, style: {
    font?: Partial<Font>
    fill?: Partial<Fill>
    border?: Partial<Border>
  }) {
    const cell = this.worksheet.getCell(row, col);

    if (style.font) cell.font = style.font;
    if (style.fill) cell.fill = style.fill as any;
    if (style.border) cell.border = style.border as any;
  }

  /**
   * 清空工作表内容（保留列定义）
   */
  clearContent() {
    log.info(`清空工作表内容（重建工作表）`);

    const sheetName = this.worksheet.name;
    const workbook = this.workbook;

    // 删除旧工作表
    workbook.removeWorksheet(this.worksheet.id);

    // 新建同名工作表
    this.worksheet = workbook.addWorksheet(sheetName);
  }
}