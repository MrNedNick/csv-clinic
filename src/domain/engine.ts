/**
 * What the app needs from a SQL database. DuckDB-Wasm implements it in a
 * worker in the browser and in-process under Node for the tests; nothing
 * above this line knows which.
 */
export type Row = Record<string, string | number | boolean | null>

export interface Engine {
  /** Makes a file readable from SQL under `name`. */
  registerFile(name: string, text: string): Promise<void>
  run(sql: string): Promise<void>
  rows(sql: string): Promise<Row[]>
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
  }
}
