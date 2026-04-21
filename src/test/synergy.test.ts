import { describe, expect, it } from "vitest"

import {
  buildAllTags,
  computeSynergyBonus,
  deriveCardSynergyTags,
  extractPoolSubtypes,
} from "@/lib/mtg/synergy"
import type { ScryfallCard, ScryfallDataMap } from "@/lib/mtg/scryfall"
import type { DeckCard, PoolCard } from "@/lib/mtg/types"
import { EMPTY_COLOR_COUNTS } from "@/lib/mtg/constants"

// Helper to build a minimal DeckCard for testing
function makeDeckCard(normalizedName: string, quantity = 1): DeckCard {
  return {
    card: {
      name: normalizedName,
      displayName: normalizedName,
      aliases: [normalizedName],
      normalizedAliases: [normalizedName],
      type: "Creature",
      rarity: "C",
      rating: 3.0,
      cmc: 3,
      rawColors: EMPTY_COLOR_COUNTS(),
      primaryCost: "2G",
      isCreature: true,
      isLand: false,
      isInstantLike: false,
      normalizedName,
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
    quantity,
    adjustedScore: 3.0,
    notes: [],
  }
}

function makeScryfallCard(overrides: Partial<ScryfallCard> & Pick<ScryfallCard, "name">): ScryfallCard {
  return {
    keywords: [],
    type_line: "Creature",
    oracle_text: "",
    ...overrides,
  }
}

function makePoolCard(normalizedName: string, quantity = 1): PoolCard {
  return {
    quantity,
    ratingCard: makeDeckCard(normalizedName).card,
  }
}

describe("deriveCardSynergyTags", () => {
  it("tags a prepare card as a prepare provider", () => {
    const card = makeScryfallCard({
      name: "Joined Researchers // Secret Rendezvous",
      type_line: "Creature — Human Cleric Wizard // Sorcery",
      layout: "prepare",
      cmc: 2,
      card_faces: [
        {
          name: "Joined Researchers",
          oracle_text: "At the beginning of each end step, if an opponent has more cards in hand than you, this creature becomes prepared.",
          keywords: [],
          type_line: "Creature — Human Cleric Wizard",
        },
        {
          name: "Secret Rendezvous",
          oracle_text: "You and target opponent each draw three cards.",
          keywords: [],
          type_line: "Sorcery",
        },
      ],
    })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.prepare).toBe("both")
  })

  it("tags a card that can make creatures become prepared as a prepare payoff", () => {
    const card = makeScryfallCard({
      name: "Skycoach Waypoint",
      type_line: "Land",
      oracle_text: "{3}, {T}: Target creature becomes prepared. (Only creatures with prepare spells can become prepared.)",
      keywords: ["Prepared"],
    })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.prepare).toBe("payoff")
  })

  it("tags a card that can make creatures become unprepared as a prepare payoff", () => {
    const card = makeScryfallCard({
      name: "Biblioplex Tomekeeper",
      type_line: "Artifact Creature — Construct",
      oracle_text: "When this creature enters, choose up to one —\n• Target creature becomes prepared.\n• Target creature becomes unprepared.",
      keywords: ["Prepared"],
    })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.prepare).toBe("payoff")
  })

  it("tags an instant as spellPayoff provider", () => {
    const card = makeScryfallCard({ name: "Quick Strike", type_line: "Instant", oracle_text: "Deal 3 damage." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.spellPayoff).toBe("provider")
  })

  it("tags a prowess card as spellPayoff payoff", () => {
    const card = makeScryfallCard({ name: "Monk", type_line: "Creature — Human Monk", oracle_text: "Prowess", keywords: ["Prowess"] })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.spellPayoff).toBe("payoff")
  })

  it("tags a card with magecraft as spellPayoff payoff", () => {
    const card = makeScryfallCard({ name: "Scholar", type_line: "Creature", oracle_text: "Magecraft — Whenever you cast or copy an instant or sorcery spell, Scholar gets +1/+1." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.spellPayoff).toBe("payoff")
  })

  it("tags a token generator as tokens provider", () => {
    const card = makeScryfallCard({ name: "Token Maker", type_line: "Sorcery", oracle_text: "Create three 1/1 white Soldier creature tokens." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.tokens).toBe("provider")
    expect(tags.spellPayoff).toBe("provider")
  })

  it("tags a token payoff card correctly", () => {
    const card = makeScryfallCard({ name: "Rally", type_line: "Enchantment", oracle_text: "Whenever another creature enters, each token you control gets +1/+1." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.tokens).toBe("payoff")
  })

  it("tags a card with both token creation and payoff as both", () => {
    const card = makeScryfallCard({
      name: "Commander",
      type_line: "Creature",
      oracle_text: "Create a 1/1 Soldier token. Whenever another creature enters, each token you control gets +1/+1.",
    })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.tokens).toBe("both")
  })

  it("tags a death trigger card as sacrifice payoff", () => {
    const card = makeScryfallCard({ name: "Carrion Feeder", type_line: "Creature", oracle_text: "Whenever a creature you control dies, put a +1/+1 counter on Carrion Feeder." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.sacrifice).toBe("payoff")
  })

  it("tags a lifelink card as lifegain provider", () => {
    const card = makeScryfallCard({ name: "Lifelinker", type_line: "Creature", oracle_text: "Lifelink", keywords: ["Lifelink"] })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.lifegain).toBe("provider")
  })

  it("tags a 'you gain N life' card as lifegain provider", () => {
    const card = makeScryfallCard({ name: "Revitalize", type_line: "Instant", oracle_text: "You gain 3 life. Draw a card." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.lifegain).toBe("provider")
  })

  it("tags a drain spell as lifegain provider", () => {
    const card = makeScryfallCard({ name: "Sovereign's Bite", type_line: "Instant", oracle_text: "Target player loses 3 life and you gain 3 life." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.lifegain).toBe("provider")
  })

  it("tags a 'whenever you gain life' card as lifegain payoff", () => {
    const card = makeScryfallCard({ name: "Soul Warden", type_line: "Creature", oracle_text: "Whenever you gain life, put a +1/+1 counter on Soul Warden." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.lifegain).toBe("payoff")
  })

  it("tags 'if you gained life this turn' as lifegain payoff", () => {
    const card = makeScryfallCard({ name: "Bloom Check", type_line: "Instant", oracle_text: "If you gained life this turn, draw two cards." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.lifegain).toBe("payoff")
  })

  it("tags infusion-style gained-life gates as lifegain payoff", () => {
    const card = makeScryfallCard({ name: "Infused Growth", type_line: "Creature", oracle_text: "Infusion — If you gained life this turn, put two +1/+1 counters on this creature.", keywords: ["Infusion"] })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.lifegain).toBe("payoff")
  })

  it("tags a graveyard mill card as graveyard provider", () => {
    const card = makeScryfallCard({ name: "Miller", type_line: "Sorcery", oracle_text: "Target player mills four cards." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.graveyard).toBe("provider")
  })

  it("tags keyword-only surveil as graveyard provider even without reminder text", () => {
    const card = makeScryfallCard({ name: "Watchful Note", type_line: "Instant", oracle_text: "Surveil 2.", keywords: ["Surveil"] })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.graveyard).toBe("provider")
  })

  it("tags reminder-less surveil text as graveyard provider", () => {
    const card = makeScryfallCard({ name: "Prismari Charm", type_line: "Instant", oracle_text: "Choose one —\n• Surveil 2, then draw a card.\n• Deal 2 damage to any target." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.graveyard).toBe("provider")
  })

  it("tags a flashback card as graveyard payoff", () => {
    const card = makeScryfallCard({ name: "Flasher", type_line: "Instant", oracle_text: "Deal 2 damage. Flashback {3}{R}", keywords: ["Flashback"] })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.graveyard).toBe("payoff")
  })

  it("tags a keyword lord correctly", () => {
    const card = makeScryfallCard({ name: "Sky Lord", type_line: "Creature", oracle_text: "Other creatures you control gain flying." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.keywordLord).toBe("payoff")
  })

  it("handles DFC by combining oracle text from both faces", () => {
    const card: ScryfallCard = {
      name: "Front // Back",
      type_line: "Creature",
      keywords: [],
      card_faces: [
        { name: "Front", oracle_text: "Create a 1/1 Soldier token.", keywords: [], type_line: "Creature" },
        { name: "Back", oracle_text: "Whenever another creature enters, each token you control gets +1/+1.", keywords: [], type_line: "Creature" },
      ],
    }
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.tokens).toBe("both")
  })

  it("tags a tribal provider when its subtype is in the pool set", () => {
    const card = makeScryfallCard({ name: "Zombie Drone", type_line: "Creature — Zombie" })
    const tags = deriveCardSynergyTags(card, new Set(["Zombie"]))
    expect(tags.tribal).toBe("provider")
  })

  it("tags a DFC as tribal provider when only the back face is a creature with a relevant subtype", () => {
    const card: ScryfallCard = {
      name: "Haunted Saga // Restless Zombie",
      type_line: "Enchantment — Saga // Creature — Zombie",
      keywords: [],
      card_faces: [
        { name: "Haunted Saga", type_line: "Enchantment — Saga", oracle_text: "I, II — Draw a card.", keywords: [] },
        { name: "Restless Zombie", type_line: "Creature — Zombie", oracle_text: "Menace.", keywords: ["Menace"] },
      ],
    }
    const tags = deriveCardSynergyTags(card, new Set(["Zombie"]))
    expect(tags.tribal).toBe("provider")
  })

  it("tags a DFC as spellPayoff provider when only the back face is an instant", () => {
    const card: ScryfallCard = {
      name: "Arcane Study // Quick Counter",
      type_line: "Creature // Instant",
      keywords: [],
      card_faces: [
        { name: "Arcane Study", type_line: "Creature — Wizard", oracle_text: "When this enters, scry 1.", keywords: [] },
        { name: "Quick Counter", type_line: "Instant", oracle_text: "Counter target spell.", keywords: [] },
      ],
    }
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.spellPayoff).toBe("provider")
  })

  it("does not treat a prepare card as a spellPayoff provider just because its back face is a sorcery", () => {
    const card: ScryfallCard = {
      name: "Landscape Painter // Vibrant Idea",
      type_line: "Creature — Merfolk Wizard // Sorcery",
      keywords: ["Prepared"],
      layout: "prepare",
      cmc: 2,
      card_faces: [
        {
          name: "Landscape Painter",
          type_line: "Creature — Merfolk Wizard",
          oracle_text: "This creature enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)",
          keywords: [],
        },
        {
          name: "Vibrant Idea",
          type_line: "Sorcery",
          oracle_text: "Draw two cards.",
          keywords: [],
        },
      ],
    }
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.spellPayoff).toBeUndefined()
    expect(tags.prepare).toBe("both")
  })

  it("does not tag tribal when its subtype is not in the pool set", () => {
    const card = makeScryfallCard({ name: "Random Elf", type_line: "Creature — Elf" })
    const tags = deriveCardSynergyTags(card, new Set(["Zombie"]))
    expect(tags.tribal).toBeUndefined()
  })

  it("returns empty tags for a vanilla creature", () => {
    const card = makeScryfallCard({ name: "Grizzly Bears", type_line: "Creature — Bear", oracle_text: "" })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(Object.keys(tags)).toHaveLength(0)
  })

  it("tags an aftermath card as graveyard payoff via layout field", () => {
    const card: ScryfallCard = {
      name: "Cut // Ribbons",
      type_line: "Instant // Sorcery",
      keywords: [],
      layout: "aftermath",
      card_faces: [
        { name: "Cut", type_line: "Instant", oracle_text: "Destroy target creature.", keywords: [] },
        { name: "Ribbons", type_line: "Sorcery", oracle_text: "Aftermath (Cast this only from your graveyard. Then exile it.)", keywords: ["Aftermath"] },
      ],
    }
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.graveyard).toBe("payoff")
  })

  it("tags a jump-start card as graveyard payoff via keyword", () => {
    const card = makeScryfallCard({ name: "Risk Factor", type_line: "Instant", oracle_text: "Target opponent loses 4 life unless they draw 3 cards. Jump-start.", keywords: ["Jump-start"] })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.graveyard).toBe("payoff")
  })

  it("tags 'sacrifice another creature as additional cost' as sacrifice provider", () => {
    const card = makeScryfallCard({ name: "Bone Splinters", type_line: "Sorcery", oracle_text: "As an additional cost to cast this spell, sacrifice another creature." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.sacrifice).toBe("provider")
  })

  it("does not tag tokens payoff for a generic creature ETB trigger", () => {
    const card = makeScryfallCard({ name: "Mentor of the Meek", type_line: "Creature", oracle_text: "Whenever another creature with power 2 or less enters, you may pay {1}. If you do, draw a card." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.tokens).toBeUndefined()
  })

  it("tags tokens payoff when trigger explicitly names a token entering", () => {
    const card = makeScryfallCard({ name: "Anointed Procession", type_line: "Enchantment", oracle_text: "Whenever a token enters under your control, create a copy of it." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.tokens).toBe("payoff")
  })

  // Lorehold: leaves-graveyard trigger
  it("tags a 'whenever a card leaves your graveyard' card as graveyard payoff", () => {
    const card = makeScryfallCard({ name: "Lorehold Spirit", type_line: "Creature", oracle_text: "Whenever a nontoken creature card leaves your graveyard, create a 1/1 white Spirit creature token." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.graveyard).toBe("payoff")
  })

  // Quandrix: X-spell counter provider
  it("tags a card that puts X +1/+1 counters as counters provider", () => {
    const card = makeScryfallCard({ name: "Vastwood Surge", type_line: "Sorcery", oracle_text: "Put X +1/+1 counters on each of up to two target creatures." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.counters).toBe("provider")
  })

  // Silverquill: repartee
  it("tags an instant that pumps a target creature you control as repartee provider", () => {
    const card = makeScryfallCard({ name: "Guiding Voice", type_line: "Instant", oracle_text: "Target creature gets +1/+1 until end of turn." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.repartee).toBe("provider")
  })

  it("tags a creature with a targeting-reward trigger as repartee payoff", () => {
    const card = makeScryfallCard({ name: "Silverquill Pledgemage", type_line: "Creature", oracle_text: "Whenever you cast a spell that targets this creature, it gets +1/+0 until end of turn." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.repartee).toBe("payoff")
  })

  it("tags an opus card as both spellPayoff and expensiveSpells payoff", () => {
    const card = makeScryfallCard({
      name: "Expressive Firedancer",
      type_line: "Creature — Human Sorcerer",
      oracle_text: "Opus — Whenever you cast an instant or sorcery spell, this creature gets +1/+1 until end of turn. If five or more mana was spent to cast that spell, this creature also gains double strike until end of turn.",
      keywords: ["Opus"],
    })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.spellPayoff).toBe("payoff")
    expect(tags.expensiveSpells).toBe("payoff")
  })

  // Prismari: expensive spells
  it("tags a non-land card with CMC 5 as expensiveSpells provider", () => {
    const card = makeScryfallCard({ name: "Apex Devastator", type_line: "Creature", oracle_text: "Cascade, cascade, cascade, cascade.", cmc: 10 })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.expensiveSpells).toBe("provider")
  })

  it("tags a card with an expensive-spell payoff trigger as expensiveSpells payoff", () => {
    const card = makeScryfallCard({ name: "Prismari Professor", type_line: "Creature", oracle_text: "Whenever you cast a spell with mana value 5 or greater, create a 4/4 Elemental token." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.expensiveSpells).toBe("payoff")
  })

  it("tags an increment card as both counters and expensiveSpells payoff", () => {
    const card = makeScryfallCard({
      name: "Cuboid Colony",
      type_line: "Creature — Fractal",
      oracle_text: "Increment (Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or toughness, put a +1/+1 counter on the creature.)",
      keywords: ["Increment"],
    })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.counters).toBe("both")
    expect(tags.expensiveSpells).toBe("payoff")
  })

  it("treats a high flashback cost as an expensiveSpells provider", () => {
    const card = makeScryfallCard({
      name: "Molten Note",
      type_line: "Sorcery",
      oracle_text: "Molten Note deals damage to target creature equal to the amount of mana spent to cast this spell.\nFlashback {6}{R}{W}",
      keywords: ["Flashback"],
      cmc: 2,
    })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.expensiveSpells).toBe("provider")
  })

  it("does not tag a land with CMC 0 as expensiveSpells provider", () => {
    const card = makeScryfallCard({ name: "Swamp", type_line: "Basic Land — Swamp", oracle_text: "", cmc: 0 })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.expensiveSpells).toBeUndefined()
  })

  // 5-color: converge
  it("tags a converge spell as converge payoff", () => {
    const card = makeScryfallCard({ name: "Radiant Flames", type_line: "Sorcery", oracle_text: "Converge — Radiant Flames deals X damage to each creature, where X is the number of colors of mana spent to cast it." })
    const tags = deriveCardSynergyTags(card, new Set())
    expect(tags.converge).toBe("payoff")
  })

  it("tags a fixing card as converge provider when isFixing=true", () => {
    const card = makeScryfallCard({ name: "Cultivate", type_line: "Sorcery", oracle_text: "Search your library for up to two basic land cards, reveal those cards, and put one onto the battlefield tapped and the other into your hand." })
    const tags = deriveCardSynergyTags(card, new Set(), true)
    expect(tags.converge).toBe("provider")
  })
})

describe("extractPoolSubtypes", () => {
  it("returns subtypes that appear at least threshold times", () => {
    const data: ScryfallDataMap = new Map([
      ["zombie a", makeScryfallCard({ name: "Zombie A", type_line: "Creature — Zombie" })],
      ["zombie b", makeScryfallCard({ name: "Zombie B", type_line: "Creature — Zombie" })],
      ["goblin a", makeScryfallCard({ name: "Goblin A", type_line: "Creature — Goblin" })],
    ])
    const subtypes = extractPoolSubtypes([makePoolCard("zombie a"), makePoolCard("zombie b"), makePoolCard("goblin a")], data, 2)
    expect(subtypes.has("Zombie")).toBe(true)
    expect(subtypes.has("Goblin")).toBe(false)
  })

  it("ignores non-creature cards", () => {
    const data: ScryfallDataMap = new Map([
      ["sorcery a", makeScryfallCard({ name: "Sorcery A", type_line: "Sorcery" })],
      ["sorcery b", makeScryfallCard({ name: "Sorcery B", type_line: "Sorcery" })],
    ])
    const subtypes = extractPoolSubtypes([makePoolCard("sorcery a"), makePoolCard("sorcery b")], data, 2)
    expect(subtypes.size).toBe(0)
  })

  it("counts back-face creature subtypes on DFCs toward the threshold", () => {
    const makeDfc = (name: string, backSubtype: string): ScryfallCard => ({
      name,
      type_line: `Enchantment — Saga // Creature — ${backSubtype}`,
      keywords: [],
      card_faces: [
        { name: `${name} Front`, type_line: "Enchantment — Saga", oracle_text: "", keywords: [] },
        { name: `${name} Back`, type_line: `Creature — ${backSubtype}`, oracle_text: "", keywords: [] },
      ],
    })
    const data: ScryfallDataMap = new Map([
      ["saga a", makeDfc("Saga A", "Zombie")],
      ["saga b", makeDfc("Saga B", "Zombie")],
    ])
    const subtypes = extractPoolSubtypes([makePoolCard("saga a"), makePoolCard("saga b")], data, 2)
    expect(subtypes.has("Zombie")).toBe(true)
  })

  it("applies higher threshold for generic subtypes like Human", () => {
    const data: ScryfallDataMap = new Map([
      ["human a", makeScryfallCard({ name: "Human A", type_line: "Creature — Human" })],
      ["human b", makeScryfallCard({ name: "Human B", type_line: "Creature — Human" })],
      ["human c", makeScryfallCard({ name: "Human C", type_line: "Creature — Human" })],
    ])
    // 3 Humans: below the generic threshold of 4
    const subtypes = extractPoolSubtypes([makePoolCard("human a"), makePoolCard("human b"), makePoolCard("human c")], data, 2)
    expect(subtypes.has("Human")).toBe(false)
  })

  it("only counts cards that are actually in the current pool", () => {
    const data: ScryfallDataMap = new Map([
      ["zombie a", makeScryfallCard({ name: "Zombie A", type_line: "Creature — Zombie" })],
      ["zombie b", makeScryfallCard({ name: "Zombie B", type_line: "Creature — Zombie" })],
      ["elf scout", makeScryfallCard({ name: "Elf Scout", type_line: "Creature — Elf" })],
    ])
    const subtypes = extractPoolSubtypes([makePoolCard("elf scout")], data, 2)
    expect(subtypes.has("Zombie")).toBe(false)
    expect(subtypes.has("Elf")).toBe(false)
  })
})

describe("computeSynergyBonus", () => {
  it("returns 0 when allTags is empty", () => {
    const deck = [makeDeckCard("card a"), makeDeckCard("card b")]
    const { bonus } = computeSynergyBonus(deck, new Map())
    expect(bonus).toBe(0)
  })

  it("returns 0 when there are not enough providers or payoffs", () => {
    const allTags = new Map([
      ["token maker", { tokens: "provider" as const }],
    ])
    const deck = [makeDeckCard("token maker", 1)]
    const { bonus } = computeSynergyBonus(deck, allTags)
    expect(bonus).toBe(0)
  })

  it("fires token synergy with 2 providers and 1 payoff", () => {
    const allTags = new Map([
      ["token maker", { tokens: "provider" as const }],
      ["token payoff", { tokens: "payoff" as const }],
    ])
    const deck = [makeDeckCard("token maker", 2), makeDeckCard("token payoff", 1)]
    const { bonus, breakdown } = computeSynergyBonus(deck, allTags)
    expect(bonus).toBeGreaterThan(0)
    expect(breakdown.tokens).toBeDefined()
  })

  it("fires synergy for 'both' role cards without separate providers/payoffs", () => {
    const allTags = new Map([
      ["synergy card", { tokens: "both" as const }],
    ])
    const deck = [makeDeckCard("synergy card", 3)]
    const { bonus } = computeSynergyBonus(deck, allTags)
    expect(bonus).toBeGreaterThan(0)
  })

  it("does not fire synergy for three payoffs with no providers", () => {
    const allTags = new Map([
      ["token payoff", { tokens: "payoff" as const }],
    ])
    const deck = [makeDeckCard("token payoff", 3)]
    const { bonus, breakdown } = computeSynergyBonus(deck, allTags)
    expect(bonus).toBe(0)
    expect(breakdown.tokens).toBeUndefined()
  })

  it("caps total bonus at 8.0", () => {
    // Create a deck with very high synergy across many tags
    const allTags = new Map<string, ReturnType<typeof deriveCardSynergyTags>>()
    const deckCards: DeckCard[] = []
    const tags = ["tribal", "prepare", "graveyard", "tokens", "sacrifice", "counters", "spellPayoff", "keywordLord", "lifegain"] as const
    for (const tag of tags) {
      allTags.set(`provider-${tag}`, { [tag]: "provider" as const })
      allTags.set(`payoff-${tag}`, { [tag]: "payoff" as const })
      deckCards.push(makeDeckCard(`provider-${tag}`, 5))
      deckCards.push(makeDeckCard(`payoff-${tag}`, 5))
    }
    const { bonus } = computeSynergyBonus(deckCards, allTags)
    expect(bonus).toBeLessThanOrEqual(8.0)
  })

  it("returns a breakdown only for tags that fired", () => {
    const allTags = new Map([
      ["zombie 1", { tribal: "provider" as const }],
      ["zombie 2", { tribal: "provider" as const }],
      ["lord", { tribal: "payoff" as const }],
    ])
    const deck = [makeDeckCard("zombie 1", 2), makeDeckCard("zombie 2", 2), makeDeckCard("lord", 1)]
    const { breakdown } = computeSynergyBonus(deck, allTags)
    expect(breakdown.tribal).toBeDefined()
    expect(breakdown.tokens).toBeUndefined()
  })

  it("fires prepare synergy when the deck has both prepare cards and prepare payoffs", () => {
    const allTags = new Map([
      ["joined researchers", { prepare: "both" as const }],
      ["skycoach waypoint", { prepare: "payoff" as const }],
    ])
    const deck = [makeDeckCard("joined researchers", 2), makeDeckCard("skycoach waypoint", 1)]
    const { bonus, breakdown } = computeSynergyBonus(deck, allTags)
    expect(bonus).toBeGreaterThan(0)
    expect(breakdown.prepare).toBeDefined()
  })
})

describe("buildAllTags", () => {
  it("builds a tag map for pool cards with Scryfall data", () => {
    const scryfallData: ScryfallDataMap = new Map([
      ["token maker", makeScryfallCard({ name: "Token Maker", type_line: "Creature", oracle_text: "Create a 1/1 Soldier token." })],
    ])
    const poolCards = [
      {
        quantity: 1,
        ratingCard: {
          ...makeDeckCard("token maker").card,
        },
      },
    ]
    const allTags = buildAllTags(poolCards, scryfallData)
    expect(allTags.has("token maker")).toBe(true)
    expect(allTags.get("token maker")?.tokens).toBe("provider")
  })

  it("skips cards with no Scryfall data", () => {
    const scryfallData: ScryfallDataMap = new Map()
    const poolCards = [{ quantity: 1, ratingCard: makeDeckCard("unknown card").card }]
    const allTags = buildAllTags(poolCards, scryfallData)
    expect(allTags.size).toBe(0)
  })

  it("derives tribal tags from the actual pool instead of all loaded cards", () => {
    const scryfallData: ScryfallDataMap = new Map([
      ["zombie lord", makeScryfallCard({ name: "Zombie Lord", type_line: "Creature — Zombie", oracle_text: "Other Zombies you control get +1/+1." })],
      ["off-pool zombie a", makeScryfallCard({ name: "Off-Pool Zombie A", type_line: "Creature — Zombie" })],
      ["off-pool zombie b", makeScryfallCard({ name: "Off-Pool Zombie B", type_line: "Creature — Zombie" })],
    ])
    const allTags = buildAllTags([makePoolCard("zombie lord")], scryfallData)
    expect(allTags.get("zombie lord")?.tribal).toBeUndefined()
  })
})
