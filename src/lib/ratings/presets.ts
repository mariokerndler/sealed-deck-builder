import SOS_CONTENT from "@/data/ratings/sos.json?raw"
import SOS_SCRYFALL from "@/data/scryfall/sos.json"
import { buildScryfallDataMap, type ScryfallCard, type ScryfallDataMap } from "@/lib/mtg/scryfall"

export type RatingPreset = {
  id: string
  name: string
  description: string
  /** Raw SOS.js-format string, parsed by parseRatingFileContent */
  content: string
  /** Pre-built Scryfall data map — no API call needed at runtime */
  scryfallData: ScryfallDataMap
}

export const RATING_PRESETS: RatingPreset[] = [
  {
    id: "sos",
    name: "Secrets of Strixhaven",
    description: "Community ratings for the SOS expansion",
    content: SOS_CONTENT,
    scryfallData: buildScryfallDataMap(SOS_SCRYFALL as ScryfallCard[]),
  },
]
