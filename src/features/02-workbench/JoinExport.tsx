import { useState, type ChangeEvent } from 'react'
import { box, field, primary, secondary } from './RecipePanel'
import { download } from './download'
import type { useWorkbench } from './use-workbench'

type Bench = ReturnType<typeof useWorkbench>

/** Brings columns in from a second file, matched on a key, as one more step of the recipe. */
export function JoinBox({ bench, columns }: { bench: Bench; columns: readonly string[] }) {
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [leftKey, setLeftKey] = useState('')
  const [rightKey, setRightKey] = useState('')
  const [how, setHow] = useState<'left' | 'inner'>('left')
  const extra = bench.extras.find((e) => e.id === source) ?? bench.extras.at(-1)
  const rightColumns = extra ? bench.sourceColumns(extra.id) : []
  const left = columns.includes(leftKey) ? leftKey : (columns.find((c) => rightColumns.includes(c)) ?? columns[0] ?? '')
  const right = rightColumns.includes(rightKey) ? rightKey : (rightColumns.find((c) => c === left) ?? rightColumns[0] ?? '')
  const busy = bench.status.kind === 'loading'

  const open = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(await bench.addExtra(file))
  }

  return (
    <section aria-labelledby="join-title" className={box}>
      <h2 id="join-title" className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        Combine with another file
      </h2>
      <label className={`${secondary} inline-block cursor-pointer`}>
        Open a second CSV
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={open} aria-label="Open a second CSV" />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {extra && (
        <form
          className="mt-3 flex flex-col gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault()
            void bench.addStep({ kind: 'join', source: extra.id, sourceName: extra.dataset.sourceName, leftKey: left, rightKey: right, how })
          }}
        >
          {bench.extras.length > 1 && (
            <select aria-label="File to combine with" className={field} value={extra.id} onChange={(e) => setSource(e.target.value)}>
              {bench.extras.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.dataset.sourceName}
                </option>
              ))}
            </select>
          )}
          <label htmlFor="join-left" className="text-xs text-slate-600 dark:text-slate-400">
            Match this column…
          </label>
          <select id="join-left" className={field} value={left} onChange={(e) => setLeftKey(e.target.value)}>
            {columns.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label htmlFor="join-right" className="text-xs text-slate-600 dark:text-slate-400">
            …with this column of {extra.dataset.sourceName}
          </label>
          <select id="join-right" className={field} value={right} onChange={(e) => setRightKey(e.target.value)}>
            {rightColumns.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select aria-label="Rows to keep" className={field} value={how} onChange={(e) => setHow(e.target.value as 'left' | 'inner')}>
            <option value="left">Keep every row, add what matches</option>
            <option value="inner">Keep only rows that match</option>
          </select>
          <button type="submit" className={primary} disabled={busy || !left || !right}>
            Add the columns
          </button>
        </form>
      )}
    </section>
  )
}

const DELIMITERS = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon (Excel in much of Europe)' },
  { value: '\t', label: 'Tab' },
]

/** The clean file and a report of what changed, both generated from the finished result. */
export function ExportBox({ bench, sourceName, disabled }: { bench: Bench; sourceName: string; disabled: boolean }) {
  const [delimiter, setDelimiter] = useState(',')
  const [note, setNote] = useState<string | null>(null)
  const base = sourceName.replace(/\.[^.]*$/, '')

  return (
    <section aria-labelledby="export-title" className={box}>
      <h2 id="export-title" className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        Download
      </h2>
      <label htmlFor="export-delimiter" className="text-xs text-slate-600 dark:text-slate-400">
        Separator
      </label>
      <select id="export-delimiter" className={`${field} mb-2`} value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
        {DELIMITERS.map((d) => (
          <option key={d.label} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primary}
          disabled={disabled}
          onClick={async () => {
            const csv = await bench.exportCsv(delimiter)
            download(`${base}-clean.csv`, '﻿' + csv.text, 'text/csv;charset=utf-8')
            setNote(
              csv.guarded
                ? `${csv.guarded} cell${csv.guarded === 1 ? '' : 's'} looked like a spreadsheet formula and got a leading apostrophe.`
                : null,
            )
          }}
        >
          Clean CSV
        </button>
        <button
          type="button"
          className={secondary}
          disabled={disabled}
          onClick={async () => download(`${base}-changes.md`, await bench.report(delimiter), 'text/markdown;charset=utf-8')}
        >
          Change report
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
    </section>
  )
}
