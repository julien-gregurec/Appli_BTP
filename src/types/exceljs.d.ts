declare module "@excel.js/exceljs" {
  export interface Cell { text: string }
  export interface Row { cellCount: number; getCell(index: number): Cell }
  export interface Worksheet { eachRow(options: { includeEmpty: boolean }, callback: (row: Row) => void): void }
  export class Workbook {
    worksheets: Worksheet[];
    xlsx: { load(buffer: Buffer): Promise<Workbook> };
  }
}
