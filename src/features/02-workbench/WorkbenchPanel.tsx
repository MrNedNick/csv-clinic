import { useState } from 'react'
import type { Dataset } from '../../domain/01-import/types'
import { suggestions, type ColumnProfile } from '../../domain/02-profile/profile'
import { describeStep, type TransformStep } from '../../domain/03-recipe/steps'
import { ExportBox, JoinBox } from './JoinExport'
import { RecipePanel } from './RecipePanel'
import { useWorkbench } from './use-workbench'

const TYPE_LABEL: Record<ColumnProfile['type'], string> = {
  integer: 'whole numbers',
  decimal: 'numbers',
  'decimal-comma': 'numbers with decimal commas',
  date: 'dates',
  boolean: 'yes / no',
  text: 'text',
  empty: 'empty',
}

const card = 'rounded-md border border-slate-200 p-4 dark:border-slate-800'
const muted = 'text-sm text-slate-500 dark:text-slate-400'

/**
 * The file after the recipe: what is wrong with it, what it looks like now,
 * and the steps that got it here. Everything runs in DuckDB in a worker;
 * the original file is never changed.
 */
export function WorkbenchPanel({ dataset }: { dataset: Dataset }) {
  const bench = useWorkbench(dataset)
  const [tab, setTab] = useState<'problems' | 'data'>('problems')
  const { view, status } = bench
  const add = (step: TransformStep) => void bench.addStep(step)

  return (
    <section aria-label="Clean up" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
        {status.kind === 'loading' && (
          <>
            <span role="status" className="text-slate-600 dark:text-slate-300">
              {status.label}
            </span>
            <button
              type="button"
              onClick={bench.cancel}
              className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </>
        )}
        {status.kind === 'error' && (
          <>
            <span role="alert" className="text-red-700 dark:text-red-300">
              {status.message}
            </span>
            <button
              type="button"
              onClick={() => void bench.retry()}
              className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Try again
            </button>
          </>
        )}
        {view && status.kind !== 'loading' && (
          <span className="text-slate-600 dark:text-slate-300">
            Result: <strong>{view.result.rows.toLocaleString()}</strong> rows × {view.result.columns.length} columns
            {bench.source() && ` · ${bench.source()!.rows.toLocaleString()} in the original file`}
          </span>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div role="tablist" aria-label="Result" className="mb-3 flex gap-1 border-b border-slate-200 dark:border-slate-800">
            {(['problems', 'data'] as const).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                {id === 'problems' ? 'Problems' : 'Data'}
              </button>
            ))}
          </div>

          {!view && status.kind === 'loading' && (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-900" />
              ))}
            </div>
          )}

          {view && tab === 'problems' && (
            <div className="flex flex-col gap-4">
              <div className={card}>
                <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Suggested fixes</h2>
                {suggestions(view.profile).length === 0 ? (
                  <p className={muted}>Nothing obvious left to fix.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {suggestions(view.profile).map((s) => (
                      <li key={s.reason + s.step.kind} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-slate-700 dark:text-slate-300">{s.reason}</span>
                        <button
                          type="button"
                          onClick={() => add(s.step)}
                          disabled={status.kind === 'loading'}
                          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                        >
                          {describeStep(s.step)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Column profile</caption>
                  <thead>
                    <tr className="text-slate-600 dark:text-slate-400">
                      {['Column', 'Looks like', 'Empty', 'Distinct', 'Does not fit'].map((h) => (
                        <th key={h} scope="col" className="border-b border-slate-200 px-2 py-2 font-medium dark:border-slate-800">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.profile.columns.map((c) => (
                      <tr key={c.name} className="align-top text-slate-900 dark:text-slate-100">
                        <th scope="row" className="border-b border-slate-100 px-2 py-2 font-medium dark:border-slate-800">
                          {c.name}
                        </th>
                        <td className="border-b border-slate-100 px-2 py-2 dark:border-slate-800">{TYPE_LABEL[c.type]}</td>
                        <td className="border-b border-slate-100 px-2 py-2 tabular-nums dark:border-slate-800">{c.missing || '—'}</td>
                        <td className="border-b border-slate-100 px-2 py-2 tabular-nums dark:border-slate-800">{c.distinct}</td>
                        <td className="border-b border-slate-100 px-2 py-2 dark:border-slate-800">
                          {c.mismatches ? (
                            <>
                              <span className="font-medium text-red-700 dark:text-red-300">{c.mismatches}</span>
                              <span className={muted}>
                                {' '}
                                — {c.examples.map((e) => `row ${e.row}: “${e.value}”`).join(', ')}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {view.profile.duplicateRows > 0 && (
                <p className={muted}>
                  {view.profile.duplicateRows} {view.profile.duplicateRows === 1 ? 'row repeats' : 'rows repeat'} another row exactly
                  (after trimming spaces).
                </p>
              )}
            </div>
          )}

          {view && tab === 'data' && (
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">The data after the recipe</caption>
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                      Row
                    </th>
                    {view.result.columns.map((c) => (
                      <th key={c} scope="col" className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.preview.map(({ row, cells }) => (
                    <tr key={row}>
                      <td className="border-b border-slate-100 px-3 py-2 text-slate-400 tabular-nums dark:border-slate-800">{row}</td>
                      {view.result.columns.map((c) => (
                        <td key={c} className="border-b border-slate-100 px-3 py-2 text-slate-900 dark:border-slate-800 dark:text-slate-100">
                          {cells[c] === null ? <span className="text-slate-400">empty</span> : String(cells[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.result.rows > view.preview.length && (
                <p className={`${muted} p-2`}>
                  Showing the first {view.preview.length} of {view.result.rows.toLocaleString()} rows.
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <RecipePanel bench={bench} columns={view?.result.columns ?? []} />
          <JoinBox bench={bench} columns={view?.result.columns ?? []} />
          <ExportBox bench={bench} sourceName={dataset.sourceName} disabled={!view || status.kind === 'loading'} />
        </aside>
      </div>
    </section>
  )
}
