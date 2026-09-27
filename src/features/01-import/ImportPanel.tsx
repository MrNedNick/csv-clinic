import type { ChangeEvent, ReactNode } from 'react'
import type { Dataset } from '../../domain/01-import/types'
import { SAMPLE, SAMPLE_NAME } from '../../sample'
import { previewRows } from '../../domain/01-import/parse-csv'
import { describeError } from './describe-error'
import { useImportedDataset } from './use-imported-dataset'

const PREVIEW_LIMIT = 10

/** `children` renders under the preview once a file is loaded — the clean-up workbench in the app. */
export function ImportPanel({ children }: { children?: (dataset: Dataset) => ReactNode } = {}) {
  const { state, importFile, reset } = useImportedDataset()

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) importFile(file)
    event.target.value = ''
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">csv-clinic</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Open a CSV, see what is wrong with it, fix it with a recipe and download a clean file. It all runs in this
            browser; the file is not uploaded anywhere.
          </p>
        </div>
        <label className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
          Open CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={handleFileChange}
            aria-label="Open CSV"
          />
        </label>
      </div>

      {state.status === 'empty' && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <p>No file loaded yet. Open a CSV to see a preview.</p>
          <button
            type="button"
            onClick={() => importFile(new File([SAMPLE], SAMPLE_NAME, { type: 'text/csv' }))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Try a messy sample file
          </button>
        </div>
      )}

      {state.status === 'loading' && (
        <p role="status" className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Reading file…
        </p>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {describeError(state.error)}
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>
              {state.dataset.sourceName} — {state.dataset.rowCount} row
              {state.dataset.rowCount === 1 ? '' : 's'}, {state.dataset.columns.length} column
              {state.dataset.columns.length === 1 ? '' : 's'} (delimiter “{state.dataset.dialect.delimiter}”)
            </span>
            <button
              type="button"
              onClick={reset}
              className="text-slate-500 underline hover:text-slate-900 dark:hover:text-slate-100"
            >
              Clear
            </button>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  {state.dataset.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows(state.dataset, PREVIEW_LIMIT).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-b border-slate-100 px-3 py-2 text-slate-900 dark:border-slate-800 dark:text-slate-100"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.dataset.rowCount > PREVIEW_LIMIT && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing the first {PREVIEW_LIMIT} of {state.dataset.rowCount} rows of the original file.
            </p>
          )}
          {children?.(state.dataset)}
        </>
      )}
    </div>
  )
}
