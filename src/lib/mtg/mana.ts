import { EMPTY_COLOR_COUNTS } from "@/lib/mtg/constants"
import { COLOR_SYMBOLS, type ColorCountMap, type ColorSymbol, type RatingCard } from "@/lib/mtg/types"

type ManaCostProfile = {
  colorIdentity: ColorCountMap
  effectivePips: ColorCountMap
  hasHybridMana: boolean
  hybridOnly: boolean
}

const TOKEN_RE = /\{[^}]+\}|\([^)]*\)|[WUBRG2]\/[WUBRG2]|[WUBRG]/gi

function stripWrapper(token: string): string {
  if (
    (token.startsWith("{") && token.endsWith("}")) ||
    (token.startsWith("(") && token.endsWith(")"))
  ) {
    return token.slice(1, -1)
  }

  return token
}

export function analyzeManaCost(costExpression: string): ManaCostProfile {
  const colorIdentity = EMPTY_COLOR_COUNTS()
  const effectivePips = EMPTY_COLOR_COUNTS()
  const tokens = costExpression.toUpperCase().match(TOKEN_RE) ?? []
  let hasHybridMana = false
  let sawMonoColored = false

  for (const token of tokens) {
    const content = stripWrapper(token)

    if (content.includes("/")) {
      hasHybridMana = true
      const coloredParts = [...new Set(content.split("/").filter((part) => COLOR_SYMBOLS.includes(part as ColorSymbol)))] as ColorSymbol[]
      if (coloredParts.length === 0) {
        continue
      }

      const share = 1 / coloredParts.length
      for (const color of coloredParts) {
        colorIdentity[color] = 1
        effectivePips[color] += share
      }
      continue
    }

    if (COLOR_SYMBOLS.includes(content as ColorSymbol)) {
      const color = content as ColorSymbol
      colorIdentity[color] = 1
      effectivePips[color] += 1
      sawMonoColored = true
    }
  }

  return {
    colorIdentity,
    effectivePips,
    hasHybridMana,
    hybridOnly: hasHybridMana && !sawMonoColored,
  }
}

export function getColorIdentityFromCard(card: RatingCard): ColorSymbol[] {
  const parsed = analyzeManaCost(card.primaryCost)
  const parsedColors = COLOR_SYMBOLS.filter((symbol) => parsed.colorIdentity[symbol] > 0)
  if (parsedColors.length > 0) {
    return parsedColors
  }

  return COLOR_SYMBOLS.filter((symbol) => card.rawColors[symbol] > 0)
}

export function canCastCardWithAvailableColors(
  card: RatingCard,
  availableColors: Set<ColorSymbol>,
): boolean {
  const tokens = card.primaryCost.toUpperCase().match(TOKEN_RE) ?? []
  if (tokens.length === 0) {
    return true
  }

  for (const token of tokens) {
    const content = stripWrapper(token)

    if (content.includes("/")) {
      const parts = content.split("/")
      const coloredParts = parts.filter((part) => COLOR_SYMBOLS.includes(part as ColorSymbol)) as ColorSymbol[]
      const hasGenericOption = parts.some((part) => /^\d+$/.test(part))
      if (hasGenericOption) {
        continue
      }
      if (coloredParts.length > 0 && coloredParts.some((color) => availableColors.has(color))) {
        continue
      }
      return false
    }

    if (COLOR_SYMBOLS.includes(content as ColorSymbol) && !availableColors.has(content as ColorSymbol)) {
      return false
    }
  }

  return true
}
