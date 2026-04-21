import type {
  CardSynergyEvidenceMap,
  CardSynergyTags,
  DeckCard,
  PoolCard,
  SynergyBreakdown,
  SynergyCardContributor,
  SynergyDetail,
  SynergyRole,
  SynergyTag,
  SynergyTagAnalysis,
} from "@/lib/mtg/types"
import type { ScryfallCard, ScryfallDataMap } from "@/lib/mtg/scryfall"

type TagCandidate = { re: RegExp; reason: string }
type RawEvidence = { provider: string[]; payoff: string[] }

export const ALL_TAGS: SynergyTag[] = [
  "tribal",
  "prepare",
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

const TAG_WEIGHTS: Record<SynergyTag, number> = {
  tribal: 2.5,
  prepare: 1.5,
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

const SYNERGY_BONUS_CAP = 8.0

// Subtypes too generic to be meaningful at low density in Sealed
const GENERIC_SUBTYPE_DENY_LIST = new Set(["Human", "Wizard", "Soldier", "Knight"])
const GENERIC_SUBTYPE_THRESHOLD = 4

function createRawEvidenceMap(): Record<SynergyTag, RawEvidence> {
  return ALL_TAGS.reduce<Record<SynergyTag, RawEvidence>>((acc, tag) => {
    acc[tag] = { provider: [], payoff: [] }
    return acc
  }, {} as Record<SynergyTag, RawEvidence>)
}

function addReason(bucket: RawEvidence, side: "provider" | "payoff", reason: string): void {
  if (!bucket[side].includes(reason)) {
    bucket[side].push(reason)
  }
}

function firstTextMatch(text: string, candidates: TagCandidate[]): string | null {
  for (const { re, reason } of candidates) {
    if (re.test(text)) {
      return reason
    }
  }
  return null
}

function firstKeywordMatch(keywords: string[], candidates: TagCandidate[]): string | null {
  for (const keyword of keywords) {
    for (const { re, reason } of candidates) {
      if (re.test(keyword)) {
        return reason
      }
    }
  }
  return null
}

type ResolvedText = { text: string; keywords: string[] }

function resolveOracleText(card: ScryfallCard): ResolvedText {
  if (card.card_faces && card.card_faces.length > 0) {
    return {
      text: card.card_faces.map((face) => face.oracle_text).join("\n"),
      keywords: card.card_faces.flatMap((face) => face.keywords),
    }
  }

  return {
    text: card.oracle_text ?? "",
    keywords: card.keywords,
  }
}

function isPrepareCard(card: ScryfallCard): boolean {
  if (card.layout === "prepare") {
    return true
  }

  if (!card.card_faces || card.card_faces.length < 2) {
    return false
  }

  const combinedText = card.card_faces.map((face) => face.oracle_text).join("\n")
  return (
    /prepared/i.test(combinedText) &&
    /creature/i.test(card.card_faces[0]?.type_line ?? "") &&
    /instant|sorcery/i.test(card.card_faces[1]?.type_line ?? "")
  )
}

function getRulesTypeLine(card: ScryfallCard): string {
  if (isPrepareCard(card)) {
    return card.card_faces?.[0]?.type_line ?? card.type_line.split("//")[0]?.trim() ?? card.type_line
  }

  return card.type_line
}

function getRulesManaValue(card: ScryfallCard): number {
  return Number(card.cmc ?? 0)
}

function isLandCard(card: ScryfallCard): boolean {
  return /\bland\b/i.test(getRulesTypeLine(card))
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
function getCreatureSubtypes(card: ScryfallCard): string[] {
  if (!card.card_faces) {
    return isCreatureTypeLine(card.type_line) ? parseSubtypes(card.type_line) : []
  }

  return card.card_faces
    .filter((face) => isCreatureTypeLine(face.type_line))
    .flatMap((face) => parseSubtypes(face.type_line))
}

function isSpellCard(card: ScryfallCard): boolean {
  if (isPrepareCard(card)) {
    return false
  }

  if (!card.card_faces) {
    return /instant|sorcery/i.test(card.type_line)
  }

  return card.card_faces.some((face) => /instant|sorcery/i.test(face.type_line))
}

function parseManaSymbolCost(costExpression: string): number | null {
  const symbols = [...costExpression.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]?.trim() ?? "")
  if (symbols.length === 0) {
    return null
  }

  let total = 0
  for (const symbol of symbols) {
    if (/^\d+$/.test(symbol)) {
      total += Number(symbol)
      continue
    }

    if (/^[WUBRGCS]$/i.test(symbol)) {
      total += 1
      continue
    }

    if (/^[WUBRGCS]\/[WUBRGCS]$/i.test(symbol) || /^\d+\/[WUBRGCS]$/i.test(symbol)) {
      total += 1
      continue
    }

    if (/^X$/i.test(symbol)) {
      return null
    }

    total += 1
  }

  return total
}

function getManaIntensiveProviderReason(card: ScryfallCard, text: string): string | null {
  const rulesManaValue = getRulesManaValue(card)
  if (rulesManaValue >= 5 && !isLandCard(card)) {
    return `CMC ${rulesManaValue} (5 or higher)`
  }

  const flashbackCost = text.match(/\bflashback\s+((?:\{[^}]+\})+)/i)?.[1]
  if (flashbackCost) {
    const total = parseManaSymbolCost(flashbackCost)
    if (total !== null && total >= 5) {
      return `flashback cost ${total}`
    }
  }

  return null
}

function finalizeEvidence(raw: Record<SynergyTag, RawEvidence>): CardSynergyEvidenceMap {
  const result: CardSynergyEvidenceMap = {}

  for (const tag of ALL_TAGS) {
    const provider = raw[tag].provider
    const payoff = raw[tag].payoff

    if (provider.length > 0 && payoff.length > 0) {
      result[tag] = { role: "both", reasons: [...provider, ...payoff] }
    } else if (provider.length > 0) {
      result[tag] = { role: "provider", reasons: [...provider] }
    } else if (payoff.length > 0) {
      result[tag] = { role: "payoff", reasons: [...payoff] }
    }
  }

  return result
}

function evidenceToTags(evidence: CardSynergyEvidenceMap): CardSynergyTags {
  const tags: CardSynergyTags = {}

  for (const tag of ALL_TAGS) {
    const entry = evidence[tag]
    if (entry) {
      tags[tag] = entry.role
    }
  }

  return tags
}

function evidenceToAnalysis(evidence: CardSynergyEvidenceMap): SynergyTagAnalysis[] {
  return ALL_TAGS.flatMap((tag) => {
    const entry = evidence[tag]
    if (!entry) return []
    return [{
      tag,
      role: entry.role,
      reason: entry.reasons.join("; "),
    }]
  })
}

export function extractPoolSubtypes(
  poolCards: PoolCard[],
  scryfallData: ScryfallDataMap,
  threshold = 2,
): Set<string> {
  const counts = new Map<string, number>()

  for (const poolCard of poolCards) {
    const scryfallCard = scryfallData.get(poolCard.ratingCard.normalizedName)
    if (!scryfallCard) continue

    for (const subtype of getCreatureSubtypes(scryfallCard)) {
      counts.set(subtype, (counts.get(subtype) ?? 0) + poolCard.quantity)
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

export function deriveCardSynergyEvidence(
  card: ScryfallCard,
  poolSubtypes: Set<string>,
  isFixing = false,
): CardSynergyEvidenceMap {
  const { text, keywords } = resolveOracleText(card)
  const raw = createRawEvidenceMap()
  const prepareCard = isPrepareCard(card)
  const cardIsSpell = isSpellCard(card)

  // prepare
  if (prepareCard) {
    addReason(raw.prepare, "provider", "prepare card creates a spell copy while prepared")
  }

  const preparePayoffReason = firstTextMatch(text, [
    { re: /\benters prepared\b/i, reason: "enters prepared" },
    { re: /\bbecomes prepared\b/i, reason: "becomes prepared" },
    { re: /\bbecomes unprepared\b/i, reason: "becomes unprepared" },
    { re: /\bwhile (?:it|this creature|this permanent)'?s? prepared\b/i, reason: "cares about being prepared" },
    { re: /\bwhile (?:it|this creature|this permanent) is prepared\b/i, reason: "cares about being prepared" },
    { re: /\bprepared creature\b/i, reason: "references a prepared creature" },
    { re: /\bprepared permanent\b/i, reason: "references a prepared permanent" },
    { re: /\bunprepared\b/i, reason: "references becoming unprepared" },
  ])

  if (preparePayoffReason) {
    addReason(raw.prepare, "payoff", preparePayoffReason)
  }

  // spellPayoff
  if (cardIsSpell) {
    addReason(raw.spellPayoff, "provider", "instant or sorcery type")
  }

  const spellPayoffReason =
    firstKeywordMatch(keywords, [
      { re: /prowess/i, reason: "prowess keyword" },
      { re: /magecraft/i, reason: "magecraft keyword" },
      { re: /opus/i, reason: "opus keyword" },
    ]) ??
    firstTextMatch(text, [
      { re: /whenever you cast(?: or copy)? an instant or sorcery/i, reason: '"whenever you cast an instant or sorcery"' },
      { re: /whenever you cast or copy an instant or sorcery/i, reason: '"whenever you cast or copy an instant or sorcery"' },
      { re: /\bif you've cast an instant or sorcery spell this turn\b/i, reason: "checks whether you've cast an instant or sorcery spell this turn" },
      { re: /\bwhen you next cast an instant or sorcery spell\b/i, reason: "modifies your next instant or sorcery spell" },
      { re: /\byou may cast an instant or sorcery spell from your hand\b/i, reason: "lets you cast an instant or sorcery spell" },
      { re: /\bcopy target instant or sorcery spell\b/i, reason: "copies an instant or sorcery spell" },
      { re: /\bcopy that spell\b/i, reason: "copies a spell" },
      { re: /\bprowess\b/i, reason: "prowess" },
      { re: /\bmagecraft\b/i, reason: "magecraft" },
    ])

  if (spellPayoffReason) {
    addReason(raw.spellPayoff, "payoff", spellPayoffReason)
  }

  // graveyard
  const graveyardProviderReason =
    firstKeywordMatch(keywords, [
      { re: /surveil/i, reason: "surveil keyword" },
      { re: /mill/i, reason: "mill keyword" },
    ]) ??
    firstTextMatch(text, [
      { re: /\bsurveil\b/i, reason: "surveils" },
      { re: /\bmills?\b/i, reason: "mills" },
      { re: /\bdiscards?\b/i, reason: "discards" },
      { re: /\bdraw.{0,40}discard\b/i, reason: "loots or rummages" },
      { re: /\bdiscard.{0,40}draw\b/i, reason: "loots or rummages" },
      { re: /\bput.{0,60}into.{0,20}graveyard\b/i, reason: "puts cards into graveyard" },
      { re: /\bput.{0,80}into your hand or graveyard\b/i, reason: "puts cards into hand or graveyard" },
      { re: /\bas an additional cost to cast this spell, discard a card\b/i, reason: "discards as an additional cost" },
      { re: /\bdiscard a card:\b/i, reason: "discards to activate an ability" },
    ])

  if (graveyardProviderReason) {
    addReason(raw.graveyard, "provider", graveyardProviderReason)
  }

  const graveyardPayoffReason =
    firstKeywordMatch(keywords, [
      { re: /escape/i, reason: "escape keyword" },
      { re: /flashback/i, reason: "flashback keyword" },
      { re: /unearth/i, reason: "unearth keyword" },
      { re: /dredge/i, reason: "dredge keyword" },
      { re: /aftermath/i, reason: "aftermath keyword" },
      { re: /jump-?start/i, reason: "jump-start keyword" },
      { re: /retrace/i, reason: "retrace keyword" },
    ]) ??
    firstTextMatch(text, [
      { re: /\b(?:cast|play|return|put|copy).{0,70}from (your|a|the) graveyard\b/i, reason: "casts or returns from graveyard" },
      { re: /\btarget .{0,50} card from (your|a|the) graveyard\b/i, reason: "uses cards from a graveyard" },
      { re: /\bwhenever.{0,40}(card|creature).{0,30}leaves.{0,20}(your )?graveyard\b/i, reason: "triggers on leaving graveyard" },
      { re: /\b(?:if|when|whenever).{0,50}cards? left your graveyard\b/i, reason: "checks whether cards left your graveyard" },
      { re: /\bexile.{0,50}from your graveyard\b/i, reason: "exiles cards from your graveyard" },
      { re: /\b(?:creature|instant|sorcery|card)s? in your graveyard\b/i, reason: "checks cards in your graveyard" },
      { re: /\bif there (?:is|are).{0,50}in your graveyard\b/i, reason: "checks for cards in your graveyard" },
    ]) ??
    (card.layout === "aftermath" ? "aftermath layout" : null)

  if (graveyardPayoffReason) {
    addReason(raw.graveyard, "payoff", graveyardPayoffReason)
  }

  // counters
  const countersProviderReason =
    firstKeywordMatch(keywords, [
      { re: /proliferate/i, reason: "proliferate keyword" },
      { re: /adapt/i, reason: "adapt keyword" },
      { re: /evolve/i, reason: "evolve keyword" },
      { re: /riot/i, reason: "riot keyword" },
    ]) ??
    firstTextMatch(text, [
      { re: /enters? with.{0,20}\+1\/\+1 counter/i, reason: "enters with +1/+1 counters" },
      { re: /\bX \+1\/\+1 counters?\b/i, reason: "puts X +1/+1 counters" },
      { re: /\bput X.{0,20}counters?\b/i, reason: "puts X counters" },
      { re: /\breinforce\b/i, reason: "reinforce" },
      { re: /\bput.{0,30}\+1\/\+1 counters?\b/i, reason: "puts +1/+1 counters" },
    ])

  if (countersProviderReason) {
    addReason(raw.counters, "provider", countersProviderReason)
  }

  const countersPayoffReason = firstTextMatch(text, [
    { re: /\bcounter on it\b/i, reason: "references counters on itself" },
    { re: /\bnumber of counters\b/i, reason: "scales with counter count" },
    { re: /\bfor each counter\b/i, reason: "triggers for each counter" },
    { re: /\bwhenever one or more \+1\/\+1 counters are put\b/i, reason: "triggers when counters are added" },
  ]) ?? firstKeywordMatch(keywords, [
    { re: /increment/i, reason: "increment keyword" },
  ])

  if (countersPayoffReason) {
    addReason(raw.counters, "payoff", countersPayoffReason)
  }

  // tokens
  const tokensProviderReason =
    firstKeywordMatch(keywords, [
      { re: /investigate/i, reason: "investigate keyword" },
      { re: /treasure/i, reason: "treasure keyword" },
      { re: /role token/i, reason: "role token keyword" },
    ]) ??
    firstTextMatch(text, [
      { re: /\bpopulate\b/i, reason: "populate keyword" },
      { re: /\bamass\b/i, reason: "amass keyword" },
      { re: /\binvestigate\b/i, reason: "investigates" },
      { re: /\bcreates?.{0,60}tokens?\b/i, reason: "creates tokens" },
      { re: /\bcreate(?:s)? .{0,60}\b(?:Treasure|Clue|Role) token\b/i, reason: "creates named tokens" },
    ])

  if (tokensProviderReason) {
    addReason(raw.tokens, "provider", tokensProviderReason)
  }

  const tokensPayoffReason = firstTextMatch(text, [
    { re: /\bwhenever one or more tokens? you control enter\b/i, reason: "triggers when your tokens enter" },
    { re: /\bwhenever (a|another) token.{0,30}enters\b/i, reason: "triggers when a token enters" },
    { re: /\bwhenever (a|another) (creature|token).{0,30}enters.{0,60}token\b/i, reason: "triggers on token ETB" },
    { re: /\beach token\b/i, reason: '"each token" effect' },
    { re: /\bfor each token\b/i, reason: '"for each token" effect' },
    { re: /\btokens? you control (get|have|gain)\b/i, reason: "buffs or grants abilities to your tokens" },
  ])

  if (tokensPayoffReason) {
    addReason(raw.tokens, "payoff", tokensPayoffReason)
  }

  // sacrifice
  const sacrificeProviderReason = firstTextMatch(text, [
    { re: /\bas an additional cost to cast this spell, sacrifice\b/i, reason: "sacrifice as additional cost" },
    { re: /\bsacrifice\b.{0,60}\bto activate\b/i, reason: "sacrifice to activate ability" },
    { re: /\bsacrifice\b.{0,60}\banother creature\b/i, reason: "sacrifice another creature" },
    { re: /\bsacrifice\b.{0,60}\bany number\b/i, reason: "sacrifice any number" },
    { re: /\b(you may )?sacrifice a (creature|permanent|artifact|land|token)\b/i, reason: "sacrifices your own permanent" },
    { re: /\bsacrifice this (creature|permanent|artifact|land)\b/i, reason: "sacrifices itself" },
  ])

  if (sacrificeProviderReason) {
    addReason(raw.sacrifice, "provider", sacrificeProviderReason)
  }

  const sacrificePayoffReason = firstTextMatch(text, [
    { re: /\bwhenever.{0,60}(creature|permanent).{0,30}\bdies\b/i, reason: "triggers when a creature dies" },
    { re: /\bwhenever you sacrifice\b/i, reason: "triggers when you sacrifice a permanent" },
    { re: /\bwhenever one or more permanents are sacrificed\b/i, reason: "triggers when permanents are sacrificed" },
    { re: /\bif one or more permanents were sacrificed this turn\b/i, reason: "checks whether permanents were sacrificed this turn" },
  ])

  if (sacrificePayoffReason) {
    addReason(raw.sacrifice, "payoff", sacrificePayoffReason)
  }

  // lifegain
  const lifegainProviderReason =
    firstKeywordMatch(keywords, [
      { re: /^lifelink$/i, reason: "lifelink keyword" },
    ]) ??
    firstTextMatch(text, [
      { re: /\bgains? lifelink\b/i, reason: "grants lifelink" },
      { re: /\byou gain \d+ life\b/i, reason: "gains life" },
      { re: /\bgain life equal to\b/i, reason: "gains life equal to" },
      { re: /\byou gain life for each\b/i, reason: "gains life per trigger" },
      { re: /\byou gain X life\b/i, reason: "gains X life" },
      { re: /\bloses?.{0,40}you gain.{0,20}life\b/i, reason: "drain effect" },
    ])

  if (lifegainProviderReason) {
    addReason(raw.lifegain, "provider", lifegainProviderReason)
  }

  const lifegainPayoffReason = firstTextMatch(text, [
    { re: /\bwhenever you gain life\b/i, reason: '"whenever you gain life"' },
    { re: /\b(?:if|when|whenever).{0,40}you gained life this turn\b/i, reason: "checks whether you gained life this turn" },
    { re: /\bas long as you gained life this turn\b/i, reason: "checks whether you gained life this turn" },
    { re: /\bgain life for the first time each turn\b/i, reason: "checks your first lifegain each turn" },
    { re: /\bif you gained life this turn\b/i, reason: "checks whether you gained life this turn" },
  ])

  if (lifegainPayoffReason) {
    addReason(raw.lifegain, "payoff", lifegainPayoffReason)
  }

  // keywordLord
  if (/other creatures you control (have|get|gain).{0,50}(flying|trample|lifelink|vigilance|menace|haste|first strike|deathtouch)/i.test(text)) {
    addReason(raw.keywordLord, "payoff", "grants a combat keyword to other creatures you control")
  }

  // tribal
  if (poolSubtypes.size > 0) {
    const cardSubtypes = getCreatureSubtypes(card)
    const matchedProviderType = cardSubtypes.find((subtype) => poolSubtypes.has(subtype))
    const matchedPayoffType = [...poolSubtypes].find((subtype) =>
      new RegExp(`other ${subtype}s?|for each ${subtype}|${subtype}s? you control (get|have|gain)`, "i").test(text),
    )

    if (matchedProviderType) {
      addReason(raw.tribal, "provider", `${matchedProviderType} creature type`)
    }
    if (matchedPayoffType) {
      addReason(raw.tribal, "payoff", `lords or synergizes with ${matchedPayoffType}s`)
    }
  }

  // repartee
  const reparteeProviderReason =
    cardIsSpell
      ? firstTextMatch(text, [
          {
            re: /target (a |your |another )?creature.{0,80}(gets? \+[0-9]+\/|gains? (hexproof|indestructible|protection|trample|flying|first strike|double strike|vigilance)|\+[0-9]+\/\+[0-9]+)/i,
            reason: "instant or sorcery that pumps or protects a creature",
          },
          {
            re: /(one or two|up to two) target creatures?.{0,80}(each get|get|gain)/i,
            reason: "instant or sorcery that targets one or more creatures",
          },
        ])
      : null

  if (reparteeProviderReason) {
    addReason(raw.repartee, "provider", reparteeProviderReason)
  }

  const reparteePayoffReason = firstTextMatch(text, [
    {
      re: /whenever.{0,50}becomes? (the )?target(ed)?.{0,40}spell.{0,40}you control/i,
      reason: '"whenever … becomes the target of a spell you control"',
    },
    {
      re: /whenever you cast a spell that targets? (it\b|this\b|a creature)/i,
      reason: '"whenever you cast a spell that targets a creature"',
    },
    {
      re: /\brepartee\b/i,
      reason: "repartee ability",
    },
  ])

  if (reparteePayoffReason) {
    addReason(raw.repartee, "payoff", reparteePayoffReason)
  }

  // expensiveSpells
  const expensiveSpellProviderReason = getManaIntensiveProviderReason(card, text)
  if (expensiveSpellProviderReason) {
    addReason(raw.expensiveSpells, "provider", expensiveSpellProviderReason)
  }

  const expensiveSpellPayoffReason =
    firstKeywordMatch(keywords, [
      { re: /opus/i, reason: "opus keyword" },
      { re: /increment/i, reason: "increment keyword" },
    ]) ??
    firstTextMatch(text, [
    {
      re: /whenever you cast a spell with (mana value|converted mana cost) [5-9]/i,
      reason: "triggers when casting spells with MV 5+",
    },
    {
      re: /\bif five or more mana was spent to cast that spell\b/i,
      reason: "checks whether five or more mana was spent",
    },
    {
      re: /\bif five or more mana was spent to cast\b/i,
      reason: "checks whether five or more mana was spent",
    },
    {
      re: /\bamount of mana spent to cast that spell\b/i,
      reason: "scales with mana spent to cast the spell",
    },
    {
      re: /\bgreater than this creature's power or toughness\b/i,
      reason: "increment checks mana spent against power or toughness",
    },
    { re: /\bopus\b/i, reason: '"opus" ability' },
    { re: /\bparadigm\b/i, reason: '"paradigm" spell engine' },
  ])

  if (expensiveSpellPayoffReason) {
    addReason(raw.expensiveSpells, "payoff", expensiveSpellPayoffReason)
  }

  // converge
  if (isFixing) {
    addReason(raw.converge, "provider", "mana-fixing card")
  }

  const convergePayoffReason =
    firstKeywordMatch(keywords, [{ re: /converge/i, reason: "converge keyword" }]) ??
    firstTextMatch(text, [
      { re: /\bconverge\b/i, reason: "converge keyword" },
      { re: /for each (different )?color of mana spent to cast/i, reason: "scales with colors of mana spent" },
    ])

  if (convergePayoffReason) {
    addReason(raw.converge, "payoff", convergePayoffReason)
  }

  return finalizeEvidence(raw)
}

export function deriveCardSynergyTags(
  card: ScryfallCard,
  poolSubtypes: Set<string>,
  isFixing = false,
): CardSynergyTags {
  return evidenceToTags(deriveCardSynergyEvidence(card, poolSubtypes, isFixing))
}

export function deriveCardSynergyTagAnalysis(
  card: ScryfallCard,
  poolSubtypes: Set<string>,
  isFixing = false,
): SynergyTagAnalysis[] {
  return evidenceToAnalysis(deriveCardSynergyEvidence(card, poolSubtypes, isFixing))
}

export function buildAllTags(
  poolCards: PoolCard[],
  scryfallData: ScryfallDataMap,
): Map<string, CardSynergyTags> {
  const poolSubtypes = extractPoolSubtypes(poolCards, scryfallData)
  const allTags = new Map<string, CardSynergyTags>()

  for (const { ratingCard } of poolCards) {
    const scryfallCard = scryfallData.get(ratingCard.normalizedName)
    if (!scryfallCard || allTags.has(ratingCard.normalizedName)) continue

    allTags.set(
      ratingCard.normalizedName,
      deriveCardSynergyTags(scryfallCard, poolSubtypes, ratingCard.role.isFixing),
    )
  }

  return allTags
}

export function computeSynergyBonus(
  deckCards: DeckCard[],
  allTags: Map<string, CardSynergyTags>,
): { bonus: number; breakdown: SynergyBreakdown; detail: SynergyDetail } {
  const breakdown: SynergyBreakdown = {}
  const detail: SynergyDetail = {}
  let total = 0

  for (const tag of ALL_TAGS) {
    let providerWeight = 0
    let payoffWeight = 0
    let hasBoth = false
    const contributors: SynergyCardContributor[] = []

    for (const entry of deckCards) {
      const cardTags = allTags.get(entry.card.normalizedName)
      if (!cardTags) continue

      const role: SynergyRole | undefined = cardTags[tag]
      if (!role) continue

      if (role === "provider") {
        providerWeight += entry.quantity
      } else if (role === "payoff") {
        payoffWeight += entry.quantity
      } else {
        providerWeight += entry.quantity
        payoffWeight += entry.quantity
        hasBoth = true
      }

      contributors.push({
        name: entry.card.normalizedName,
        displayName: entry.card.displayName,
        quantity: entry.quantity,
        role,
      })
    }

    const fires = hasBoth || (providerWeight > 0 && payoffWeight > 0)
    if (!fires) continue

    const density = Math.min(providerWeight + payoffWeight, 10) / 10
    const maxSide = Math.max(providerWeight, payoffWeight)
    const balance = maxSide === 0 ? 0 : Math.min(providerWeight, payoffWeight) / maxSide
    const contribution = density * balance * TAG_WEIGHTS[tag]
    if (contribution <= 0) continue

    const rounded = Number(contribution.toFixed(2))
    breakdown[tag] = rounded
    detail[tag] = { score: rounded, contributors }
    total += contribution
  }

  return {
    bonus: Number(Math.min(total, SYNERGY_BONUS_CAP).toFixed(2)),
    breakdown,
    detail,
  }
}
