export const COLOR_SYMBOLS = ["W", "U", "B", "R", "G"] as const

export type ColorSymbol = (typeof COLOR_SYMBOLS)[number]

export type ColorCountMap = Record<ColorSymbol, number>

export type DeckColorIdentity = {
  base: ColorSymbol[]
  splash?: ColorSymbol
}

export type CardRole = {
  colorCount: number
  maxSingleColorPip: number
  totalColoredPips: number
  isCheapCreature: boolean
  isExpensiveFinisher: boolean
  isInteraction: boolean
  isConditionalCard: boolean
  isColorlessPlayable: boolean
  isFixing: boolean
}

export type RatingCard = {
  name: string
  displayName: string
  aliases: string[]
  normalizedAliases: string[]
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
  role: CardRole
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
  normalizedAliases: string[]
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
  earlyBoardPresence: number
  removalDensity: number
  splashStrain: number
  manaSourceSufficiency: number
  topEndLoad: number
  nonCreatureSaturation: number
}

export type ScoreBreakdown = {
  cardQuality: number
  manaConsistency: number
  earlyGameStability: number
  creatureStructure: number
  interactionQuality: number
  topEndBurden: number
  colorDepthResilience: number
  deckCoherence: number
  penalties: number
  total: number
}

export type RankedDeckResult = {
  id: string
  colors: DeckColorIdentity
  mainDeck: DeckCard[]
  fullDeck: DeckCard[]
  basicLands: ColorCountMap
  spellCount: number
  landCount: number
  totalCardCount: number
  totalScore: number
  explanation: string
  diagnostics: string[]
  metrics: DeckMetrics
  scoreBreakdown: ScoreBreakdown
}

export type SearchConfig = {
  deckSize: number
  spellSlots: number
  defaultLands: number
  includeMonoColor: boolean
  allowSplash: boolean
  maxResults: number
  candidateLimit: number
  variantsPerCandidate: number
}
