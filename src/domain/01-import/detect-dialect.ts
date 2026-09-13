import type { Dialect } from './types'

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const

/**
 * Picks the delimiter that splits the first few lines into the same,
 * non-zero number of fields — the only signal that survives across
 * locales and quoting styles.
 */
export function detectDialect(text: string): Dialect {
  const sampleLines = text
    .split(/\r\n|\r|\n/)
    .slice(0, 5)
    .filter((line) => line.length > 0)

  return {
    delimiter: pickDelimiter(sampleLines),
    quoteChar: '"',
    hasHeader: true,
  }
}

function pickDelimiter(lines: readonly string[]): string {
  let best: string = CANDIDATE_DELIMITERS[0]
  let bestScore = -1

  for (const candidate of CANDIDATE_DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, candidate))
    const isConsistent = counts.length > 0 && counts[0] > 0 && counts.every((count) => count === counts[0])
    const score = isConsistent ? counts[0] : -1
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0
  let inQuotes = false
  for (const current of line) {
    if (current === '"') {
      inQuotes = !inQuotes
    } else if (current === char && !inQuotes) {
      count += 1
    }
  }
  return count
}
