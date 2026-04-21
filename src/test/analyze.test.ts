// src/test/analyze.test.ts
import { describe, expect, it } from "vitest"
import { analyzeCard } from "@/lib/mtg/analyze"
import { EMPTY_COLOR_COUNTS } from "@/lib/mtg/constants"
import type { RatingIndexEntry } from "@/lib/mtg/types"
import type { ScryfallCard, ScryfallDataMap } from "@/lib/mtg/scryfall"

function makeEntry(overrides: {
  normalizedName: string
  displayName?: string
  rating?: number
  cmc?: number
  isCreature?: boolean
  isInstantLike?: boolean
  isLand?: boolean
  isCheapCreature?: boolean
  isInteraction?: boolean
  isColorlessPlayable?: boolean
  isConditionalCard?: boolean
  isFixing?: boolean
  maxSingleColorPip?: number
}): RatingIndexEntry {
  return {
    card: {
      name: overrides.displayName ?? overrides.normalizedName,
      displayName: overrides.displayName ?? overrides.normalizedName,
      aliases: [overrides.displayName ?? overrides.normalizedName],
      normalizedAliases: [overrides.normalizedName],
      type: overrides.isCreature ? "Creature" : overrides.isLand ? "Land" : "Instant",
      rarity: "C",
      rating: overrides.rating ?? 3.0,
      cmc: overrides.cmc ?? 2,
      rawColors: EMPTY_COLOR_COUNTS(),
      primaryCost: "1R",
      isCreature: overrides.isCreature ?? false,
      isLand: overrides.isLand ?? false,
      isInstantLike: overrides.isInstantLike ?? false,
      normalizedName: overrides.normalizedName,
      role: {
        colorCount: 1,
        maxSingleColorPip: overrides.maxSingleColorPip ?? 1,
        totalColoredPips: 1,
        isCheapCreature: overrides.isCheapCreature ?? false,
        isExpensiveFinisher: false,
        isInteraction: overrides.isInteraction ?? false,
        isConditionalCard: overrides.isConditionalCard ?? false,
        isColorlessPlayable: overrides.isColorlessPlayable ?? false,
        isFixing: overrides.isFixing ?? false,
      },
    },
    sources: ["test"],
  }
}

function makeScryfall(overrides: Partial<ScryfallCard> & { name: string }): ScryfallCard {
  return {
    keywords: [],
    type_line: "Instant",
    oracle_text: "",
    ...overrides,
  }
}

function makeIndex(entries: RatingIndexEntry[]): Map<string, RatingIndexEntry> {
  const map = new Map<string, RatingIndexEntry>()
  for (const e of entries) {
    map.set(e.card.normalizedName, e)
  }
  return map
}

function makeScryData(cards: ScryfallCard[]): ScryfallDataMap {
  const map = new Map<string, ScryfallCard>()
  for (const c of cards) {
    map.set(c.name.toLowerCase(), c)
  }
  return map
}

// -------------------------------------------------------------------------

