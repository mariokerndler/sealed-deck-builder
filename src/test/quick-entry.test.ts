import { describe, expect, it } from "vitest"

import {
  buildQuickAddCandidates,
  parseQuickAddInput,
  searchQuickAddCandidates,
  upsertPoolEntry,
} from "@/lib/mtg"

const RATINGS = {
  index: new Map([
    [
      "harsh annotation",
      {
        card: {
          name: "Harsh Annotation",
          displayName: "Harsh Annotation",
          aliases: ["Harsh Annotation"],
          normalizedAliases: ["harsh annotation"],
          type: "Sorcery",
          rarity: "C",
          rating: 3.1,
          cmc: 2,
          rawColors: { W: 0, U: 0, B: 0, R: 1, G: 0 },
          alternateRawColors: undefined,
          alternateCost: undefined,
          primaryCost: "1R",
          image: undefined,
          isCreature: false,
          isLand: false,
          isInstantLike: false,
          normalizedName: "harsh annotation",
          role: {
            colorCount: 1,
            maxSingleColorPip: 1,
            totalColoredPips: 1,
            hasHybridMana: false,
            isHybridOnlyFlexible: false,
            isCheapCreature: false,
            isExpensiveFinisher: false,
            isInteraction: false,
            isConditionalCard: false,
            isColorlessPlayable: false,
            isFixing: false,
          },
        },
        sources: ["test.js"],
      },
    ],
    [
      "moseo veins new dean",
      {
        card: {
          name: "Moseo, Vein's New Dean",
          displayName: "Moseo, Vein's New Dean",
          aliases: ["Moseo, Vein's New Dean"],
          normalizedAliases: ["moseo veins new dean"],
          type: "Creature",
          rarity: "R",
          rating: 3.9,
          cmc: 4,
          rawColors: { W: 0, U: 0, B: 1, R: 1, G: 0 },
          alternateRawColors: undefined,
          alternateCost: undefined,
          primaryCost: "2BR",
          image: undefined,
          isCreature: true,
          isLand: false,
          isInstantLike: false,
          normalizedName: "moseo veins new dean",
          role: {
            colorCount: 2,
            maxSingleColorPip: 1,
            totalColoredPips: 2,
            hasHybridMana: false,
            isHybridOnlyFlexible: false,
            isCheapCreature: false,
            isExpensiveFinisher: false,
            isInteraction: false,
            isConditionalCard: false,
            isColorlessPlayable: false,
            isFixing: false,
          },
        },
        sources: ["test.js"],
      },
    ],
  ]),
  conflicts: [],
}

describe("quick entry helpers", () => {
  it("parses quantity prefixes", () => {
    expect(parseQuickAddInput("2x Harsh Annotation")).toEqual({
      quantity: 2,
      query: "Harsh Annotation",
    })
    expect(parseQuickAddInput("3 moseo dean")).toEqual({
      quantity: 3,
      query: "moseo dean",
    })
  })

  it("returns fuzzy set-aware suggestions", () => {
    const candidates = buildQuickAddCandidates(RATINGS)
    const matches = searchQuickAddCandidates("moseo dean", candidates)

    expect(matches[0]?.name).toBe("Moseo, Vein's New Dean")
  })

  it("upserts and increments existing pool entries", () => {
    const once = upsertPoolEntry("", "Harsh Annotation", 1)
    const twice = upsertPoolEntry(once, "Harsh Annotation", 1)
    const removed = upsertPoolEntry(twice, "Harsh Annotation", -1)

    expect(once).toBe("1 Harsh Annotation")
    expect(twice).toBe("2 Harsh Annotation")
    expect(removed).toBe("1 Harsh Annotation")
  })
})
