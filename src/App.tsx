import { ImportPanel } from './features/01-import/ImportPanel'
import { WorkbenchPanel } from './features/02-workbench/WorkbenchPanel'

function App() {
  return (
    <main className="min-h-svh bg-white dark:bg-slate-950">
      {/* Keyed by file, so opening another file starts a fresh workbench. */}
      <ImportPanel>{(dataset) => <WorkbenchPanel key={dataset.sourceName + dataset.rowCount} dataset={dataset} />}</ImportPanel>
    </main>
  )
}

export default App
