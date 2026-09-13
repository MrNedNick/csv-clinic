import { describe, expect, it } from 'vitest'
import { importCsv, previewRows } from './parse-csv'

const fixtureFiles = import.meta.glob('../../../test/fixtures/01-import/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const fixture = (name: string) => fixtureFiles[`../../../test/fixtures/01-import/${name}`]

describe('importCsv', () => {
  it('parses a comma-delimited CSV with a header row', () => {
    const result = importCsv(fixture('simple.csv'), 'simple.csv')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.columns).toEqual(['name', 'age', 'city'])
    expect(result.dataset.rows).toEqual([
      ['Alice', '30', 'Berlin'],
      ['Bob', '25', 'Munich'],
    ])
    expect(result.dataset.rowCount).toBe(2)
    expect(result.dataset.dialect.delimiter).toBe(',')
  })

  it('detects a semicolon dialect from the data instead of assuming a comma', () => {
    const result = importCsv(fixture('semicolon.csv'), 'semicolon.csv')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.dialect.delimiter).toBe(';')
    expect(result.dataset.columns).toEqual(['name', 'age', 'city'])
  })

  it('strips a UTF-8 BOM before parsing so it does not end up glued to the first header name', () => {
    const result = importCsv(fixture('with-bom.csv'), 'with-bom.csv')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dataset.columns).toEqual(['name', 'age'])
    expect(result.dataset.rows).toEqual([['Alice', '30']])
  })

  it('reports empty input as a distinct error instead of an empty dataset', () => {
    const result = importCsv(fixture('empty.csv'), 'empty.csv')

    expect(result).toEqual({ ok: false, error: { kind: 'empty-input' } })
  })

  it('reports a row with the wrong number of columns instead of silently padding it', () => {
    const result = importCsv(fixture('inconsistent-rows.csv'), 'inconsistent-rows.csv')

    expect(result).toEqual({
      ok: false,
      error: { kind: 'inconsistent-row', rowIndex: 1, expected: 2, actual: 1 },
    })
  })
})

describe('previewRows', () => {
  it('returns at most `limit` rows, in order', () => {
    const result = importCsv(fixture('simple.csv'), 'simple.csv')
    if (!result.ok) throw new Error('fixture should parse')

    expect(previewRows(result.dataset, 1)).toEqual([['Alice', '30', 'Berlin']])
    expect(previewRows(result.dataset, 10)).toEqual(result.dataset.rows)
  })
})
