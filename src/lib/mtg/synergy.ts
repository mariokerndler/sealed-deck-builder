import type { CardSynergyTags, DeckCard, PoolCard, SynergyBreakdown, SynergyCardContributor, SynergyDetail, SynergyRole, SynergyTag } from "@/lib/mtg/types"
import type { ScryfallCard, ScryfallDataMap } from "@/lib/mtg/scryfall"

// --- Regex patterns (compiled once) ---

const SPELL_PAYOFF_PAYOFF = /whenever you cast an instant or sorcery|prowess|magecraft/i
const GRAVEYARD_PROVIDER = /\bmills?\b|\bdiscards?\b|\bput.{0,40}into.{0,20}graveyard/i
const GRAVEYARD_PAYOFF = /from (your|a|the) graveyard|\bescape\b|\bflashback\b|\bunearth\b|\bdredge\b|whenever.{0,40}(card|creature).{0,30}leaves.{0,20}(your )?graveyard/i
const COUNTERS_PROVIDER = /enters? with.{0,20}\+1\/\+1 counter|\bproliferate\b|\badapt\b|\bevolve\b|\briot\b|\breinforce\b|\bX \+1\/\+1 counters?\b|\bput X.{0,20}counters?\b/i
const COUNTERS_PAYOFF = /\bcounter on it\b|\bnumber of counters\b|\bfor each counter\b/i
const TOKENS_PROVIDER = /\bcreates?.{0,50}tokens?|\bpopulate\b|\bamass\b/i
const TOKENS_PAYOFF = /whenever (a|another) token.{0,30}enters|whenever (a|another) (creature|token).{0,30}enters.{0,60}token|\beach token\b|\bfor each token\b/i
const SACRIFICE_PROVIDER = /\bsacrifice\b.{0,60}(as an additional cost|to activate|another creature|any number)|\b(you may )?sacrifice a (creature|permanent)\b/i
const SACRIFICE_PAYOFF = /whenever.{0,60}(creature|permanent).{0,30}\bdies\b/i
const LIFEGAIN_PROVIDER =
  /\bgains? lifelink\b|\byou gain \d+ life\b|\bgain life equal to\b|\byou gain life for each\b|\byou gain X life\b|\bloses?.{0,40}you gain.{0,20}life\b/i
const LIFEGAIN_PAYOFF = /whenever you gain life/i
const KEYWORD_LORD =
  /other creatures you control (have|get|gain).{0,50}(flying|trample|lifelink|vigilance|menace|haste|first strike|deathtouch)/i
const REPARTEE_PROVIDER =
  /target (a |your |another )?creature.{0,80}(gets? \+[0-9]+\/|gains? (hexproof|indestructible|protection|trample|flying|first strike|double strike|vigilance)|\+[0-9]+\/\+[0-9]+)/i
const REPARTEE_PAYOFF =
  /whenever.{0,50}becomes? (the )?target(ed)?.{0,40}spell.{0,40}you control|whenever you cast a spell that targets? (it\b|this\b)/i
const EXPENSIVE_SPELLS_PAYOFF =
  /whenever you cast a spell with (mana value|converted mana cost) [5-9]|\bopus\b/i
const CONVERGE_PAYOFF = /\bconverge\b|for each (different )?color of mana spent to cast/i
const TRIBAL_PAYOFF_TEMPLATE = (subtype: string) =>
  new RegExp(
    `other ${subtype}s?|for each ${subtype}|${subtype}s? you control (get|have|gain)`,
    "i",
  )

// Subtypes too generic to be meaningful at low density in Sealed
const GENERIC_SUBTYPE_DENY_LIST = new Set(["Human", "Wizard", "Soldier", "Knight"])
const GENERIC_SUBTYPE_THRESHOLD = 4

// --- Helpers ---

type ResolvedText = { text: string; keywords: string[] }

