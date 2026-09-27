// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { StepError, Workbench } from '../../src/application/workbench'
import { importCsv } from '../../src/domain/01-import/parse-csv'
import { suggestions } from '../../src/domain/02-profile/profile'
import type { TransformStep } from '../../src/domain/03-recipe/steps'
import { nodeEngine } from '../support/duckdb-node'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')

async function open(name: string) {
  const result = importCsv(fixture(name), name)
  if (!result.ok) throw new Error(`fixture ${name} did not import`)
  return result.dataset
}

let bench: Workbench

beforeEach(async () => {
  bench = new Workbench(await nodeEngine())
  await bench.addSource('main', await open('customers-bom.csv'))
})

const cleanRecipe: TransformStep[] = [
  { kind: 'trim', column: 'name' },
  { kind: 'dedupe', columns: [] },
  { kind: 'decimal-comma', column: 'amount' },
  { kind: 'cast', column: 'amount', to: 'decimal' },
]

describe('import into DuckDB', () => {
  it('loads a semicolon file with a BOM and quoted commas as an unchanged source table', async () => {
    const source = bench.sources.get('main')!
    expect(source.columns).toEqual(['id', 'name', 'city', 'amount', 'joined'])
    expect(source.rows).toBe(6)
    await bench.apply('main', [])
    const [first] = await bench.preview(1)
    expect(first).toEqual({ row: 1, cells: { id: '1', name: 'Smith, Anna', city: 'Berlin', amount: '12,50', joined: '01.03.2024' } })
  })
})

describe('column profile and type errors', () => {
  it('finds the decimal commas, the value that is not a number, gaps, padding and duplicates', async () => {
    await bench.apply('main', [])
    const profile = await bench.profile()
    const col = (name: string) => profile.columns.find((c) => c.name === name)!
    expect(profile.duplicateRows).toBe(1)
    expect(col('amount')).toMatchObject({ type: 'decimal-comma', mismatches: 1, examples: [{ row: 5, value: 'oops' }] })
    expect(col('joined')).toMatchObject({ type: 'date', missing: 1, mismatches: 0 })
    expect(col('city')).toMatchObject({ missing: 1, type: 'text' })
    expect(col('name')).toMatchObject({ padded: 2 })
    expect(col('id')).toMatchObject({ type: 'integer', distinct: 5 })
    const offered = suggestions(profile).map((s) => s.step.kind)
    expect(offered).toEqual(expect.arrayContaining(['dedupe', 'trim', 'decimal-comma', 'drop-missing']))
  })
})

describe('cleaning gaps and duplicates', () => {
  it('reports what each step did: cells changed, rows removed, values that could not convert', async () => {
    const result = await bench.apply('main', cleanRecipe)
    expect(result.outcomes.map((o) => [o.rowsBefore, o.rowsAfter, o.changed, o.emptied])).toEqual([
      [6, 6, 2, null], // " Bob " twice
      [6, 5, null, null], // the duplicate Bob, now identical after trimming
      [5, 5, 4, null], // 12,50 · 7,25 · 1.234,00 · -3,00
      [5, 5, 4, 1], // "oops" cannot be a number
    ])
    const amounts = (await bench.preview()).map((r) => r.cells.amount)
    expect(amounts).toEqual(['12.5', '7.25', '1234.0', null, '-3.0'])
  })

  it('fills or drops empty values', async () => {
    const filled = await bench.apply('main', [{ kind: 'fill-missing', column: 'city', value: 'Unknown' }])
    expect(filled.outcomes[0]!.changed).toBe(1)
    expect((await bench.preview()).map((r) => r.cells.city)).toContain('Unknown')
    const dropped = await bench.apply('main', [{ kind: 'drop-missing', column: 'joined' }])
    expect(dropped.rows).toBe(5)
  })
})

