import { DECIMAL_COMMA, ident, missing, text } from '../sql'
import { ROW } from '../03-recipe/compile'
import type { TransformStep } from '../03-recipe/steps'

export type ValueType = 'integer' | 'decimal' | 'decimal-comma' | 'date' | 'boolean' | 'text' | 'empty'

export interface ColumnProfile {
  readonly name: string
  readonly missing: number
  readonly distinct: number
  /** Values with spaces at either end. */
  readonly padded: number
  readonly type: ValueType
  /** Filled values that do not read as `type`. */
  readonly mismatches: number
  readonly examples: readonly { readonly row: number; readonly value: string }[]
}

export interface TableProfile {
  readonly rows: number
  readonly duplicateRows: number
  readonly columns: readonly ColumnProfile[]
}

/** A type wins a column when this share of its filled values reads as that type. */
export const TYPE_SHARE = 0.8

const DATE = (c: string) =>
  `(TRY_CAST(${text(c)} AS DATE) IS NOT NULL OR TRY_STRPTIME(${text(c)}, '%d.%m.%Y') IS NOT NULL OR TRY_STRPTIME(${text(c)}, '%d/%m/%Y') IS NOT NULL)`

export const matches: Record<Exclude<ValueType, 'text' | 'empty'>, (c: string) => string> = {
  // Not TRY_CAST: DuckDB reads '37.7' as the integer 38.
  integer: (c) => `regexp_full_match(${text(c)}, '^[+-]?\\d+$')`,
  decimal: (c) => `TRY_CAST(${text(c)} AS DOUBLE) IS NOT NULL`,
  'decimal-comma': (c) => `(regexp_full_match(${text(c)}, ${DECIMAL_COMMA}) OR TRY_CAST(${text(c)} AS DOUBLE) IS NOT NULL)`,
  date: DATE,
  boolean: (c) => `lower(${text(c)}) IN ('true', 'false', 'yes', 'no')`,
}

/** One row of counts per column, read in a single pass. */
export function columnCountsSql(column: string, from: string) {
  const filled = `NOT ${missing(column)}`
  return `SELECT
    count(*) FILTER (WHERE ${missing(column)}) AS missing,
    count(DISTINCT ${text(column)}) FILTER (WHERE ${filled}) AS distinct_values,
    count(*) FILTER (WHERE ${filled} AND CAST(${ident(column)} AS VARCHAR) <> ${text(column)}) AS padded,
    count(*) FILTER (WHERE ${filled}) AS filled,
    count(*) FILTER (WHERE ${filled} AND ${matches.integer(column)}) AS integer,
    count(*) FILTER (WHERE ${filled} AND ${matches.decimal(column)}) AS decimal,
    count(*) FILTER (WHERE ${filled} AND regexp_full_match(${text(column)}, ${DECIMAL_COMMA})) AS comma,
    count(*) FILTER (WHERE ${filled} AND ${matches.date(column)}) AS date,
    count(*) FILTER (WHERE ${filled} AND ${matches.boolean(column)}) AS boolean
  FROM ${from}`
}

export interface ColumnCounts {
  missing: number
  distinct_values: number
  padded: number
  filled: number
  integer: number
  decimal: number
  comma: number
  date: number
  boolean: number
}

/** Picks the type most filled values agree on; a column no type wins is text. */
export function guessType(n: ColumnCounts): { type: ValueType; matching: number } {
  if (n.filled === 0) return { type: 'empty', matching: 0 }
  const share = (count: number) => count / n.filled >= TYPE_SHARE
  if (share(n.integer)) return { type: 'integer', matching: n.integer }
  if (n.comma > 0 && share(n.comma + n.decimal)) return { type: 'decimal-comma', matching: n.comma + n.decimal }
  if (share(n.decimal)) return { type: 'decimal', matching: n.decimal }
  if (share(n.date)) return { type: 'date', matching: n.date }
  if (share(n.boolean)) return { type: 'boolean', matching: n.boolean }
  return { type: 'text', matching: n.filled }
}

/** Up to `limit` filled values that do not read as `type`, with the line they came from. */
export function mismatchesSql(column: string, type: ValueType, from: string, limit = 3) {
  if (type === 'text' || type === 'empty') return null
  return `SELECT ${ROW} AS row, CAST(${ident(column)} AS VARCHAR) AS value FROM ${from}
    WHERE NOT ${missing(column)} AND NOT ${matches[type](column)} ORDER BY ${ROW} LIMIT ${limit}`
}

export function duplicateRowsSql(columns: readonly string[], from: string) {
  const keys = columns.map((c) => text(c)).join(', ')
  return `SELECT count(*) - (SELECT count(*) FROM (SELECT DISTINCT ${keys} FROM ${from})) AS duplicates FROM ${from}`
}

/** Steps worth offering for what the profile found — the person still decides. */
export function suggestions(profile: TableProfile): { reason: string; step: TransformStep }[] {
  const out: { reason: string; step: TransformStep }[] = []
  if (profile.duplicateRows > 0)
    out.push({ reason: `${profile.duplicateRows} duplicate row${profile.duplicateRows === 1 ? '' : 's'}`, step: { kind: 'dedupe', columns: [] } })
  for (const column of profile.columns) {
    if (column.padded > 0) out.push({ reason: `${column.padded} value${column.padded === 1 ? '' : 's'} with extra spaces in “${column.name}”`, step: { kind: 'trim', column: column.name } })
    if (column.type === 'decimal-comma') out.push({ reason: `“${column.name}” uses decimal commas`, step: { kind: 'decimal-comma', column: column.name } })
    if (column.missing > 0 && column.type !== 'empty')
      out.push({ reason: `${column.missing} empty value${column.missing === 1 ? '' : 's'} in “${column.name}”`, step: { kind: 'drop-missing', column: column.name } })
  }
  return out
}
