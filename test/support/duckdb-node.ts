import { createRequire } from 'node:module'
import path from 'node:path'
import { createDuckDB, NODE_RUNTIME, VoidLogger } from '@duckdb/duckdb-wasm/blocking'
import type { Engine, Row } from '../../src/domain/engine'

const require = createRequire(import.meta.url)
const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm'))

/** The same DuckDB-Wasm the browser runs, in-process: the SQL under test is the SQL that ships. */
export async function nodeEngine(): Promise<Engine> {
  const db = await createDuckDB(
    {
      mvp: { mainModule: path.join(dist, 'duckdb-mvp.wasm'), mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs') },
      eh: { mainModule: path.join(dist, 'duckdb-eh.wasm'), mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs') },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  )
  await db.instantiate()
  const conn = db.connect()
  return {
    async registerFile(name, text) {
      db.registerFileText(name, text)
    },
    async run(sql) {
      conn.query(sql)
    },
    async rows(sql) {
      return conn
        .query(sql)
        .toArray()
        .map((r) => {
          const json = r.toJSON() as Record<string, unknown>
          return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])) as Row
        })
    },
  }
}
