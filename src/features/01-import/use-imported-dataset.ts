import { useCallback, useState } from 'react'
import { importCsv } from '../../domain/01-import/parse-csv'
import type { Dataset, ImportError } from '../../domain/01-import/types'
import { clearDataset, loadDataset, saveDataset } from '../../adapters/dataset-storage'

/** Read failures live outside the T1 contract — the domain layer never touches a File. */
export type ScenarioError = ImportError | { readonly kind: 'read-failed' }

export type ImportState =
  | { readonly status: 'empty' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ScenarioError }
  | { readonly status: 'ready'; readonly dataset: Dataset }

/**
 * Wires the T1 import contract to a file picker and to localStorage, so the
 * working scenario survives a reload. `importFile` owns the FileReader;
 * everything after the text is in hand goes through the pure domain call.
 */
export function useImportedDataset() {
  const [state, setState] = useState<ImportState>(() => {
    const restored = loadDataset()
    return restored ? { status: 'ready', dataset: restored } : { status: 'empty' }
  })

  const importFile = useCallback((file: File) => {
    setState({ status: 'loading' })

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const result = importCsv(text, file.name)
      if (result.ok) {
        saveDataset(result.dataset)
        setState({ status: 'ready', dataset: result.dataset })
      } else {
        setState({ status: 'error', error: result.error })
      }
    }
    reader.onerror = () => {
      setState({ status: 'error', error: { kind: 'read-failed' } })
    }
    reader.readAsText(file)
  }, [])

  const reset = useCallback(() => {
    clearDataset()
    setState({ status: 'empty' })
  }, [])

  return { state, importFile, reset }
}
