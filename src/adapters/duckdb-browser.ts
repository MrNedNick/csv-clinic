import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import { CancelledError, type Engine, type Row } from '../domain/engine'

/**
 * DuckDB-Wasm in its own Web Worker: the worker owns the database, the page
 * only sends SQL. Loaded the first time a file is opened, not with the page.
 *
 * Cancelling terminates the worker — the only way to stop a query already
 * running inside it. The next call starts a fresh one, and the caller replays
 * its sources and recipe onto it.
 */
export interface BrowserEngine extends Engine {
  cancel(): void
}

export function createBrowserEngine(): BrowserEngine {
  let ready: Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection; worker: Worker }> | null = null
  let generation = 0
  const pending = new Set<(error: Error) => void>()

  async function start() {
    const duckdb = await import('@duckdb/duckdb-wasm')
    const [{ default: mvpWasm }, { default: mvpWorker }, { default: ehWasm }, { default: ehWorker }] = await Promise.all([
      import('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'),
      import('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'),
      import('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'),
      import('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'),
    ])
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
      eh: { mainModule: ehWasm, mainWorker: ehWorker },
    })
    const worker = new Worker(bundle.mainWorker!)
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
    await db.instantiate(bundle.mainModule)
    return { db, conn: await db.connect(), worker }
  }

  /** Runs `task` on the current database; a cancel while it runs rejects it with CancelledError. */
  async function withDb<T>(task: (db: AsyncDuckDB, conn: AsyncDuckDBConnection) => Promise<T>): Promise<T> {
    ready ??= start()
    const mine = generation
    return new Promise<T>((resolve, reject) => {
      const cancel = (error: Error) => reject(error)
      pending.add(cancel)
      ready!
        .then(({ db, conn }) => task(db, conn))
        .then(
          (value) => (mine === generation ? resolve(value) : reject(new CancelledError())),
          (error) => reject(mine === generation ? error : new CancelledError()),
        )
        .finally(() => pending.delete(cancel))
    })
  }

  return {
    registerFile: (name, text) => withDb((db) => db.registerFileText(name, text)),
    run: (sql) => withDb(async (_, conn) => void (await conn.query(sql))),
    rows: (sql) =>
      withDb(async (_, conn) =>
        (await conn.query(sql)).toArray().map((r) => {
          const json = r.toJSON() as Record<string, unknown>
          return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])) as Row
        }),
      ),
    cancel() {
      generation++
      const old = ready
      ready = null
      for (const reject of pending) reject(new CancelledError())
      pending.clear()
      void old?.then(({ worker }) => worker.terminate()).catch(() => {})
    },
  }
}
