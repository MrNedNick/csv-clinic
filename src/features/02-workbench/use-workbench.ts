import { useEffect, useState, useSyncExternalStore } from 'react'
import { createBrowserEngine, type BrowserEngine } from '../../adapters/duckdb-browser'
import { loadSession, saveSession, type Session } from '../../adapters/session-storage'
import { StepError, Workbench, type RecipeResult } from '../../application/workbench'
import { importCsv } from '../../domain/01-import/parse-csv'
import type { Dataset } from '../../domain/01-import/types'
import type { TableProfile } from '../../domain/02-profile/profile'
import type { TransformStep } from '../../domain/03-recipe/steps'
import { CancelledError, type Row } from '../../domain/engine'

export interface WorkbenchView {
  readonly result: RecipeResult
  readonly profile: TableProfile
  readonly preview: { row: number; cells: Row }[]
}

export type Status = { kind: 'loading'; label: string } | { kind: 'ready' } | { kind: 'error'; message: string }

interface State {
  readonly status: Status
  readonly view: WorkbenchView | null
  readonly stepError: { index: number; message: string } | null
  readonly session: Session
}

/**
 * Keeps one Workbench in step with the recipe. Every change goes through
 * `run`: the new recipe is replayed on the untouched source, and only when it
 * finishes does it become the recipe on screen and in storage. A cancel or a
 * step that does not fit leaves the last good recipe in place.
 */
class WorkbenchController {
  private readonly dataset: Dataset
  private readonly engine: BrowserEngine = createBrowserEngine()
  private bench: Workbench
  private committed: Session
  private started = false
  private listeners = new Set<() => void>()
  state: State

  constructor(dataset: Dataset) {
    this.dataset = dataset
    this.bench = new Workbench(this.engine)
    this.committed = loadSession(dataset.sourceName)
    this.state = { status: { kind: 'loading', label: 'Starting the database…' }, view: null, stepError: null, session: this.committed }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  start() {
    if (this.started) return
    this.started = true
    void this.run(this.committed, 'Loading the file into the database…')
  }

  private async run(next: Session, label: string): Promise<boolean> {
    this.set({ status: { kind: 'loading', label }, stepError: null })
    try {
      if (!this.bench.sources.has('main')) await this.bench.addSource('main', this.dataset)
      for (const extra of next.extras) if (!this.bench.sources.has(extra.id)) await this.bench.addSource(extra.id, extra.dataset)
      const result = await this.bench.apply('main', next.steps)
      const profile = await this.bench.profile()
      const preview = await this.bench.preview(50)
      this.committed = next
      saveSession(this.dataset.sourceName, next)
      this.set({ session: next, view: { result, profile, preview }, status: { kind: 'ready' } })
      return true
    } catch (error) {
      if (error instanceof CancelledError) {
        // The worker went away with its tables. With a result on screen, rebuild
        // it; a first load that was cancelled simply stops.
        this.bench = new Workbench(this.engine)
        if (this.state.view) void this.run(this.committed, 'Restoring the last result…')
        else this.set({ status: { kind: 'error', message: 'Loading was cancelled.' } })
        return false
      }
      if (error instanceof StepError && next !== this.committed) {
        // A step that does not fit is refused, not kept.
        await this.run(this.committed, 'Restoring the last result…')
        this.set({ stepError: { index: Math.min(error.index, this.committed.steps.length), message: error.message } })
        return false
      }
      this.set({
        status: { kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' },
        stepError: error instanceof StepError ? { index: error.index, message: error.message } : null,
      })
      return false
    }
  }

  private commit(steps: readonly TransformStep[], redo: readonly TransformStep[] = [], label = 'Applying the recipe…') {
    return this.run({ ...this.committed, steps, redo }, label)
  }

  addStep = (step: TransformStep) => this.commit([...this.committed.steps, step])
  removeStep = (index: number) => this.commit(this.committed.steps.filter((_, i) => i !== index))
  replaceRecipe = (steps: TransformStep[]) => this.commit(steps, [], 'Applying the loaded recipe…')

  undo = () => {
    const steps = [...this.committed.steps]
    const last = steps.pop()
    return last ? this.commit(steps, [last, ...this.committed.redo]) : Promise.resolve(false)
  }

  redo = () => {
    const [next, ...rest] = this.committed.redo
    return next ? this.commit([...this.committed.steps, next], rest) : Promise.resolve(false)
  }

  addExtra = async (file: File) => {
    const result = importCsv(await file.text(), file.name)
    if (!result.ok) return 'That file could not be read as CSV.'
    const id = `extra-${Date.now().toString(36)}`
    await this.run({ ...this.committed, extras: [...this.committed.extras, { id, dataset: result.dataset }] }, `Loading ${file.name}…`)
    return null
  }

  cancel = () => this.engine.cancel()
  retry = () => this.run(this.committed, 'Loading the file into the database…')
  exportCsv = (delimiter: string) => this.bench.exportCsv(delimiter)
  report = (delimiter: string) => this.bench.report(delimiter)
  source = () => this.bench.sources.get('main')
  sourceColumns = (id: string) => this.bench.sources.get(id)?.columns ?? []
}

export function useWorkbench(dataset: Dataset) {
  const [controller] = useState(() => new WorkbenchController(dataset))
  useEffect(() => controller.start(), [controller])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { session } = state
  return {
    ...state,
    steps: session.steps,
    extras: session.extras,
    canUndo: session.steps.length > 0,
    canRedo: session.redo.length > 0,
    addStep: controller.addStep,
    removeStep: controller.removeStep,
    undo: controller.undo,
    redo: controller.redo,
    replaceRecipe: controller.replaceRecipe,
    addExtra: controller.addExtra,
    cancel: controller.cancel,
    retry: controller.retry,
    exportCsv: controller.exportCsv,
    report: controller.report,
    source: controller.source,
    sourceColumns: controller.sourceColumns,
  }
}
