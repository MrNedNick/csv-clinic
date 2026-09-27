import { DECIMAL_COMMA, ident, literal, missing, text } from '../sql'
import type { TransformStep } from './steps'

/** The row id every table carries: the line a row came from, never exported. */
export const ROW = '_row'

/**
 * One step as a SELECT over the previous result. `columns` are the columns
 * the previous result has (without the row id); `other` those of the table a
 * join reads from.
 */
export function compileStep(step: TransformStep, from: string, columns: readonly string[], other: readonly string[] = []): string {
  const c = 'column' in step ? step.column : ''
  switch (step.kind) {
    case 'trim':
      return `SELECT * REPLACE (${text(c)} AS ${ident(c)}) FROM ${from}`
    case 'fill-missing':
      return `SELECT * REPLACE (CASE WHEN ${missing(c)} THEN ${literal(step.value)} ELSE CAST(${ident(c)} AS VARCHAR) END AS ${ident(c)}) FROM ${from}`
    case 'drop-missing':
      return `SELECT * FROM ${from} WHERE NOT ${missing(c)}`
    case 'dedupe': {
      const keys = (step.columns.length ? step.columns : columns).map((k) => text(k)).join(', ')
      return `SELECT * FROM ${from} QUALIFY row_number() OVER (PARTITION BY ${keys} ORDER BY ${ROW}) = 1`
    }
    case 'decimal-comma':
      return `SELECT * REPLACE (CASE WHEN regexp_full_match(${text(c)}, ${DECIMAL_COMMA})
        THEN replace(replace(${text(c)}, '.', ''), ',', '.') ELSE CAST(${ident(c)} AS VARCHAR) END AS ${ident(c)}) FROM ${from}`
    case 'cast': {
      const value =
        step.to === 'integer'
          ? // A decimal is not silently rounded into an integer; it is left empty and counted.
            `CASE WHEN regexp_full_match(${text(c)}, '^[+-]?\\d+$') THEN TRY_CAST(${text(c)} AS BIGINT) END`
          : step.to === 'decimal'
            ? `TRY_CAST(${text(c)} AS DOUBLE)`
            : `coalesce(TRY_CAST(${text(c)} AS DATE), CAST(TRY_STRPTIME(${text(c)}, '%d.%m.%Y') AS DATE), CAST(TRY_STRPTIME(${text(c)}, '%d/%m/%Y') AS DATE))`
      return `SELECT * REPLACE (${value} AS ${ident(c)}) FROM ${from}`
    }
    case 'rename':
      return `SELECT ${[ROW, ...columns].map((k) => (k === c ? `${ident(k)} AS ${ident(step.to)}` : ident(k))).join(', ')} FROM ${from}`
    case 'drop-column':
      return `SELECT * EXCLUDE (${ident(c)}) FROM ${from}`
    case 'join': {
      // Columns from the other file keep their names unless the left side
      // already has one, in which case they are prefixed with the file name.
      const prefix = step.sourceName.replace(/\.[^.]*$/, '')
      const right = other.map((k) => (columns.includes(k) ? `r.${ident(k)} AS ${ident(`${prefix}.${k}`)}` : `r.${ident(k)}`))
      const how = step.how === 'left' ? 'LEFT JOIN' : 'JOIN'
      // Row ids are renumbered so they stay unique when a key repeats on the right.
      return `SELECT row_number() OVER (ORDER BY l.${ROW}, r.${ROW}) AS ${ROW}, ${columns.map((k) => `l.${ident(k)}`).join(', ')}${right.length ? ', ' + right.join(', ') : ''}
        FROM ${from} l ${how} ${ident(`src_${step.source}`)} r ON trim(CAST(l.${ident(step.leftKey)} AS VARCHAR)) = trim(CAST(r.${ident(step.rightKey)} AS VARCHAR))`
    }
  }
}

/** Columns a step rewrites in place, for counting how many cells it touched. */
export function changedColumn(step: TransformStep): string | null {
  return ['trim', 'fill-missing', 'decimal-comma', 'cast'].includes(step.kind) && 'column' in step ? step.column : null
}
