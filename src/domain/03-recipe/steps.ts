/**
 * A recipe is a list of steps over the original table, which itself is never
 * changed: every result is recomputed from the source, so removing the last
 * step is an exact undo and the same recipe can be replayed on another file.
 */
export type TransformStep =
  | { readonly kind: 'trim'; readonly column: string }
  | { readonly kind: 'fill-missing'; readonly column: string; readonly value: string }
  | { readonly kind: 'drop-missing'; readonly column: string }
  | { readonly kind: 'dedupe'; readonly columns: readonly string[] }
  | { readonly kind: 'decimal-comma'; readonly column: string }
  | { readonly kind: 'cast'; readonly column: string; readonly to: 'integer' | 'decimal' | 'date' }
  | { readonly kind: 'rename'; readonly column: string; readonly to: string }
  | { readonly kind: 'drop-column'; readonly column: string }
  | {
      readonly kind: 'join'
      readonly source: string
      readonly sourceName: string
      readonly leftKey: string
      readonly rightKey: string
      readonly how: 'left' | 'inner'
    }

export interface Recipe {
  readonly format: 'csv-clinic.recipe'
  readonly version: 1
  readonly steps: readonly TransformStep[]
}

/** What a step does, in words, for the step list and the change report. */
export function describeStep(step: TransformStep): string {
  switch (step.kind) {
    case 'trim':
      return `Trim spaces in “${step.column}”`
    case 'fill-missing':
      return `Fill empty “${step.column}” with “${step.value}”`
    case 'drop-missing':
      return `Remove rows with empty “${step.column}”`
    case 'dedupe':
      return step.columns.length
        ? `Remove duplicate rows by ${step.columns.map((c) => `“${c}”`).join(', ')}`
        : 'Remove duplicate rows'
    case 'decimal-comma':
      return `Read decimal commas in “${step.column}” as numbers`
    case 'cast':
      return `Convert “${step.column}” to ${step.to}`
    case 'rename':
      return `Rename “${step.column}” to “${step.to}”`
    case 'drop-column':
      return `Remove column “${step.column}”`
    case 'join':
      return `${step.how === 'left' ? 'Add columns from' : 'Keep only rows matching'} ${step.sourceName} on “${step.leftKey}” = “${step.rightKey}”`
  }
}

/** Which columns the step needs to exist before it runs. */
export function columnsUsed(step: TransformStep): string[] {
  switch (step.kind) {
    case 'dedupe':
      return [...step.columns]
    case 'join':
      return [step.leftKey]
    default:
      return [step.column]
  }
}

/** Refuses a step that cannot run on these columns, with a reason a person can act on. */
export function validateStep(step: TransformStep, columns: readonly string[]): string | null {
  const unknown = columnsUsed(step).filter((c) => !columns.includes(c))
  if (unknown.length) return `No column named ${unknown.map((c) => `“${c}”`).join(', ')} at this point in the recipe.`
  if (step.kind === 'rename') {
    if (!step.to.trim()) return 'The new name is empty.'
    if (columns.includes(step.to)) return `There is already a column named “${step.to}”.`
  }
  if (step.kind === 'drop-column' && columns.length <= 1) return 'A table needs at least one column.'
  return null
}

export function toRecipe(steps: readonly TransformStep[]): Recipe {
  return { format: 'csv-clinic.recipe', version: 1, steps }
}

/** Reads a saved recipe file, or says why it is not one. */
export function parseRecipe(text: string): { ok: true; recipe: Recipe } | { ok: false; message: string } {
  try {
    const data = JSON.parse(text) as Partial<Recipe>
    if (data.format !== 'csv-clinic.recipe' || data.version !== 1 || !Array.isArray(data.steps))
      return { ok: false, message: 'This is not a csv-clinic recipe file.' }
    return { ok: true, recipe: data as Recipe }
  } catch {
    return { ok: false, message: 'This recipe file is not valid JSON.' }
  }
}
