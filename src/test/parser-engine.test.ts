import { describe, expect, it } from "vitest"

import {
  evaluateSealedPool,
  mergeRatingFiles,
  parsePoolText,
  parseRatingFileContent,
} from "@/lib/mtg"

const MAIN_FILE = `var MAIN = [
  {name:"Alpha Knight", castingcost1:"1W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.2", cmc:"2", colors:[1,0,0,0,0]},
  {name:"Shield Lesson", castingcost1:"2W", castingcost2:"none", type:"Spell", rarity:"C", myrating:"2.8", cmc:"3", colors:[1,0,0,0,0]},
  {name:"Azure Adept", castingcost1:"1U", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.1", cmc:"2", colors:[0,1,0,0,0]},
  {name:"Canceling Wave", castingcost1:"2U", castingcost2:"none", type:"Instant", rarity:"C", myrating:"2.9", cmc:"3", colors:[0,1,0,0,0]},
  {name:"Bog Hexer", castingcost1:"2B", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.0", cmc:"3", colors:[0,0,1,0,0]},
  {name:"Last Breath", castingcost1:"1B", castingcost2:"none", type:"Instant", rarity:"U", myrating:"3.4", cmc:"2", colors:[0,0,1,0,0]},
  {name:"Flame Tutor", castingcost1:"1R", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.1", cmc:"2", colors:[0,0,0,1,0]},
  {name:"Spark Volley", castingcost1:"1R", castingcost2:"none", type:"Instant", rarity:"C", myrating:"3.2", cmc:"2", colors:[0,0,0,1,0]},
  {name:"Rootwise Bear", castingcost1:"2G", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.3", cmc:"3", colors:[0,0,0,0,1]},
  {name:"Vine Lash", castingcost1:"1G", castingcost2:"none", type:"Instant", rarity:"C", myrating:"3.1", cmc:"2", colors:[0,0,0,0,1]},
  {name:"Neutral Golem", castingcost1:"4", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.7", cmc:"4", colors:[0,0,0,0,0]},
  {name:"Sky Archive", castingcost1:"0", castingcost2:"0", type:"Land", rarity:"U", myrating:"2.0", cmc:"0", colors:[0,0,0,0,0]},
  {name:"Alpha Knight", castingcost1:"1W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.2", cmc:"2", colors:[1,0,0,0,0]}
]`

const BONUS_FILE = `/* bonus sheet */ var BONUS = [
  {name:"Bonus Dragon", castingcost1:"4R", castingcost2:"none", type:"Creature", rarity:"R", myrating:"3.7", cmc:"5", colors:[0,0,0,1,0]},
  {name:"Bonus Charm", castingcost1:"W", castingcost2:"none", type:"Instant", rarity:"U", myrating:"3.0", cmc:"1", colors:[1,0,0,0,0]},
  {name:"Kirol, History Buff // Pack a Punch", castingcost1:"2R", castingcost2:"1R", type:"Creature", rarity:"U", myrating:"3.3", cmc:"3", colors:[0,0,0,1,0]}
]`

describe("rating parser", () => {
  it("extracts cards from a JS array safely", () => {
    const parsed = parseRatingFileContent(MAIN_FILE, "main.js")
    expect(parsed.cards).toHaveLength(13)
    expect(parsed.cards[0]?.displayName).toBe("Alpha Knight")
    expect(parsed.cards[0]?.role.colorCount).toBe(1)
    expect(parsed.cards[0]?.role.isCheapCreature).toBe(true)
  })

  it("merges multiple non-overlapping files into one index", () => {
    const merged = mergeRatingFiles([
      parseRatingFileContent(MAIN_FILE, "main.js"),
      parseRatingFileContent(BONUS_FILE, "bonus.js"),
    ])

    expect(merged.index.get("bonus dragon")?.card.displayName).toBe("Bonus Dragon")
    expect(merged.index.get("alpha knight")?.sources).toContain("main.js")
  })

  it("parses quantities from pasted pool text", () => {
    const pool = parsePoolText("2 Alpha Knight\nBonus Dragon")
    expect(pool).toEqual([
      {
        quantity: 2,
        inputName: "Alpha Knight",
        normalizedName: "alpha knight",
        normalizedAliases: ["alpha knight"],
      },
      {
        quantity: 1,
        inputName: "Bonus Dragon",
        normalizedName: "bonus dragon",
        normalizedAliases: ["bonus dragon"],
      },
    ])
  })

  it("indexes both faces of double-faced or split-name cards", () => {
    const merged = mergeRatingFiles([
      parseRatingFileContent(BONUS_FILE, "bonus.js"),
    ])

    expect(
      merged.index.get("kirol history buff")?.card.displayName,
    ).toBe("Kirol, History Buff // Pack a Punch")
    expect(
      merged.index.get("pack a punch")?.card.displayName,
    ).toBe("Kirol, History Buff // Pack a Punch")
  })

  it("parses full card names into aliases that include the front face", () => {
    const pool = parsePoolText("Kirol, History Buff // Pack a Punch")

    expect(pool[0]?.normalizedAliases).toEqual([
      "kirol history buff pack a punch",
      "kirol history buff",
      "pack a punch",
    ])
  })
})

