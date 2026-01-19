import ExcelJS from 'exceljs'
import { promises as fsPromises } from 'fs';
import { dirname } from 'path';
import type {
  Workbook,
  Worksheet,
  Row,
  Font,
  Fill,
  Border,
  CellValue
} from 'exceljs'

/**
 * ExcelWriter 类 - 提供 Excel 文件持续写入能力（ESM + Electron Main 专用）
 */
export class ExcelWriter {
  private workbook: Workbook
  private worksheet: Worksheet
  private filePath: string
  private writeQueue: Promise<any> = Promise.resolve()
  private sheetName: string
  /** 
   * 构造函数 - 初始化ExcelWriter实例 
   *  @param filePath 输出Excel文件路径 
   *  @param sheetName 工作表名称，默认为'Sheet1' 
  */
  constructor(filePath: string, sheetName = 'Sheet1') {
    this.workbook = new ExcelJS.Workbook()
    this.worksheet = this.workbook.addWorksheet(sheetName)
    this.filePath = filePath
    this.sheetName = sheetName
  }

  /**
     * 从现有文件加载工作簿
     * @param filePath 要加载的文件路径
     */
  async loadExistingFile(): Promise<this> {
    try {
      await fsPromises.access(this.filePath)

      const tempWorkbook = new ExcelJS.Workbook()
      await tempWorkbook.xlsx.readFile(this.filePath)

      this.workbook = tempWorkbook

      // ⚠️ 永远按名称取 sheet，绝不按 index
      let sheet = this.workbook.getWorksheet(this.sheetName)

      if (!sheet) {
        sheet = this.workbook.addWorksheet(this.sheetName)
      }

      this.worksheet = sheet

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.workbook = new ExcelJS.Workbook()
        this.worksheet = this.workbook.addWorksheet(this.sheetName)
      } else {
        throw error
      }
    }