describe('recipes and undo', () => {
  it('undo is the recipe without its last step, recomputed from the untouched source', async () => {
    await bench.apply('main', cleanRecipe.slice(0, 3))
    const before = await bench.preview()
    await bench.apply('main', cleanRecipe)
    await bench.apply('main', cleanRecipe.slice(0, 3))
    expect(await bench.preview()).toEqual(before)
    expect(bench.sources.get('main')!.rows).toBe(6)
  })

  it('stops at a step that no longer fits, and says which', async () => {
    const recipe: TransformStep[] = [
      { kind: 'rename', column: 'city', to: 'town' },
      { kind: 'trim', column: 'city' },
    ]
    await expect(bench.apply('main', recipe)).rejects.toMatchObject({ index: 1 })
    await expect(bench.apply('main', [{ kind: 'rename', column: 'city', to: 'name' }])).rejects.toBeInstanceOf(StepError)
  })
})

describe('joining tables and keeping count of rows', () => {
  it('adds columns from a second file and shows when a repeated key multiplies rows', async () => {
    await bench.addSource('cities', await open('cities.csv'))
    const join: TransformStep = { kind: 'join', source: 'cities', sourceName: 'cities.csv', leftKey: 'city', rightKey: 'city', how: 'left' }
    const left = await bench.apply('main', [...cleanRecipe.slice(0, 2), join])
    expect(left.columns).toEqual(['id', 'name', 'city', 'amount', 'joined', 'cities.city', 'country'])
    const outcome = left.outcomes[2]!
    expect([outcome.rowsBefore, outcome.rowsAfter]).toEqual([5, 6]) // Paris is listed twice in cities.csv
    const inner = await bench.apply('main', [...cleanRecipe.slice(0, 2), { ...join, how: 'inner' }])
    expect(inner.rows).toBe(4) // no match for the empty city or Oslo
    expect((await bench.preview()).map((r) => r.row)).toEqual([1, 2, 3, 4])
  })
})

describe('export and change report', () => {
  it('writes clean CSV, defuses formula cells and reports every change', async () => {
    await bench.apply('main', cleanRecipe)
    const csv = await bench.exportCsv(',')
    const lines = csv.text.trimEnd().split('\r\n')
    expect(lines[0]).toBe('id,name,city,amount,joined')
    expect(lines[1]).toBe('1,"Smith, Anna",Berlin,12.5,01.03.2024')
    expect(lines).toContain(`4,"'=HYPERLINK(""http://evil.test"")",Rome,,2024-03-04`)
    expect(lines.at(-1)).toBe('5,Dana,Oslo,-3.0,') // a negative number is data, not a formula
    expect(csv.guarded).toBe(1)

    const report = await bench.report(',', '2026-09-27T10:00:00.000Z')
    expect(report).toContain('# Changes to customers-bom.csv')
    expect(report).toContain('5 rows × 5 columns, from 6 rows in the original file')
    expect(report).toContain('| 2 | Remove duplicate rows | 6 → 5 (-1) | — |')
    expect(report).toContain('| 4 | Convert “amount” to decimal | 5 | 4, 1 emptied (could not convert) |')
    expect(report).toContain('1 cell started with =, +, - or @')
  })
})

describe('a large file', () => {
  it('imports, profiles and cleans 200,000 rows', async () => {
    const lines = ['id;name;amount']
    for (let i = 1; i <= 200_000; i++) lines.push(`${i};Customer ${i % 997};${i % 100},${i % 10}0`)
    const started = performance.now()
    const result = importCsv(lines.join('\n'), 'large.csv')
    if (!result.ok) throw new Error('large file did not import')
    const big = new Workbench(await nodeEngine())
    await big.addSource('big', result.dataset)
    await big.apply('big', [{ kind: 'decimal-comma', column: 'amount' }, { kind: 'cast', column: 'amount', to: 'decimal' }])
    const profile = await big.profile()
    const seconds = (performance.now() - started) / 1000
    expect(profile.rows).toBe(200_000)
    expect(profile.columns.find((c) => c.name === 'amount')!.type).toBe('decimal')
    console.log(`200k rows: import + two steps + profile in ${seconds.toFixed(1)} s`)
    expect(seconds).toBeLessThan(30)
  }, 60_000)
})
