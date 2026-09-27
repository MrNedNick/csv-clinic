import { useState, type ChangeEvent } from 'react'
import { describeStep, parseRecipe, toRecipe, type TransformStep } from '../../domain/03-recipe/steps'
import { download } from './download'
import type { useWorkbench } from './use-workbench'

type Bench = ReturnType<typeof useWorkbench>

type FormKind = Exclude<TransformStep['kind'], 'join'>

const KINDS: { kind: FormKind; label: string }[] = [
  { kind: 'trim', label: 'Trim spaces' },
  { kind: 'fill-missing', label: 'Fill empty values' },
  { kind: 'drop-missing', label: 'Remove rows with an empty value' },
  { kind: 'dedupe', label: 'Remove duplicate rows' },
  { kind: 'decimal-comma', label: 'Read decimal commas' },
  { kind: 'cast', label: 'Convert type' },
  { kind: 'rename', label: 'Rename column' },
  { kind: 'drop-column', label: 'Remove column' },
]

export const box = 'rounded-md border border-slate-200 p-4 dark:border-slate-800'
export const field =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
export const primary =
  'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
export const secondary =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'

/** The recipe: every step with what it did to the rows, undo and redo, and a form for the next step. */
export function RecipePanel({ bench, columns }: { bench: Bench; columns: readonly string[] }) {
  const [kind, setKind] = useState<FormKind>('trim')
  const [column, setColumn] = useState('')
  const [value, setValue] = useState('')
  const [to, setTo] = useState<'integer' | 'decimal' | 'date'>('decimal')
  const [message, setMessage] = useState<string | null>(null)
  const busy = bench.status.kind === 'loading'
  const col = columns.includes(column) ? column : (columns[0] ?? '')
  const outcomes = bench.view?.result.outcomes ?? []

  const build = (): TransformStep => {
    switch (kind) {
      case 'fill-missing':
        return { kind, column: col, value }
      case 'dedupe':
        return { kind, columns: [] }
      case 'cast':
        return { kind, column: col, to }
      case 'rename':
        return { kind, column: col, to: value.trim() }
      case 'trim':
      case 'drop-missing':
      case 'decimal-comma':
      case 'drop-column':
        return { kind, column: col }
    }
  }

  const loadRecipe = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const parsed = parseRecipe(await file.text())
    setMessage(parsed.ok ? null : parsed.message)
    if (parsed.ok) void bench.replaceRecipe([...parsed.recipe.steps])
  }

  return (
    <section aria-labelledby="recipe-title" className={box}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="recipe-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Recipe
        </h2>
        <div className="flex gap-1">
          <button type="button" className={secondary} onClick={() => void bench.undo()} disabled={busy || !bench.canUndo}>
            Undo
          </button>
          <button type="button" className={secondary} onClick={() => void bench.redo()} disabled={busy || !bench.canRedo}>
            Redo
          </button>
        </div>
      </div>

      {bench.steps.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No steps yet — the result is the original file.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {bench.steps.map((step, i) => {
            const o = outcomes[i]
            const delta = o ? o.rowsAfter - o.rowsBefore : 0
            const failed = bench.stepError?.index === i
            return (
              <li key={i} className={`rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-900 ${failed ? 'ring-2 ring-red-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-900 dark:text-slate-100">
                    {i + 1}. {describeStep(step)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove step ${i + 1}: ${describeStep(step)}`}
                    onClick={() => void bench.removeStep(i)}
                    disabled={busy}
                    className="text-slate-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
                {o && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {delta === 0 ? `${o.rowsAfter.toLocaleString()} rows` : `${o.rowsBefore.toLocaleString()} → ${o.rowsAfter.toLocaleString()} rows`}
                    {delta > 0 && step.kind === 'join' && ' — some keys repeat in the other file'}
                    {o.changed !== null && ` · ${o.changed} cells changed`}
                    {o.emptied ? ` · ${o.emptied} could not convert and were emptied` : ''}
                  </p>
                )}
                {failed && <p className="text-xs text-red-700 dark:text-red-300">{bench.stepError!.message}</p>}
              </li>
            )
          })}
        </ol>
      )}
      {bench.stepError && bench.stepError.index >= bench.steps.length && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {bench.stepError.message}
        </p>
      )}

      <form
        className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"
        onSubmit={(event) => {
          event.preventDefault()
          void bench.addStep(build())
          setValue('')
        }}
      >
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="step-kind">
          Add a step
        </label>
        <select id="step-kind" className={field} value={kind} onChange={(e) => setKind(e.target.value as FormKind)}>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        {kind !== 'dedupe' && (
          <>
            <label className="sr-only" htmlFor="step-column">
              Column
            </label>
            <select id="step-column" className={field} value={col} onChange={(e) => setColumn(e.target.value)}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </>
        )}
        {(kind === 'fill-missing' || kind === 'rename') && (
          <>
            <label className="sr-only" htmlFor="step-value">
              {kind === 'rename' ? 'New name' : 'Fill with'}
            </label>
            <input
              id="step-value"
              className={field}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'rename' ? 'New name' : 'Fill with…'}
              required={kind === 'rename'}
            />
          </>
        )}
        {kind === 'cast' && (
          <>
            <label className="sr-only" htmlFor="step-type">
              Convert to
            </label>
            <select id="step-type" className={field} value={to} onChange={(e) => setTo(e.target.value as typeof to)}>
              <option value="decimal">Numbers</option>
              <option value="integer">Whole numbers</option>
              <option value="date">Dates</option>
            </select>
          </>
        )}
        <button type="submit" className={primary} disabled={busy || columns.length === 0}>
          Add step
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          className={secondary}
          disabled={bench.steps.length === 0}
          onClick={() => download('recipe.json', JSON.stringify(toRecipe(bench.steps), null, 2), 'application/json')}
        >
          Save recipe
        </button>
        <label className={`${secondary} cursor-pointer`}>
          Load recipe
          <input type="file" accept=".json,application/json" className="sr-only" onChange={loadRecipe} aria-label="Load recipe" />
        </label>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      )}
    </section>
  )
}