    return this
  }

  /**
   * 读取现有表格的所有数据
   * @returns 返回表格中的所有数据数组
   */
  async readAllData(): Promise<any[]> {
    try {
      // 先加载现有文件
      await this.loadExistingFile();

      const data: any[] = [];
      const rows = this.worksheet.getRows(1, this.worksheet.rowCount) || [];

      if (rows.length === 0) {
        return data;
      }

      // 获取表头（假设第二行是表头）
      const headerRow = rows[0]; // 第一行作为表头
      const headers: string[] = [];

      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cell.value as string || `column${colNumber}`;
      });

      // 从第二行开始读取数据
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowData: any = {};

        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1] || `column${colNumber}`;
          rowData[header] = cell.value;
        });

        data.push(rowData);
      }

      return data;
    } catch (error) {
      console.error(`读取表格数据失败: ${error}`);
      return [];
    }
  }

  /**
   * 在现有数据后面追加新数据
   * @param newData 要追加的新数据
   */
  async appendAndSave(
    rows: Array<Record<string, any>>
  ): Promise<{
    success: boolean
    startRow: number
    endRow: number
    totalRows: number
  }> {
    return (this.writeQueue = this.writeQueue.then(async () => {
      await this.loadExistingFile()

      if (!rows || rows.length === 0) {
        return {
          success: true,
          startRow: this.worksheet.rowCount,
          endRow: this.worksheet.rowCount,
          totalRows: this.worksheet.rowCount
        }
      }

      /** 写入前行数 */
      const beforeCount = this.worksheet.rowCount

      /** 追加 */
      this.worksheet.addRows(rows)

      /** 立即刷盘 */
      await this.workbook.xlsx.writeFile(this.filePath)

      /** 重新加载文件做物理校验 */
      const verifyBook = new ExcelJS.Workbook()
      await verifyBook.xlsx.readFile(this.filePath)
      const verifySheet = verifyBook.getWorksheet(1)!

      const afterCount = verifySheet.rowCount

      const expected = beforeCount + rows.length
      const success = afterCount === expected

      if (!success) {
        throw new Error(
          `Excel写入校验失败: 期望 ${expected} 行, 实际 ${afterCount} 行`
        )
      }

      return {
        success: true,
        startRow: beforeCount + 1,
        endRow: afterCount,
        totalRows: afterCount
      }
    }))
  }

  /**
   * 读取现有表格的列定义
   * @returns 返回列定义数组
   */
  async readColumns(): Promise<Array<{ header: string; key: string; width?: number }>> {
    try {
      await this.loadExistingFile();

      const columns: Array<{ header: string; key: string; width?: number }> = [];
      const firstRow = this.worksheet.getRow(1); // 假设第一行是表头

      firstRow.eachCell((cell, colNumber) => {
        columns.push({
          header: cell.value as string || `Column${colNumber}`,
          key: cell.value as string || `column${colNumber}`,
          width: this.worksheet.getColumn(colNumber).width
        });
      });

      return columns;
    } catch (error) {
      console.error(`读取列定义失败: ${error}`);
      return [];
    }
  }

  /**
   * 在现有表格中添加新的列定义（不影响现有数据）
   * @param newColumns 新的列定义
   */
  async addNewColumns(newColumns: Array<{ header: string; key: string; width?: number }>): Promise<this> {
    try {
      await this.loadExistingFile();

      // 获取现有列
      const existingColumns = this.worksheet.columns || [];

      // 添加新列到现有列之后
      const allColumns = [...existingColumns.map(col => ({
        header: col.header as string || '',
        key: col.key || '',
        width: col.width
      })), ...newColumns];

      // 重新设置列定义
      this.worksheet.columns = allColumns;

      return this;
    } catch (error) {
      console.error(`添加新列失败: ${error}`);
      throw error;
    }
  }

  /** 
   * 设置工作表的列定义 
   * @param columns 列定义数组，包含header和key属性 
  */
  setColumns(columns: Array<{ header: string; key: string; width?: number }>) {
    this.worksheet.columns = columns
  }

  /** 
   * 添加单行数据 
   * @param rowData 行数据对象 
   */
  addRow(rowData: Record<string, any>) {
    this.worksheet.addRow(rowData)
  }

  /** 
   * 批量添加多行数据 
   * @param rowsData 多行数据数组 
   */
  addRows(rowsData: Array<Record<string, any>>) {
    this.worksheet.addRows(rowsData)
  }

  /** 
   * 获取当前工作表的行数 
   * @returns 返回当前行数 
   */
  getCurrentRowCount(): number {
    return this.worksheet.rowCount || 0
  }

  /** 
   * 设置特定单元格的值 
   * @param row 行号 * @param col 列号或列名 
   * @param value 单元格值 
   */
  setCellValue(row: number, col: number | string, value: CellValue) {
    this.worksheet.getCell(row, col).value = value
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

    if (style.font) row.font = style.font
    if (style.fill) row.fill = style.fill
    if (style.border) row.border = style.border

    Object.keys(style).forEach(key => {
      if (!['font', 'fill', 'border'].includes(key)) {
        ; (row as any)[key] = (style as any)[key]
      }
    })
  }

  /** 
   * 设置列宽 
   * @param columnDefinitions 包含宽度信息的列定义 
   */
  setColumnWidths(columnDefinitions: Array<{ key: string; width: number }>) {
    columnDefinitions.forEach(def => {
      const col = this.worksheet.getColumn(def.key)
      col.width = def.width
    })
  }

  /** 
   * 设置标题行样式 
   * @param style 样式配置
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
   * 自动调整列宽 
  */
  autoFitColumns() {
    this.worksheet.columns.forEach(column => {
      let maxLength = 10

      column.eachCell?.({ includeEmpty: true }, cell => {
        const len = cell.value ? String(cell.value).length : 10
        if (len > maxLength) maxLength = len
      })

      column.width = Math.min(Math.max(maxLength, 10), 50)
    })
  }

  /** 
   * 保存Excel文件到磁盘 
   * @returns Promise<void> 异步操作完成的Promise 
  */
  async save(): Promise<string> {
    try {
      // 确保目录存在
      const dir = dirname(this.filePath);

      try {
        await fsPromises.access(dir);
        console.log(`Created directory: ${dir}`);

      } catch {
        // 目录不存在，创建它（包括父目录）
        await fsPromises.mkdir(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);

      }
      await this.workbook.xlsx.writeFile(this.filePath)
      return this.filePath
    } catch (error) {
      console.error(`Failed to save Excel file: ${error}`)
      throw error
    }
  }

  /** 
   * 将Excel内容写入缓冲区并返回 
   * @returns Promise<Buffer> Excel文件的Buffer
   */
  async writeBuffer(): Promise<any> {
    return this.workbook.xlsx.writeBuffer()
  }

  /** 
   * 添加新的工作表 
   * @param sheetName 新工作表名称 
   * @returns 返回新创建的ExcelWriter实例，便于链式调用 
   */
  addWorksheet(sheetName: string): ExcelWriter {
    const worksheet = this.workbook.addWorksheet(sheetName)

    const writer = Object.create(ExcelWriter.prototype) as ExcelWriter
    writer.workbook = this.workbook
    writer.worksheet = worksheet
    writer.filePath = this.filePath

    return writer
  }

  /** 
   * 切换到指定的工作表 
   * @param sheetName 目标工作表名称 
   */
  switchWorksheet(sheetName: string) {
    const worksheet = this.workbook.getWorksheet(sheetName)
    if (!worksheet) throw new Error(`工作表 "${sheetName}" 不存在`)
    this.worksheet = worksheet
  }

  /** 
   * 获取当前工作表名称 
   * @returns 当前工作表名称 
   */
  getCurrentSheetName(): string {
    return this.worksheet.name
  }

  /** 
   * 获取所有工作表名称 
   * @returns 所有工作表名称数组 
   */
  getSheetNames(): string[] {
    return this.workbook.worksheets.map(ws => ws.name)
  }

  /** 
   * 添加数据并自动设置标题行样式 
   * @param columns 列定义 * @param data 数据行 
   * @param titleStyle 标题行样式 
   */
  addDataWithHeaders(
    columns: Array<{ header: string; key: string; width?: number }>,
    data: Array<Record<string, any>>,
    titleStyle: {
      font?: Partial<Font>
      fill?: Partial<Fill>
      border?: Partial<Border>
    } & Partial<Row> = {}
  ) {
    this.setColumns(columns)
    this.addRows(data)
    this.setTitleRowStyle(titleStyle)
  }

  /** 
   * 获取工作簿实例（用于高级操作） 
   */
  getWorkbook(): Workbook {
    return this.workbook
  }

  /** 
   * 获取当前工作表实例（用于高级操作） 
   */
  getWorksheet(): Worksheet {
    return this.worksheet
  }

  /** 
   * 合并单元格 
   * @param range 合并范围，例如 'A1:B2' 
   */
  mergeCells(range: string) {
    this.worksheet.mergeCells(range)
  }

  /** 
   * 冻结窗格 
   * @param rows 冻结的行数 
   * @param cols 冻结的列数 
   */
  freezePanes(rows = 1, cols = 0) {
    this.worksheet.views = [{ state: 'frozen', ySplit: rows, xSplit: cols }]
  }

  /** * 设置行高 
   * @param rowNumber 行号 
   * @param height 行高 
   */
  setRowHeight(rowNumber: number, height: number) {
    this.worksheet.getRow(rowNumber).height = height
  }
}
