import { formatCardName, getCardNameAliases, normalizeCardName } from "@/lib/mtg/normalize"
import { parsePoolText } from "@/lib/mtg/parser"
import type { PoolEntry, RatingMergeResult } from "@/lib/mtg/types"
import type { ScryfallDataMap } from "@/lib/mtg/scryfall"

export type QuickAddCandidate = {
  name: string
  normalizedName: string
  normalizedAliases: string[]
  type?: string
  rating?: number
  source: "rating" | "scryfall"
}

export type QuickAddParseResult = {
  quantity: number
  query: string
}

const DEFAULT_SUGGESTION_LIMIT = 8

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1).fill(0)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      )
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[b.length] ?? Math.max(a.length, b.length)
}

function getBestAliasScore(query: string, aliases: string[]): number {
  let best = 0

  for (const alias of aliases) {
    if (alias === query) {
      return 1
    }

    const words = query.split(" ").filter(Boolean)
    const allWordsMatch = words.length > 0 && words.every((word) => alias.includes(word))
    if (allWordsMatch) {
      best = Math.max(best, 0.94)
    }

    if (alias.startsWith(query)) {
      best = Math.max(best, 0.92)
    }

    if (alias.includes(query)) {
      best = Math.max(best, 0.88)
    }

    const distance = levenshteinDistance(query, alias)
    const ratio = 1 - distance / Math.max(query.length, alias.length, 1)
    best = Math.max(best, ratio)
  }

  return best
}

export function parseQuickAddInput(input: string): QuickAddParseResult {
  const trimmed = input.trim()
  const quantityMatch = trimmed.match(/^(\d+)\s*x?\s+(.+)$/i)

  if (!quantityMatch) {
    return {
      quantity: 1,
      query: trimmed,
    }
  }

  return {
    quantity: Math.max(1, Number(quantityMatch[1])),
    query: quantityMatch[2]?.trim() ?? "",
  }
}

export function buildQuickAddCandidates(
  ratings: RatingMergeResult,
  scryfallData?: ScryfallDataMap,
): QuickAddCandidate[] {
  const byName = new Map<string, QuickAddCandidate>()

  for (const { card } of ratings.index.values()) {
    if (byName.has(card.normalizedName)) {
      continue
    }

    byName.set(card.normalizedName, {
      name: card.displayName,
      normalizedName: card.normalizedName,
      normalizedAliases: card.normalizedAliases,
      type: card.type,
      rating: card.rating,
      source: "rating",
    })
  }

  if (scryfallData) {
    for (const card of new Map([...scryfallData.entries()]).values()) {
      const formattedName = formatCardName(card.name)
      const normalizedName = normalizeCardName(formattedName)
      if (byName.has(normalizedName)) {
        continue
      }

      const aliases = getCardNameAliases(formattedName).map((alias) => normalizeCardName(alias))
      byName.set(normalizedName, {
        name: formattedName,
        normalizedName,
        normalizedAliases: aliases,
        type: card.type_line,
        source: "scryfall",
      })
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function searchQuickAddCandidates(
  input: string,
  candidates: QuickAddCandidate[],
  limit = DEFAULT_SUGGESTION_LIMIT,
): QuickAddCandidate[] {
  const parsed = parseQuickAddInput(input)
  const normalizedQuery = normalizeCardName(parsed.query)

  if (!normalizedQuery) {
    return candidates.slice(0, limit)
  }

  return candidates
    .map((candidate) => ({
      candidate,
      score: getBestAliasScore(normalizedQuery, candidate.normalizedAliases),
    }))
    .filter((entry) => entry.score >= 0.52)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }

      if ((b.candidate.rating ?? 0) !== (a.candidate.rating ?? 0)) {
        return (b.candidate.rating ?? 0) - (a.candidate.rating ?? 0)
      }

      return a.candidate.name.localeCompare(b.candidate.name)
    })
    .slice(0, limit)
    .map((entry) => entry.candidate)
}

function serializeEntry(entry: PoolEntry): string {
  return `${entry.quantity} ${formatCardName(entry.inputName)}`
}

export function serializePoolEntries(entries: PoolEntry[]): string {
  return entries
    .filter((entry) => entry.quantity > 0 && entry.inputName.trim().length > 0)
    .map(serializeEntry)
    .join("\n")
}

export function upsertPoolEntry(
  poolText: string,
  cardName: string,
  quantityDelta: number,
): string {
  const targetName = formatCardName(cardName)
  const targetAliases = new Set(
    getCardNameAliases(targetName).map((alias) => normalizeCardName(alias)),
  )
  const poolEntries = poolText.trim().length > 0 ? parsePoolText(poolText) : []

  const existingIndex = poolEntries.findIndex((entry) =>
    entry.normalizedAliases.some((alias) => targetAliases.has(alias)),
  )

  if (existingIndex === -1) {
    if (quantityDelta <= 0) {
      return serializePoolEntries(poolEntries)
    }

    return serializePoolEntries([
      ...poolEntries,
      {
        quantity: quantityDelta,
        inputName: targetName,
        normalizedName: normalizeCardName(targetName),
        normalizedAliases: [...targetAliases],
      },
    ])
  }

  const nextEntries = [...poolEntries]
  const existing = nextEntries[existingIndex]
  if (!existing) {
    return serializePoolEntries(poolEntries)
  }

  nextEntries[existingIndex] = {
    ...existing,
    inputName: targetName,
    normalizedName: normalizeCardName(targetName),
    normalizedAliases: [...targetAliases],
    quantity: Math.max(0, existing.quantity + quantityDelta),
  }

  return serializePoolEntries(nextEntries)
}
