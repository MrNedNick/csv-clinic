import type { Dataset } from '../domain/01-import/types'

const STORAGE_KEY = 'csv-clinic:last-dataset'

/**
 * Keeps the last imported dataset in localStorage so a reload restores the
 * working session instead of dropping it. Large files and multi-dataset
 * state are out of scope here — this stage is UI over the T1 contract, not
 * the DuckDB-backed storage the later stages own.
 */
export function saveDataset(dataset: Dataset): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset))
  } catch {
    // Storage full or blocked (private browsing) — losing session recovery
    // is acceptable, losing the current import in memory is not.
  }
}

export function loadDataset(): Dataset | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Dataset) : null
  } catch {
    return null
  }
}

export function clearDataset(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