describe("sealed engine", () => {
  it("returns up to five ranked decks with lands and explanations", () => {
    const ratings = mergeRatingFiles([
      parseRatingFileContent(MAIN_FILE, "main.js"),
      parseRatingFileContent(BONUS_FILE, "bonus.js"),
    ])

    const pool = parsePoolText(`
      3 Alpha Knight
      2 Shield Lesson
      2 Bonus Charm
      2 Azure Adept
      2 Canceling Wave
      3 Flame Tutor
      3 Spark Volley
      2 Bonus Dragon
      2 Neutral Golem
      3 Rootwise Bear
      3 Vine Lash
      1 Pack a Punch
      1 Missing Card
    `)

    const result = evaluateSealedPool(pool, ratings)
    const getPoolCountForCard = (normalizedAliases: string[]) =>
      pool
        .filter((entry) => entry.inputName !== "Missing Card")
        .filter((entry) =>
          normalizedAliases.some((alias) => entry.normalizedAliases.includes(alias)),
        )
        .reduce((sum, entry) => sum + entry.quantity, 0)

    expect(result.decks.length).toBeGreaterThan(0)
    expect(result.decks[0]?.mainDeck.reduce((sum, card) => sum + card.quantity, 0)).toBe(23)
    expect(result.decks[0]?.metrics.creatureCount).toBeLessThanOrEqual(23)
    expect(result.decks[0]?.metrics.interactionCount).toBeLessThanOrEqual(23)
    expect(result.decks[0]?.metrics.cheapPlays).toBeLessThanOrEqual(23)
    expect(result.decks[0]?.fullDeck.reduce((sum, card) => sum + card.quantity, 0)).toBe(40)
    expect(result.decks[0]?.totalCardCount).toBe(40)
    expect(result.decks[0]?.landCount).toBe(17)
    expect(result.decks[0]?.explanation.length).toBeGreaterThan(20)
    expect(result.decks[0]?.scoreBreakdown.total).toBe(result.decks[0]?.totalScore)
    expect(result.decks[0]?.metrics.manaSourceSufficiency).toBeGreaterThan(0)
    expect(
      result.decks[0]?.mainDeck.every(
        (entry) => entry.quantity <= getPoolCountForCard(entry.card.normalizedAliases),
      ),
    ).toBe(true)
    expect(result.missingCards).toHaveLength(1)
  })

  it("rejects obviously bad splashes in shallow pools", () => {
    const ratings = mergeRatingFiles([
      parseRatingFileContent(`var SHALLOW = [
        {name:"Steady Recruit", castingcost1:"1W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.1", cmc:"2", colors:[1,0,0,0,0]},
        {name:"Shield Drill", castingcost1:"2W", castingcost2:"none", type:"Spell", rarity:"C", myrating:"2.9", cmc:"3", colors:[1,0,0,0,0]},
        {name:"Thought Snare", castingcost1:"1U", castingcost2:"none", type:"Instant", rarity:"C", myrating:"3.0", cmc:"2", colors:[0,1,0,0,0]},
        {name:"River Adept", castingcost1:"2U", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.0", cmc:"3", colors:[0,1,0,0,0]},
        {name:"Volcano Tyrant", castingcost1:"4RR", castingcost2:"none", type:"Creature", rarity:"R", myrating:"4.0", cmc:"6", colors:[0,0,0,2,0]},
        {name:"Slate Golem", castingcost1:"4", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.6", cmc:"4", colors:[0,0,0,0,0]}
      ]`, "shallow.js"),
    ])

    const pool = parsePoolText(`
      4 Steady Recruit
      3 Shield Drill
      4 Thought Snare
      4 River Adept
      3 Slate Golem
      1 Volcano Tyrant
    `)

    const result = evaluateSealedPool(pool, ratings)
    expect(result.decks[0]?.colors.splash).toBeUndefined()
  })

  it("accepts a light splash when fixing and card quality support it", () => {
    const ratings = mergeRatingFiles([
      parseRatingFileContent(`var FIXED = [
        {name:"Stonefield Guide", castingcost1:"1W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.0", cmc:"2", colors:[1,0,0,0,0]},
        {name:"Skyline Adept", castingcost1:"1U", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.1", cmc:"2", colors:[0,1,0,0,0]},
        {name:"Lessons of Wind", castingcost1:"2U", castingcost2:"none", type:"Instant", rarity:"U", myrating:"3.2", cmc:"3", colors:[0,1,0,0,0]},
        {name:"Radiant Verdict", castingcost1:"2W", castingcost2:"none", type:"Spell", rarity:"U", myrating:"3.2", cmc:"3", colors:[1,0,0,0,0]},
        {name:"Late Ember", castingcost1:"3R", castingcost2:"none", type:"Instant", rarity:"C", myrating:"3.0", cmc:"4", colors:[0,0,0,1,0]},
        {name:"Fires of the Peak", castingcost1:"4R", castingcost2:"none", type:"Creature", rarity:"R", myrating:"3.8", cmc:"5", colors:[0,0,0,1,0]},
        {name:"Crossroad Vista", castingcost1:"0", castingcost2:"WUR", type:"Land", rarity:"U", myrating:"2.5", cmc:"0", colors:[0,0,0,0,0]},
        {name:"Traveler's Bauble", castingcost1:"2", castingcost2:"none", type:"Spell", rarity:"C", myrating:"2.7", cmc:"2", colors:[0,0,0,0,0]}
      ]`, "fixed.js"),
    ])

    const pool = parsePoolText(`
      4 Stonefield Guide
      4 Skyline Adept
      3 Lessons of Wind
      3 Radiant Verdict
      1 Late Ember
      1 Fires of the Peak
      2 Crossroad Vista
      3 Traveler's Bauble
      4 Neutral Card
    `)

    const fallbackRatings = mergeRatingFiles([
      parseRatingFileContent(`var EXTRA = [
        {name:"Neutral Card", castingcost1:"3", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.6", cmc:"3", colors:[0,0,0,0,0]}
      ]`, "extra.js"),
    ])

    const merged = {
      index: new Map([...ratings.index, ...fallbackRatings.index]),
      conflicts: [],
    }

    const result = evaluateSealedPool(pool, merged)
    expect(result.decks.some((deck) => deck.colors.splash === "R")).toBe(true)
    expect(result.decks.every((deck) => deck.landCount === 17)).toBe(true)
  })

  it("keeps duplicate clunky cards from dominating the build", () => {
    const ratings = mergeRatingFiles([
      parseRatingFileContent(`var DUPS = [
        {name:"Huge Maybe", castingcost1:"6", castingcost2:"none", type:"Spell", rarity:"C", myrating:"3.0", cmc:"6", colors:[0,0,0,0,0]},
        {name:"Reliable Bear", castingcost1:"2G", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.9", cmc:"3", colors:[0,0,0,0,1]},
        {name:"Vastland Scout", castingcost1:"1G", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.8", cmc:"2", colors:[0,0,0,0,1]},
        {name:"Tidy Bite", castingcost1:"1G", castingcost2:"none", type:"Instant", rarity:"C", myrating:"2.8", cmc:"2", colors:[0,0,0,0,1]},
        {name:"Stone Helper", castingcost1:"2", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.6", cmc:"2", colors:[0,0,0,0,0]},
        {name:"Ground Path", castingcost1:"3G", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.7", cmc:"4", colors:[0,0,0,0,1]}
      ]`, "dups.js"),
    ])

    const pool = parsePoolText(`
      6 Huge Maybe
      4 Reliable Bear
      4 Vastland Scout
      4 Tidy Bite
      5 Stone Helper
      4 Ground Path
    `)

    const result = evaluateSealedPool(pool, ratings)
    const hugeMaybe = result.decks[0]?.mainDeck.find((entry) => entry.card.displayName === "Huge Maybe")
    expect((hugeMaybe?.quantity ?? 0)).toBeLessThan(4)
  })
})

