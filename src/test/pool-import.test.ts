import { describe, expect, it } from "vitest"

import {
  buildPoolImportCandidateIndex,
  formatResolvedPool,
  resolveOcrTitles,
  type OcrTitleResult,
} from "@/lib/mtg"

const RATINGS = {
  index: new Map([
    [
      "lightning bolt",
      {
        card: {
          name: "Lightning Bolt",
          displayName: "Lightning Bolt",
          aliases: ["Lightning Bolt"],
          normalizedAliases: ["lightning bolt"],
          type: "Instant",
          rarity: "C",
          rating: 3.5,
          cmc: 1,
          rawColors: { W: 0, U: 0, B: 0, R: 1, G: 0 },
          alternateRawColors: undefined,
          alternateCost: undefined,
          primaryCost: "R",
          image: undefined,
          isCreature: false,
          isLand: false,
          isInstantLike: true,
          normalizedName: "lightning bolt",
          role: {
            colorCount: 1,
            maxSingleColorPip: 1,
            totalColoredPips: 1,
            hasHybridMana: false,
            isHybridOnlyFlexible: false,
            isCheapCreature: false,
            isExpensiveFinisher: false,
            isInteraction: true,
            isConditionalCard: false,
            isColorlessPlayable: false,
            isFixing: false,
          },
        },
        sources: ["test.js"],
      },
    ],
    [
      "kirol history buff",
      {
        card: {
          name: "Kirol, History Buff // Pack a Punch",
          displayName: "Kirol, History Buff // Pack a Punch",
          aliases: ["Kirol, History Buff // Pack a Punch", "Kirol, History Buff", "Pack a Punch"],
          normalizedAliases: ["kirol history buff pack a punch", "kirol history buff", "pack a punch"],
          type: "Creature",
          rarity: "U",
          rating: 3.2,
          cmc: 3,
          rawColors: { W: 0, U: 0, B: 0, R: 1, G: 0 },
          alternateRawColors: undefined,
          alternateCost: "1R",
          primaryCost: "2R",
          image: undefined,
          isCreature: true,
          isLand: false,
          isInstantLike: false,
          normalizedName: "kirol history buff pack a punch",
          role: {
            colorCount: 1,
            maxSingleColorPip: 1,
            totalColoredPips: 1,
            hasHybridMana: false,
            isHybridOnlyFlexible: false,
            isCheapCreature: true,
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

describe("pool photo resolver", () => {
  it("matches exact normalized OCR text", () => {
    const candidateIndex = buildPoolImportCandidateIndex(RATINGS)
    const titles: OcrTitleResult[] = [
      { regionId: "r1", text: "Lightning Bolt", confidence: 0.93 },
    ]

    const result = resolveOcrTitles(titles, candidateIndex)

    expect(result.acceptedCount).toBe(1)
    expect(result.entries[0]?.resolvedName).toBe("Lightning Bolt")
    expect(result.entries[0]?.reviewStatus).toBe("accepted")
  })

  it("fuzzy-matches OCR text with minor mistakes and flags review when confidence is lower", () => {
    const candidateIndex = buildPoolImportCandidateIndex(RATINGS)
    const titles: OcrTitleResult[] = [
      { regionId: "r1", text: "Lightninq Boit", confidence: 0.74 },
    ]

    const result = resolveOcrTitles(titles, candidateIndex)

    expect(result.entries[0]?.resolvedName).toBe("Lightning Bolt")
    expect(result.entries[0]?.reviewStatus).toBe("review")
  })

  it("matches front faces of split or double-faced names", () => {
    const candidateIndex = buildPoolImportCandidateIndex(RATINGS)
    const titles: OcrTitleResult[] = [
      { regionId: "r1", text: "Pack a Punch", confidence: 0.9 },
    ]

    const result = resolveOcrTitles(titles, candidateIndex)

    expect(result.entries[0]?.resolvedName).toBe("Kirol, History Buff // Pack a Punch")
    expect(result.entries[0]?.reviewStatus).toBe("accepted")
  })

  it("formats accepted entries into canonical aggregated pool text", () => {
    const candidateIndex = buildPoolImportCandidateIndex(RATINGS)
    const result = resolveOcrTitles(
      [
        { regionId: "r1", text: "Lightning Bolt", confidence: 0.95 },
        { regionId: "r2", text: "Lightning Bolt", confidence: 0.95 },
        { regionId: "r3", text: "Unreadable", confidence: 0.2 },
      ],
      candidateIndex,
    )

    const formatted = formatResolvedPool({
      ...result,
      entries: result.entries.map((entry, index) =>
        index === 2 ? { ...entry, reviewStatus: "rejected" as const, resolvedName: null, normalizedResolvedName: null } : entry,
      ),
    })

    expect(formatted).toBe("2 Lightning Bolt")
  })

  it("creates provisional review rows when there is no candidate dictionary", () => {
    const emptyIndex = buildPoolImportCandidateIndex({ index: new Map(), conflicts: [] })
    const result = resolveOcrTitles(
      [{ regionId: "r1", text: "Mysterious Card", confidence: 0.81 }],
      emptyIndex,
    )

    expect(result.warning).toMatch(/provisional/i)
    expect(result.entries[0]?.reviewStatus).toBe("review")
    expect(result.entries[0]?.provisional).toBe(true)
  })
})
