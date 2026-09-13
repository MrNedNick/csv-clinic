import type { ScenarioError } from './use-imported-dataset'

/** Turns a domain or read error into a message the import screen can show. */
export function describeError(error: ScenarioError): string {
  switch (error.kind) {
    case 'empty-input':
      return 'This file has no rows to import.'
    case 'inconsistent-row':
      return `Row ${error.rowIndex + 1} has ${error.actual} column${error.actual === 1 ? '' : 's'}, expected ${error.expected}.`
    case 'read-failed':
      return 'Could not read this file. Try again.'
  }
}