describe("synergy engine integration", () => {
  const RATINGS_FILE = `var SYNERGY = [
    {name:"Token Smith", castingcost1:"2W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.0", cmc:"3", colors:[1,0,0,0,0]},
    {name:"Banner Carrier", castingcost1:"1W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"3.1", cmc:"2", colors:[1,0,0,0,0]},
    {name:"Rally Cry", castingcost1:"2W", castingcost2:"none", type:"Sorcery", rarity:"U", myrating:"3.2", cmc:"3", colors:[1,0,0,0,0]},
    {name:"Blade Guardian", castingcost1:"1W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.9", cmc:"2", colors:[1,0,0,0,0]},
    {name:"Sword Initiate", castingcost1:"W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.8", cmc:"1", colors:[1,0,0,0,0]},
    {name:"Order Captain", castingcost1:"3W", castingcost2:"none", type:"Creature", rarity:"U", myrating:"3.3", cmc:"4", colors:[1,0,0,0,0]},
    {name:"Shield Lesson", castingcost1:"2W", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.9", cmc:"3", colors:[1,0,0,0,0]},
    {name:"Neutral Filler", castingcost1:"3", castingcost2:"none", type:"Creature", rarity:"C", myrating:"2.6", cmc:"3", colors:[0,0,0,0,0]}
  ]`

  const LARGE_WHITE_POOL = `
    4 Token Smith
    4 Banner Carrier
    4 Rally Cry
    4 Blade Guardian
    4 Sword Initiate
    4 Order Captain
    3 Shield Lesson
    5 Neutral Filler
  `

  it("produces synergyBonus of 0 on all decks when no Scryfall data is provided", () => {
    const ratings = mergeRatingFiles([parseRatingFileContent(RATINGS_FILE, "synergy.js")])
    const pool = parsePoolText(LARGE_WHITE_POOL)
    const result = evaluateSealedPool(pool, ratings)

    expect(result.decks.length).toBeGreaterThan(0)
    for (const deck of result.decks) {
      expect(deck.scoreBreakdown.synergyBonus).toBe(0)
      expect(Object.keys(deck.synergyBreakdown)).toHaveLength(0)
    }
  })

  it("produces synergyBonus > 0 when Scryfall data reveals token synergy", () => {
    const ratings = mergeRatingFiles([parseRatingFileContent(RATINGS_FILE, "synergy.js")])
    const pool = parsePoolText(LARGE_WHITE_POOL)

    // Build a mock ScryfallDataMap with token synergy on several cards
    const scryfallData = new Map([
      [
        "token smith",
        {
          name: "Token Smith",
          type_line: "Creature",
          keywords: [],
          oracle_text: "When Token Smith enters, create a 1/1 white Soldier creature token.",
        },
      ],
      [
        "banner carrier",
        {
          name: "Banner Carrier",
          type_line: "Creature",
          keywords: [],
          oracle_text: "When Banner Carrier enters, create a 1/1 white Soldier creature token.",
        },
      ],
      [
        "order captain",
        {
          name: "Order Captain",
          type_line: "Creature",
          keywords: [],
          oracle_text: "Whenever another creature enters, each token you control gets +1/+1 until end of turn.",
        },
      ],
    ])

    const result = evaluateSealedPool(pool, ratings, {}, scryfallData)

    expect(result.decks.length).toBeGreaterThan(0)
    const topDeck = result.decks[0]
    expect(topDeck?.scoreBreakdown.synergyBonus).toBeGreaterThan(0)
    expect(topDeck?.synergyBreakdown.tokens).toBeDefined()
  })

  it("synergyBreakdown is always present even when empty", () => {
    const ratings = mergeRatingFiles([parseRatingFileContent(RATINGS_FILE, "synergy.js")])
    const pool = parsePoolText(LARGE_WHITE_POOL)
    const result = evaluateSealedPool(pool, ratings)

    for (const deck of result.decks) {
      expect(deck.synergyBreakdown).toBeDefined()
      expect(typeof deck.synergyBreakdown).toBe("object")
    }
  })
})
