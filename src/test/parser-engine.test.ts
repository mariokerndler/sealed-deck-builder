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

    expect(result.decks.length).toBeGreaterThan(0)
    expect(result.decks[0]?.mainDeck.reduce((sum, card) => sum + card.quantity, 0)).toBe(23)
    expect(result.decks[0]?.landCount).toBeGreaterThanOrEqual(16)
    expect(result.decks[0]?.explanation.length).toBeGreaterThan(20)
    expect(result.missingCards).toHaveLength(1)
  })
})
