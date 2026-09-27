import type { Row } from '../engine'
import { describeStep, type TransformStep } from '../03-recipe/steps'

/**
 * A spreadsheet runs a cell that starts with = + - @ (or a tab or carriage
 * return) as a formula — the classic CSV injection. Such cells get a leading
 * apostrophe, except plain numbers like -12 or +3.5, which are data.
 */
export function guardCell(value: string): { value: string; guarded: boolean } {
  if (/^[=+\-@\t\r]/.test(value) && !/^[+-]?\d+([.,]\d+)?$/.test(value)) return { value: `'${value}`, guarded: true }
  return { value, guarded: false }
}

function quote(value: string, delimiter: string) {
  return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export interface CsvOutput {
  readonly text: string
  readonly guarded: number
}

/** The result as CSV: a header, one line per row, formula cells defused. */
export function toCsv(columns: readonly string[], rows: readonly Row[], delimiter = ','): CsvOutput {
  let guarded = 0
  const cell = (raw: Row[string]) => {
    if (raw === null || raw === undefined) return ''
    const safe = guardCell(String(raw))
    if (safe.guarded) guarded++
    return quote(safe.value, delimiter)
  }
  const lines = [columns.map((c) => quote(c, delimiter)).join(delimiter), ...rows.map((row) => columns.map((c) => cell(row[c]!)).join(delimiter))]
  return { text: lines.join('\r\n') + '\r\n', guarded }
}

export interface StepOutcome {
  readonly step: TransformStep
  readonly rowsBefore: number
  readonly rowsAfter: number
  /** Cells the step rewrote, for steps that change a column in place. */
  readonly changed: number | null
  /** Values that could not be converted and were emptied. */
  readonly emptied: number | null
}

/** What happened between the original file and the export, as Markdown. */
export function changeReport(input: {
  sourceName: string
  sourceRows: number
  outcomes: readonly StepOutcome[]
  exportedRows: number
  exportedColumns: readonly string[]
  guarded: number
  exportedAt: string
}): string {
  const lines = [
    `# Changes to ${input.sourceName}`,
    '',
    `Exported ${input.exportedAt}: ${input.exportedRows} rows × ${input.exportedColumns.length} columns, from ${input.sourceRows} rows in the original file.`,
    '',
  ]
  if (input.outcomes.length === 0) lines.push('No changes: the export is the original data.')
  else {
    lines.push('| # | Step | Rows | Cells changed |', '|---|---|---|---|')
    input.outcomes.forEach((o, i) => {
      const delta = o.rowsAfter - o.rowsBefore
      const rows = delta === 0 ? `${o.rowsAfter}` : `${o.rowsBefore} → ${o.rowsAfter} (${delta > 0 ? '+' : ''}${delta})`
      const cells = o.changed === null ? '—' : `${o.changed}${o.emptied ? `, ${o.emptied} emptied (could not convert)` : ''}`
      lines.push(`| ${i + 1} | ${describeStep(o.step).replaceAll('|', '\\|')} | ${rows} | ${cells} |`)
    })
  }
  lines.push('', `Columns: ${input.exportedColumns.join(', ')}.`)
  if (input.guarded)
    lines.push(
      '',
      `${input.guarded} cell${input.guarded === 1 ? '' : 's'} started with =, +, - or @ and ${input.guarded === 1 ? 'was' : 'were'} prefixed with an apostrophe so a spreadsheet shows ${input.guarded === 1 ? 'it' : 'them'} as text instead of running a formula.`,
    )
  lines.push('', 'The original file was not modified.')
  return lines.join('\n') + '\n'
}
