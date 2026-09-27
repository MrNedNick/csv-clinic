import type { Dataset } from '../domain/01-import/types'
import type { TransformStep } from '../domain/03-recipe/steps'

export interface Session {
  readonly steps: readonly TransformStep[]
  readonly redo: readonly TransformStep[]
  /** Files opened to join with, kept so a reload can replay the recipe. */
  readonly extras: readonly { readonly id: string; readonly dataset: Dataset }[]
}

const empty: Session = { steps: [], redo: [], extras: [] }
const key = (sourceName: string) => `csv-clinic:session:${sourceName}`

/** The recipe for a file, keyed by its name, so reopening the same file picks it up again. */
export function loadSession(sourceName: string): Session {
  try {
    const raw = localStorage.getItem(key(sourceName))
    return raw ? { ...empty, ...(JSON.parse(raw) as Session) } : empty
  } catch {
    return empty
  }
}

export function saveSession(sourceName: string, session: Session): void {
  try {
    localStorage.setItem(key(sourceName), JSON.stringify(session))
  } catch {
    // Too large with the joined files: keep at least the recipe.
    try {
      localStorage.setItem(key(sourceName), JSON.stringify({ ...session, extras: [] }))
    } catch {
      // Storage blocked — the session still works until the tab closes.
    }
  }
}