describe("analyzeCard", () => {
  it("returns null for an unknown card", () => {
    const result = analyzeCard("Unknown Card", new Map(), new Map())
    expect(result).toBeNull()
  })

  it("returns the RatingCard when found", () => {
    const entry = makeEntry({ normalizedName: "lightning bolt", rating: 4.0 })
    const index = makeIndex([entry])
    const result = analyzeCard("lightning bolt", index, new Map())
    expect(result).not.toBeNull()
    expect(result!.card.rating).toBe(4.0)
  })

  it("sets scryfallCard to null when scryfall data is empty", () => {
    const entry = makeEntry({ normalizedName: "lightning bolt" })
    const result = analyzeCard("lightning bolt", makeIndex([entry]), new Map())
    expect(result!.scryfallCard).toBeNull()
    expect(result!.synergyTags).toHaveLength(0)
  })

  it("sets scryfallCard when scryfall data is provided", () => {
    const entry = makeEntry({ normalizedName: "lightning bolt" })
    const scry = makeScryfall({ name: "lightning bolt", type_line: "Instant", oracle_text: "Deal 3 damage." })
    const result = analyzeCard("lightning bolt", makeIndex([entry]), makeScryData([scry]))
    expect(result!.scryfallCard).toBe(scry)
  })

  describe("scoreBreakdown", () => {
    it("includes base rating with no adjustments for a vanilla creature", () => {
      const entry = makeEntry({ normalizedName: "vanilla", rating: 2.5, isCreature: true, cmc: 4 })
      const result = analyzeCard("vanilla", makeIndex([entry]), new Map())!
      expect(result.scoreBreakdown.baseRating).toBe(2.5)
      expect(result.scoreBreakdown.adjustments).toHaveLength(0)
      expect(result.scoreBreakdown.total).toBe(2.5)
    })

    it("adds +0.15 for cheap creature", () => {
      const entry = makeEntry({ normalizedName: "bear", rating: 3.0, isCreature: true, cmc: 2, isCheapCreature: true })
      const result = analyzeCard("bear", makeIndex([entry]), new Map())!
      const adj = result.scoreBreakdown.adjustments.find((a) => a.label.includes("Cheap creature"))
      expect(adj).toBeDefined()
      expect(adj!.delta).toBe(0.15)
      expect(result.scoreBreakdown.total).toBeCloseTo(3.15, 2)
    })

    it("adds +0.20 for interaction", () => {
      const entry = makeEntry({ normalizedName: "bolt", rating: 3.0, isInteraction: true })
      const result = analyzeCard("bolt", makeIndex([entry]), new Map())!
      const adj = result.scoreBreakdown.adjustments.find((a) => a.label.includes("Interaction"))
      expect(adj!.delta).toBe(0.2)
    })

    it("subtracts pip penalty for double pip", () => {
      const entry = makeEntry({ normalizedName: "double pip card", rating: 3.0, maxSingleColorPip: 2 })
      const result = analyzeCard("double pip card", makeIndex([entry]), new Map())!
      const adj = result.scoreBreakdown.adjustments.find((a) => a.delta < 0 && a.label.includes("pip"))
      expect(adj).toBeDefined()
      expect(adj!.delta).toBeCloseTo(-0.18, 2)
    })
  })

  describe("roleFlags", () => {
    it("marks isCheapCreature as active", () => {
      const entry = makeEntry({ normalizedName: "bear", isCheapCreature: true })
      const result = analyzeCard("bear", makeIndex([entry]), new Map())!
      const flag = result.roleFlags.find((f) => f.label === "Cheap creature")
      expect(flag!.active).toBe(true)
    })

    it("marks isFixing as inactive for non-fixing lands", () => {
      const entry = makeEntry({ normalizedName: "forest", isLand: true, isFixing: false })
      const result = analyzeCard("forest", makeIndex([entry]), new Map())!
      const flag = result.roleFlags.find((f) => f.label === "Fixing")
      expect(flag!.active).toBe(false)
    })
  })

  describe("synergyTags", () => {
    it("tags an instant as spellPayoff provider with reason", () => {
      const entry = makeEntry({ normalizedName: "shock", isInstantLike: true })
      const scry = makeScryfall({ name: "shock", type_line: "Instant", oracle_text: "Deal 2 damage." })
      const result = analyzeCard("shock", makeIndex([entry]), makeScryData([scry]))!
      const tag = result.synergyTags.find((t) => t.tag === "spellPayoff")
      expect(tag).toBeDefined()
      expect(tag!.role).toBe("provider")
      expect(tag!.reason).toContain("instant or sorcery")
    })

    it("tags prowess keyword as spellPayoff payoff with reason", () => {
      const entry = makeEntry({ normalizedName: "monk", isCreature: true })
      const scry = makeScryfall({ name: "monk", type_line: "Creature", keywords: ["Prowess"] })
      const result = analyzeCard("monk", makeIndex([entry]), makeScryData([scry]))!
      const tag = result.synergyTags.find((t) => t.tag === "spellPayoff")
      expect(tag!.role).toBe("payoff")
      expect(tag!.reason).toContain("prowess keyword")
    })

    it("tags flashback keyword as graveyard payoff with reason", () => {
      const entry = makeEntry({ normalizedName: "flash card", isInstantLike: true })
      const scry = makeScryfall({ name: "flash card", type_line: "Sorcery", keywords: ["Flashback"] })
      const result = analyzeCard("flash card", makeIndex([entry]), makeScryData([scry]))!
      const tag = result.synergyTags.find((t) => t.tag === "graveyard")
      expect(tag!.role).toBe("payoff") // flashback keyword triggers payoff; no milling/discarding text so not "both"
      expect(tag!.reason).toContain("flashback keyword")
    })

    it("tags lifelink keyword as lifegain provider", () => {
      const entry = makeEntry({ normalizedName: "lifelinker", isCreature: true })
      const scry = makeScryfall({ name: "lifelinker", type_line: "Creature", keywords: ["Lifelink"] })
      const result = analyzeCard("lifelinker", makeIndex([entry]), makeScryData([scry]))!
      const tag = result.synergyTags.find((t) => t.tag === "lifegain")
      expect(tag!.role).toBe("provider")
      expect(tag!.reason).toContain("lifelink keyword")
    })

    it("tags CMC 5+ non-land as expensiveSpells provider", () => {
      const entry = makeEntry({ normalizedName: "big spell", cmc: 6 })
      const scry = makeScryfall({ name: "big spell", type_line: "Sorcery", oracle_text: "Draw 3 cards.", cmc: 6 })
      const result = analyzeCard("big spell", makeIndex([entry]), makeScryData([scry]))!
      const tag = result.synergyTags.find((t) => t.tag === "expensiveSpells")
      expect(tag).toBeDefined()
      expect(tag!.role).toBe("provider")
      expect(tag!.reason).toContain("CMC 6")
    })

    it("returns empty synergyTags when no scryfall data", () => {
      const entry = makeEntry({ normalizedName: "some card" })
      const result = analyzeCard("some card", makeIndex([entry]), new Map())!
      expect(result.synergyTags).toHaveLength(0)
    })
  })
})
