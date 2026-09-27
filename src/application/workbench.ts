import type { Dataset } from '../domain/01-import/types'
import {
  columnCountsSql,
  duplicateRowsSql,
  guessType,
  mismatchesSql,
  type ColumnCounts,
  type ColumnProfile,
  type TableProfile,
} from '../domain/02-profile/profile'
import { changedColumn, compileStep, ROW } from '../domain/03-recipe/compile'
import { validateStep, type TransformStep } from '../domain/03-recipe/steps'
import { changeReport, toCsv, type StepOutcome } from '../domain/04-export/export'
import type { Engine, Row } from '../domain/engine'
import { ident, missing } from '../domain/sql'

export interface SourceTable {
  readonly id: string
  readonly name: string
  readonly columns: readonly string[]
  readonly rows: number
}

export interface RecipeResult {
  readonly outcomes: readonly StepOutcome[]
  readonly columns: readonly string[]
  readonly rows: number
}

export class StepError extends Error {
  readonly index: number
  constructor(index: number, message: string) {
    super(message)
    this.index = index
  }
}

const table = (id: string) => ident(`src_${id}`)
const stepTable = (i: number) => ident(`step_${i}`)
const asText = (columns: readonly string[]) => columns.map((c) => `CAST(${ident(c)} AS VARCHAR) AS ${ident(c)}`).join(', ')

/** A dataset as plain CSV for DuckDB to read: comma, every cell quoted. */
function serialize(dataset: Dataset) {
  const q = (v: string) => `"${v.replaceAll('"', '""')}"`
  return [dataset.columns, ...dataset.rows].map((row) => row.map(q).join(',')).join('\n') + '\n'
}

/**
 * The app's use cases over any Engine: load files as immutable source tables,
 * run a recipe over one of them, and read back the preview, the profile and
 * the export. Each step's result is materialised once, so the profile, the
 * preview and the export all read the same finished table.
 */
export class Workbench {
  private readonly engine: Engine
  readonly sources = new Map<string, SourceTable>()
  private main: string | null = null
  private result: RecipeResult = { outcomes: [], columns: [], rows: 0 }
  private last = 0

  constructor(engine: Engine) {
    this.engine = engine
  }

  async addSource(id: string, dataset: Dataset): Promise<SourceTable> {
    const file = `${id}.csv`
    await this.engine.registerFile(file, serialize(dataset))
    await this.engine.run(
      `CREATE OR REPLACE TABLE ${table(id)} AS SELECT row_number() OVER () AS ${ROW}, *
       FROM read_csv('${file}', delim = ',', quote = '"', escape = '"', header = true, all_varchar = true)`,
    )
    const source = {
      id,
      name: dataset.sourceName,
      columns: await this.columnsOf(table(id)),
      rows: await this.count(table(id)),
    }
    this.sources.set(id, source)
    return source
  }

  /** Runs `steps` over the source from scratch; a step that no longer fits stops the run with its index. */
  async apply(mainId: string, steps: readonly TransformStep[]): Promise<RecipeResult> {
    const source = this.sources.get(mainId)
    if (!source) throw new Error(`no source ${mainId}`)
    this.main = mainId
    await this.engine.run(`CREATE OR REPLACE TABLE ${stepTable(0)} AS SELECT * FROM ${table(mainId)}`)
    let columns = [...source.columns]
    let rows = source.rows
    const outcomes: StepOutcome[] = []
    for (const [i, step] of steps.entries()) {
      const problem = validateStep(step, columns)
      if (problem) throw new StepError(i, problem)
      if (step.kind === 'join' && !this.sources.has(step.source)) throw new StepError(i, `The file ${step.sourceName} is not open.`)
      const other = step.kind === 'join' ? this.sources.get(step.source)!.columns : []
      await this.engine.run(`CREATE OR REPLACE TABLE ${stepTable(i + 1)} AS ${compileStep(step, stepTable(i), columns, other)}`)
      const after = await this.count(stepTable(i + 1))
      const column = changedColumn(step)
      let changed: number | null = null
      let emptied: number | null = null
      if (column) {
        const [n] = await this.engine.rows(`SELECT
            count(*) FILTER (WHERE CAST(c.${ident(column)} AS VARCHAR) IS DISTINCT FROM CAST(p.${ident(column)} AS VARCHAR)) AS changed,
            count(*) FILTER (WHERE c.${ident(column)} IS NULL AND NOT ${missing(column, 'p')}) AS emptied
          FROM ${stepTable(i)} p JOIN ${stepTable(i + 1)} c USING (${ROW})`)
        changed = Number(n!.changed)
        emptied = step.kind === 'cast' ? Number(n!.emptied) : null
      }
      outcomes.push({ step, rowsBefore: rows, rowsAfter: after, changed, emptied })
      columns = await this.columnsOf(stepTable(i + 1))
      rows = after
    }
    this.result = { outcomes, columns, rows }
    this.last = steps.length
    return this.result
  }

  private get current() {
    return stepTable(this.last)
  }

  async preview(limit = 50, offset = 0): Promise<{ row: number; cells: Row }[]> {
    const rows = await this.engine.rows(
      `SELECT ${ROW}, ${asText(this.result.columns)} FROM ${this.current} ORDER BY ${ROW} LIMIT ${limit} OFFSET ${offset}`,
    )
    return rows.map(({ [ROW]: row, ...cells }) => ({ row: Number(row), cells }))
  }

  async profile(): Promise<TableProfile> {
    const columns: ColumnProfile[] = []
    for (const name of this.result.columns) {
      const [counts] = (await this.engine.rows(columnCountsSql(name, this.current))) as unknown as ColumnCounts[]
      const n = Object.fromEntries(Object.entries(counts!).map(([k, v]) => [k, Number(v)])) as unknown as ColumnCounts
      const { type, matching } = guessType(n)
      const sql = mismatchesSql(name, type, this.current)
      const examples = sql ? (await this.engine.rows(sql)).map((r) => ({ row: Number(r.row), value: String(r.value) })) : []
      columns.push({
        name,
        missing: n.missing,
        distinct: n.distinct_values,
        padded: n.padded,
        type,
        mismatches: n.filled - matching,
        examples,
      })
    }
    const [dup] = await this.engine.rows(duplicateRowsSql(this.result.columns, this.current))
    return { rows: this.result.rows, duplicateRows: Number(dup!.duplicates), columns }
  }

  async exportCsv(delimiter = ',') {
    const rows = await this.engine.rows(`SELECT ${asText(this.result.columns)} FROM ${this.current} ORDER BY ${ROW}`)
    return toCsv(this.result.columns, rows, delimiter)
  }

  async report(delimiter = ',', exportedAt = new Date().toISOString()) {
    const source = this.main ? this.sources.get(this.main)! : null
    const csv = await this.exportCsv(delimiter)
    return changeReport({
      sourceName: source?.name ?? 'the file',
      sourceRows: source?.rows ?? 0,
      outcomes: this.result.outcomes,
      exportedRows: this.result.rows,
      exportedColumns: this.result.columns,
      guarded: csv.guarded,
      exportedAt,
    })
  }

  private async columnsOf(from: string) {
    const rows = await this.engine.rows(`SELECT column_name FROM (DESCRIBE SELECT * FROM ${from})`)
    return rows.map((r) => String(r.column_name)).filter((c) => c !== ROW)
  }

  private async count(from: string) {
    const [row] = await this.engine.rows(`SELECT count(*) AS n FROM ${from}`)
    return Number(row!.n)
  }
}