function resolveOracleText(card: ScryfallCard): ResolvedText {
  if (card.card_faces && card.card_faces.length > 0) {
    return {
      text: card.card_faces.map((f) => f.oracle_text).join("\n"),
      keywords: card.card_faces.flatMap((f) => f.keywords),
    }
  }
  return {
    text: card.oracle_text ?? "",
    keywords: card.keywords,
  }
}

function parseSubtypes(typeLine: string): string[] {
  const dashIndex = typeLine.indexOf("—")
  if (dashIndex === -1) return []
  return typeLine
    .slice(dashIndex + 1)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function isCreatureTypeLine(typeLine: string): boolean {
  return /creature/i.test(typeLine)
}

// Returns creature subtypes from every face that is a creature.
// For a plain card this is just the one type line; for a DFC it checks both faces
// so that back-face creatures (e.g. a Saga that transforms into a Zombie) are included.
function getCreatureSubtypes(card: ScryfallCard): string[] {
  if (!card.card_faces) {
    return isCreatureTypeLine(card.type_line) ? parseSubtypes(card.type_line) : []
  }
  return card.card_faces
    .filter((face) => isCreatureTypeLine(face.type_line))
    .flatMap((face) => parseSubtypes(face.type_line))
}

// Returns true if any face of the card is an instant or sorcery.
function isSpellCard(card: ScryfallCard): boolean {
  if (!card.card_faces) {
    return /instant|sorcery/i.test(card.type_line)
  }
  return card.card_faces.some((face) => /instant|sorcery/i.test(face.type_line))
}

// --- Public API ---

export function extractPoolSubtypes(data: ScryfallDataMap, threshold = 2): Set<string> {
  const counts = new Map<string, number>()

  for (const card of data.values()) {
    const subtypes = getCreatureSubtypes(card)
    for (const subtype of subtypes) {
      counts.set(subtype, (counts.get(subtype) ?? 0) + 1)
    }
  }

  const result = new Set<string>()
  for (const [subtype, count] of counts) {
    const effectiveThreshold =
      GENERIC_SUBTYPE_DENY_LIST.has(subtype) ? GENERIC_SUBTYPE_THRESHOLD : threshold
    if (count >= effectiveThreshold) {
      result.add(subtype)
    }
  }
  return result
}

export function deriveCardSynergyTags(
  card: ScryfallCard,
  poolSubtypes: Set<string>,
  isFixing = false,
): CardSynergyTags {
  const { text, keywords } = resolveOracleText(card)
  const tags: CardSynergyTags = {}

  // spellPayoff — instants/sorceries are providers; payoff cards reward casting them
  const isSpell = isSpellCard(card)
  const isSpellPayoff =
    SPELL_PAYOFF_PAYOFF.test(text) ||
    keywords.some((k) => /prowess|magecraft/i.test(k))
  if (isSpell && isSpellPayoff) {
    tags.spellPayoff = "both"
  } else if (isSpell) {
    tags.spellPayoff = "provider"
  } else if (isSpellPayoff) {
    tags.spellPayoff = "payoff"
  }

  // graveyard
  const isGraveyardProvider = GRAVEYARD_PROVIDER.test(text)
  const isGraveyardPayoff = GRAVEYARD_PAYOFF.test(text) || keywords.some((k) => /escape|flashback|unearth|dredge|aftermath|jump-?start|retrace/i.test(k))
  if (isGraveyardProvider && isGraveyardPayoff) {
    tags.graveyard = "both"
  } else if (isGraveyardProvider) {
    tags.graveyard = "provider"
  } else if (isGraveyardPayoff) {
    tags.graveyard = "payoff"
  }

  // counters
  const isCountersProvider = COUNTERS_PROVIDER.test(text) || keywords.some((k) => /proliferate|adapt|evolve|riot/i.test(k))
  const isCountersPayoff = COUNTERS_PAYOFF.test(text)
  if (isCountersProvider && isCountersPayoff) {
    tags.counters = "both"
  } else if (isCountersProvider) {
    tags.counters = "provider"
  } else if (isCountersPayoff) {
    tags.counters = "payoff"
  }

  // tokens
  const isTokensProvider = TOKENS_PROVIDER.test(text)
  const isTokensPayoff = TOKENS_PAYOFF.test(text)
  if (isTokensProvider && isTokensPayoff) {
    tags.tokens = "both"
  } else if (isTokensProvider) {
    tags.tokens = "provider"
  } else if (isTokensPayoff) {
    tags.tokens = "payoff"
  }

  // sacrifice
  const isSacrificeProvider = SACRIFICE_PROVIDER.test(text)
  const isSacrificePayoff = SACRIFICE_PAYOFF.test(text)
  if (isSacrificeProvider && isSacrificePayoff) {
    tags.sacrifice = "both"
  } else if (isSacrificeProvider) {
    tags.sacrifice = "provider"
  } else if (isSacrificePayoff) {
    tags.sacrifice = "payoff"
  }

  // lifegain
  const isLifegainProvider =
    LIFEGAIN_PROVIDER.test(text) || keywords.some((k) => /^lifelink$/i.test(k))
  const isLifegainPayoff = LIFEGAIN_PAYOFF.test(text)
  if (isLifegainProvider && isLifegainPayoff) {
    tags.lifegain = "both"
  } else if (isLifegainProvider) {
    tags.lifegain = "provider"
  } else if (isLifegainPayoff) {
    tags.lifegain = "payoff"
  }

  // keywordLord
  if (KEYWORD_LORD.test(text)) {
    tags.keywordLord = "payoff"
  }

  // tribal — check every creature face so that back-face creatures contribute as providers
  if (poolSubtypes.size > 0) {
    const cardSubtypes = getCreatureSubtypes(card)
    const isTribalProvider = cardSubtypes.some((s) => poolSubtypes.has(s))
    const isTribalPayoff = [...poolSubtypes].some((subtype) =>
      TRIBAL_PAYOFF_TEMPLATE(subtype).test(text),
    )
    if (isTribalProvider && isTribalPayoff) {
      tags.tribal = "both"
    } else if (isTribalProvider) {
      tags.tribal = "provider"
    } else if (isTribalPayoff) {
      tags.tribal = "payoff"
    }
  }

  // repartee — instants that pump/protect your creatures are providers; creatures that reward being targeted are payoffs
  const isReparteeProvider = isSpell && REPARTEE_PROVIDER.test(text)
  const isReparteePayoff = REPARTEE_PAYOFF.test(text)
  if (isReparteeProvider && isReparteePayoff) {
    tags.repartee = "both"
  } else if (isReparteeProvider) {
    tags.repartee = "provider"
  } else if (isReparteePayoff) {
    tags.repartee = "payoff"
  }

  // expensiveSpells — non-land cards with CMC ≥ 5 are providers; payoffs reward casting them
  const isExpensiveSpellProvider =
    card.cmc !== undefined && card.cmc >= 5 && !/\bland\b/i.test(card.type_line)
  const isExpensiveSpellPayoff = EXPENSIVE_SPELLS_PAYOFF.test(text)
  if (isExpensiveSpellProvider && isExpensiveSpellPayoff) {
    tags.expensiveSpells = "both"
  } else if (isExpensiveSpellProvider) {
    tags.expensiveSpells = "provider"
  } else if (isExpensiveSpellPayoff) {
    tags.expensiveSpells = "payoff"
  }

  // converge — fixing cards are providers; converge spells are payoffs
  const isConvergeProvider = isFixing
  const isConvergePayoff = CONVERGE_PAYOFF.test(text) || keywords.some((k) => /converge/i.test(k))
  if (isConvergeProvider && isConvergePayoff) {
    tags.converge = "both"
  } else if (isConvergeProvider) {
    tags.converge = "provider"
  } else if (isConvergePayoff) {
    tags.converge = "payoff"
  }

  // Aftermath cards cast their second face from the graveyard — always graveyard payoffs
  if (card.layout === "aftermath") {
    if (!tags.graveyard) {
      tags.graveyard = "payoff"
    } else if (tags.graveyard === "provider") {
      tags.graveyard = "both"
    }
  }

  return tags
}

export function buildAllTags(
  poolCards: PoolCard[],
  scryfallData: ScryfallDataMap,
): Map<string, CardSynergyTags> {
  const poolSubtypes = extractPoolSubtypes(scryfallData)
  const allTags = new Map<string, CardSynergyTags>()

  for (const { ratingCard } of poolCards) {
    const scryfallCard = scryfallData.get(ratingCard.normalizedName)
    if (!scryfallCard) continue
    allTags.set(ratingCard.normalizedName, deriveCardSynergyTags(scryfallCard, poolSubtypes, ratingCard.role.isFixing))
  }

  return allTags
}

// --- Scoring ---

const TAG_WEIGHTS: Record<SynergyTag, number> = {
  tribal: 2.5,
  graveyard: 2.2,
  tokens: 2.0,
  sacrifice: 2.0,
  counters: 1.8,
  expensiveSpells: 1.8,
  spellPayoff: 1.5,
  repartee: 1.5,
  converge: 1.5,
  keywordLord: 1.2,
  lifegain: 1.2,
}

const ALL_TAGS: SynergyTag[] = [
  "tribal",
  "graveyard",
  "tokens",
  "sacrifice",
  "counters",
  "expensiveSpells",
  "spellPayoff",
  "repartee",
  "converge",
  "keywordLord",
  "lifegain",
]

const SYNERGY_BONUS_CAP = 8.0

export function computeSynergyBonus(
  deckCards: DeckCard[],
  allTags: Map<string, CardSynergyTags>,
): { bonus: number; breakdown: SynergyBreakdown; detail: SynergyDetail } {
  const breakdown: SynergyBreakdown = {}
  const detail: SynergyDetail = {}
  let total = 0

  for (const tag of ALL_TAGS) {
    let providerCount = 0
    let payoffCount = 0
    const contributors: SynergyCardContributor[] = []

    for (const entry of deckCards) {
      const cardTags = allTags.get(entry.card.normalizedName)
      if (!cardTags) continue
      const role: SynergyRole | undefined = cardTags[tag]
      if (role === "provider") {
        providerCount += entry.quantity
        contributors.push({ name: entry.card.normalizedName, displayName: entry.card.displayName, quantity: entry.quantity, role: "provider" })
      } else if (role === "payoff") {
        payoffCount += entry.quantity
        contributors.push({ name: entry.card.normalizedName, displayName: entry.card.displayName, quantity: entry.quantity, role: "payoff" })
      } else if (role === "both") {
        providerCount += entry.quantity
        payoffCount += entry.quantity
        contributors.push({ name: entry.card.normalizedName, displayName: entry.card.displayName, quantity: entry.quantity, role: "both" })
      }
    }

    // Tribal requires an explicit payoff (lord/anthem/synergy card) — a pile of
    // same-type creatures sharing a subtype is not a synergy on its own.
    const fires = tag === "tribal"
      ? providerCount >= 2 && payoffCount >= 1
      : (providerCount >= 2 && payoffCount >= 1) || providerCount + payoffCount >= 3
    if (!fires) continue

    const density = Math.min(providerCount + payoffCount, 10) / 10
    const contribution = density * TAG_WEIGHTS[tag]
    breakdown[tag] = Number(contribution.toFixed(2))
    detail[tag] = { score: Number(contribution.toFixed(2)), contributors }
    total += contribution
  }

  return {
    bonus: Number(Math.min(total, SYNERGY_BONUS_CAP).toFixed(2)),
    breakdown,
    detail,
  }
}
