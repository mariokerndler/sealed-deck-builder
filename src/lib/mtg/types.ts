export const COLOR_SYMBOLS = ["W", "U", "B", "R", "G"] as const

export type ColorSymbol = (typeof COLOR_SYMBOLS)[number]

export type ColorCountMap = Record<ColorSymbol, number>

export type DeckColorIdentity = {
  base: ColorSymbol[]
  splash?: ColorSymbol
}

export type RatingCard = {
  name: string
  displayName: string
  type: string
  rarity: string
  rating: number
  cmc: number
  rawColors: ColorCountMap
  alternateRawColors?: ColorCountMap
  alternateCost?: string
  primaryCost: string
  image?: string
  isCreature: boolean
  isLand: boolean
  isInstantLike: boolean
  normalizedName: string
}

export type RatingFileParseResult = {
  fileName: string
  cards: RatingCard[]
  conflicts: string[]
}

export type PoolEntry = {
  quantity: number
  inputName: string
  normalizedName: string
}

export type PoolCard = {
  quantity: number
  ratingCard: RatingCard
}

export type MissingPoolCard = {
  quantity: number
  inputName: string
  normalizedName: string
}

export type RatingIndexEntry = {
  card: RatingCard
  sources: string[]
}

export type RatingMergeResult = {
  index: Map<string, RatingIndexEntry>
  conflicts: string[]
}

export type DeckCard = {
  card: RatingCard
  quantity: number
  adjustedScore: number
  notes: string[]
}

export type DeckMetrics = {
  creatureCount: number
  nonCreatureCount: number
  interactionCount: number
  cheapPlays: number
  expensiveSpells: number
  averageCmc: number
  manaStability: number
  curveScore: number
}

export type RankedDeckResult = {
  id: string
  colors: DeckColorIdentity
  mainDeck: DeckCard[]
  basicLands: ColorCountMap
  spellCount: number
  landCount: number
  totalScore: number
  explanation: string
  diagnostics: string[]
  metrics: DeckMetrics
}

export type SearchConfig = {
  deckSize: number
  spellSlots: number
  defaultLands: number
  includeMonoColor: boolean
  allowSplash: boolean
  maxResults: number
}
