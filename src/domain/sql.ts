/** A column or table name as a SQL identifier, whatever characters it holds. */
export const ident = (name: string) => `"${name.replaceAll('"', '""')}"`

/** A string as a SQL literal. */
export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

/** A column, optionally through a table alias. */
const ref = (column: string, alias?: string) => (alias ? `${alias}.${ident(column)}` : ident(column))

/** The text of a cell, typed or not, trimmed — how every check reads a value. */
export const text = (column: string, alias?: string) => `trim(CAST(${ref(column, alias)} AS VARCHAR))`

/** Empty, only spaces, or NULL all count as missing. */
export const missing = (column: string, alias?: string) => `(${ref(column, alias)} IS NULL OR ${text(column, alias)} = '')`

/** 3,5 or 1.234,56 — a decimal written with a comma. */
export const DECIMAL_COMMA = `'^-?(\\d{1,3}(\\.\\d{3})+|\\d+),\\d+$'`
