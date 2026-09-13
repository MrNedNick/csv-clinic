import { detectDialect } from './detect-dialect'
import type { Dataset, Dialect, ImportResult } from './types'

const BOM = '﻿'

/**
 * Parses raw CSV text into a Dataset. Pure and synchronous: no file access,
 * no worker, no DB — those come later, in the layers above this one.
 */
export function importCsv(raw: string, sourceName: string): ImportResult {
  const text = stripBom(raw)

  if (text.trim().length === 0) {
    return { ok: false, error: { kind: 'empty-input' } }
  }

  const dialect = detectDialect(text)
  const lines = splitLines(text)
  const parsedRows = lines.map((line) => parseLine(line, dialect))

  const columns = dialect.hasHeader ? parsedRows[0] : parsedRows[0].map((_, i) => `column_${i + 1}`)
  const rows = dialect.hasHeader ? parsedRows.slice(1) : parsedRows

  for (const [rowIndex, row] of rows.entries()) {
    if (row.length !== columns.length) {
      return {
        ok: false,
        error: {
          kind: 'inconsistent-row',
          rowIndex,
          expected: columns.length,
          actual: row.length,
        },
      }
    }
  }

  return {
    ok: true,
    dataset: { sourceName, dialect, columns, rows, rowCount: rows.length },
  }
}

/** First `limit` rows of a Dataset — what an import preview shows before a full load. */
export function previewRows(dataset: Dataset, limit: number): readonly (readonly string[])[] {
  return dataset.rows.slice(0, limit)
}

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).filter((line) => line.length > 0)
}

function parseLine(line: string, dialect: Dialect): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (inQuotes) {
      if (char === dialect.quoteChar) {
        if (line[i + 1] === dialect.quoteChar) {
          current += dialect.quoteChar
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
      continue
    }

    if (char === dialect.quoteChar) {
      inQuotes = true
    } else if (char === dialect.delimiter) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current)
  return cells
}
