import JSON5 from "json5"

import { EMPTY_COLOR_COUNTS } from "@/lib/mtg/constants"
import { formatCardName, normalizeCardName } from "@/lib/mtg/normalize"
import { COLOR_SYMBOLS, type PoolEntry, type RatingCard, type RatingFileParseResult, type RatingMergeResult } from "@/lib/mtg/types"

type RawRatingCard = {
  name?: string
  type?: string
  rarity?: string
  myrating?: string | number
  cmc?: string | number
  colors?: number[]
  castingcost1?: string
  castingcost2?: string
  image?: string
}

function extractArrayPayload(input: string): string {
  const withoutBlockComments = input.replace(/\/\*[\s\S]*?\*\//g, "")
  const withoutLineComments = withoutBlockComments.replace(/(^|[^:])\/\/.*$/gm, "$1")
  const start = withoutLineComments.indexOf("[")
  const end = withoutLineComments.lastIndexOf("]")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not find a rating array in the uploaded file.")
  }

  return withoutLineComments.slice(start, end + 1)
}

function toColorCounts(rawColors: number[] | undefined) {
  const counts = EMPTY_COLOR_COUNTS()

  COLOR_SYMBOLS.forEach((symbol, index) => {
    counts[symbol] = Number(rawColors?.[index] ?? 0)
  })

  return counts
}

function parseRatingCard(rawCard: RawRatingCard): RatingCard {
  const displayName = formatCardName(rawCard.name ?? "")
  const normalizedName = normalizeCardName(displayName)
  const rawColors = toColorCounts(rawCard.colors)
  const type = rawCard.type?.trim() ?? "Unknown"

  return {
    name: rawCard.name ?? displayName,
    displayName,
    type,
    rarity: String(rawCard.rarity ?? ""),
    rating: Number(rawCard.myrating ?? 0),
    cmc: Number(rawCard.cmc ?? 0),
    rawColors,
    alternateRawColors: undefined,
    alternateCost:
      rawCard.castingcost2 && rawCard.castingcost2 !== "none"
        ? rawCard.castingcost2
        : undefined,
    primaryCost: String(rawCard.castingcost1 ?? ""),
    image: rawCard.image,
    isCreature: /creature/i.test(type),
    isLand: /land/i.test(type),
    isInstantLike: /instant|spell|sorcery/i.test(type),
    normalizedName,
  }
}

export function parseRatingFileContent(
  text: string,
  fileName: string,
): RatingFileParseResult {
  const payload = extractArrayPayload(text)
  const parsed = JSON5.parse(payload)

  if (!Array.isArray(parsed)) {
    throw new Error("The rating file did not contain an array of card entries.")
  }

  const cards = parsed
    .map((entry) => parseRatingCard(entry as RawRatingCard))
    .filter((card) => card.normalizedName.length > 0)

  return {
    fileName,
    cards,
    conflicts: [],
  }
}

export function mergeRatingFiles(
  files: RatingFileParseResult[],
): RatingMergeResult {
  const index = new Map<string, { card: RatingCard; sources: string[] }>()
  const conflicts: string[] = []

  for (const file of files) {
    for (const card of file.cards) {
      const existing = index.get(card.normalizedName)

      if (!existing) {
        index.set(card.normalizedName, {
          card,
          sources: [file.fileName],
        })
        continue
      }

      const sameCard =
        existing.card.displayName === card.displayName &&
        existing.card.type === card.type &&
        existing.card.rating === card.rating &&
        existing.card.cmc === card.cmc

      existing.sources.push(file.fileName)

      if (!sameCard) {
        conflicts.push(
          `${card.displayName} appeared in multiple files with different values. Keeping the first version from ${existing.sources[0]}.`,
        )
      }
    }
  }

  return { index, conflicts }
}

export function parsePoolText(poolText: string): PoolEntry[] {
  return poolText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s*x?\s+(.+)$/i)
      const quantity = match ? Number(match[1]) : 1
      const inputName = match ? match[2].trim() : line

      return {
        quantity,
        inputName,
        normalizedName: normalizeCardName(inputName),
      }
    })
}
