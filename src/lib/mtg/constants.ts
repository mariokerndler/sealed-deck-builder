import type { ColorCountMap, ColorSymbol, SearchConfig } from "@/lib/mtg/types"

export const COLOR_NAMES: Record<ColorSymbol, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
}

export const BASIC_LAND_NAMES: Record<ColorSymbol, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
}

export const EMPTY_COLOR_COUNTS = (): ColorCountMap => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
})

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  deckSize: 40,
  spellSlots: 23,
  defaultLands: 17,
  includeMonoColor: true,
  allowSplash: true,
  maxResults: 5,
  candidateLimit: 8,
  variantsPerCandidate: 3,
}
