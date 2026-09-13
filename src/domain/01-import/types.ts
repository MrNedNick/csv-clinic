export interface Dialect {
  readonly delimiter: string
  readonly quoteChar: string
  readonly hasHeader: boolean
}

export interface Dataset {
  readonly sourceName: string
  readonly dialect: Dialect
  readonly columns: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly rowCount: number
}

export type ImportError =
  | { readonly kind: 'empty-input' }
  | {
      readonly kind: 'inconsistent-row'
      readonly rowIndex: number
      readonly expected: number
      readonly actual: number
    }

export type ImportResult =
  | { readonly ok: true; readonly dataset: Dataset }
  | { readonly ok: false; readonly error: ImportError }
