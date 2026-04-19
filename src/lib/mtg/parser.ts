import JSON5 from "json5"

import { EMPTY_COLOR_COUNTS } from "@/lib/mtg/constants"
import { formatCardName, getCardNameAliases, normalizeCardName } from "@/lib/mtg/normalize"
import { COLOR_SYMBOLS, type CardRole, type PoolEntry, type RatingCard, type RatingFileParseResult, type RatingMergeResult } from "@/lib/mtg/types"

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
  const start = input.indexOf("[")
  const end = input.lastIndexOf("]")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not find a rating array in the uploaded file.")
  }

  return input.slice(start, end + 1)
}

function toColorCounts(rawColors: number[] | undefined) {
  const counts = EMPTY_COLOR_COUNTS()

  COLOR_SYMBOLS.forEach((symbol, index) => {
    counts[symbol] = Number(rawColors?.[index] ?? 0)
  })

  return counts
}

function deriveCardRole(
  type: string,
  cmc: number,
  rawColors: ReturnType<typeof toColorCounts>,
  primaryCost: string,
  alternateCost: string | undefined,
): CardRole {
  const colorCounts = COLOR_SYMBOLS.map((symbol) => rawColors[symbol])
  const colorCount = colorCounts.filter((count) => count > 0).length
  const totalColoredPips = colorCounts.reduce((sum, count) => sum + count, 0)
  const maxSingleColorPip = Math.max(0, ...colorCounts)
  const lowerType = type.toLowerCase()
  const isCreature = lowerType.includes("creature")
  const isInteraction =
    /instant|sorcery|spell/.test(lowerType) ||
    (!isCreature && /destroy|counter|fight|damage|bounce/.test(primaryCost.toLowerCase()))
  const isConditionalCard =
    maxSingleColorPip >= 2 || cmc >= 6 || /x/i.test(primaryCost) || /x/i.test(alternateCost ?? "")
  const isFixing =
    /land/.test(lowerType) &&
    /[WUBRG]{2,}/.test(alternateCost ?? "") &&
    totalColoredPips === 0

  return {
    colorCount,
    maxSingleColorPip,
    totalColoredPips,
    isCheapCreature: isCreature && cmc <= 3,
    isExpensiveFinisher: isCreature && cmc >= 5,
    isInteraction,
    isConditionalCard,
    isColorlessPlayable: totalColoredPips === 0 && !/land/.test(lowerType),
    isFixing,
  }
}

function parseRatingCard(rawCard: RawRatingCard): RatingCard {
  const displayName = formatCardName(rawCard.name ?? "")
  const normalizedName = normalizeCardName(displayName)
  const aliases = getCardNameAliases(displayName)
  const rawColors = toColorCounts(rawCard.colors)
  const type = rawCard.type?.trim() ?? "Unknown"
  const primaryCost = String(rawCard.castingcost1 ?? "")
  const alternateCost =
    rawCard.castingcost2 && rawCard.castingcost2 !== "none"
      ? rawCard.castingcost2
      : undefined

  return {
    name: rawCard.name ?? displayName,
    displayName,
    aliases,
    normalizedAliases: aliases.map((alias) => normalizeCardName(alias)),
    type,
    rarity: String(rawCard.rarity ?? ""),
    rating: Number(rawCard.myrating ?? 0),
    cmc: Number(rawCard.cmc ?? 0),
    rawColors,
    alternateRawColors: undefined,
    alternateCost,
    primaryCost,
    image: rawCard.image,
    isCreature: /creature/i.test(type),
    isLand: /land/i.test(type),
    isInstantLike: /instant|spell|sorcery/i.test(type),
    normalizedName,
    role: deriveCardRole(type, Number(rawCard.cmc ?? 0), rawColors, primaryCost, alternateCost),
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
      for (const alias of card.normalizedAliases) {
        const existing = index.get(alias)

        if (!existing) {
          index.set(alias, {
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

        if (!existing.sources.includes(file.fileName)) {
          existing.sources.push(file.fileName)
        }

        if (!sameCard) {
          conflicts.push(
            `${card.displayName} appeared in multiple files with different values. Keeping the first version from ${existing.sources[0]}.`,
          )
        }
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
      const aliases = getCardNameAliases(inputName)

      return {
        quantity,
        inputName,
        normalizedName: normalizeCardName(inputName),
        normalizedAliases: aliases.map((alias) => normalizeCardName(alias)),
      }
    })
}
