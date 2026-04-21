// src/lib/mtg/analyze.ts
import { normalizeCardName } from "@/lib/mtg/normalize"
import type { ScryfallCard, ScryfallDataMap } from "@/lib/mtg/scryfall"
import type {
  CardAnalysis,
  RatingCard,
  RatingIndexEntry,
  RoleFlag,
  ScoreAdjustment,
  SynergyRole,
  SynergyTag,
  SynergyTagAnalysis,
} from "@/lib/mtg/types"

// ---------------------------------------------------------------------------
// Role flags
// ---------------------------------------------------------------------------

function buildRoleFlags(card: RatingCard): RoleFlag[] {
  const { role } = card
  return [
    {
      label: "Cheap creature",
      active: role.isCheapCreature,
      explanation: "Creature with CMC ≤ 3. Scores +0.15.",
    },
    {
      label: "Expensive finisher",
      active: role.isExpensiveFinisher,
      explanation: "Creature with CMC ≥ 5.",
    },
    {
      label: "Interaction",
      active: role.isInteraction,
      explanation: "Instant, sorcery, or non-creature removal effect. Scores +0.20.",
    },
    {
      label: "Fixing",
      active: role.isFixing,
      explanation: "Land that produces two or more colors of mana.",
    },
    {
      label: "Colorless playable",
      active: role.isColorlessPlayable,
      explanation: "Non-land with no colored pips — castable in any deck. Scores +0.08.",
    },
    {
      label: "Conditional",
      active: role.isConditionalCard,
      explanation: "High pip count (≥2), CMC ≥ 6, or X cost. Penalised −0.08.",
    },
    {
      label: "Instant-like",
      active: card.isInstantLike,
      explanation: "Can be cast at instant speed.",
    },
  ]
}

// ---------------------------------------------------------------------------
// Score breakdown
// ---------------------------------------------------------------------------

function buildScoreBreakdown(card: RatingCard): CardAnalysis["scoreBreakdown"] {
  const { role } = card
  const adjustments: ScoreAdjustment[] = []

  if (role.isCheapCreature) {
    adjustments.push({ label: "Cheap creature (CMC ≤ 3)", delta: 0.15 })
  }
  if (role.isInteraction) {
    adjustments.push({ label: "Interaction", delta: 0.20 })
  }
  if (role.isColorlessPlayable) {
    adjustments.push({ label: "Colorless playable", delta: 0.08 })
  }
  const pipPenalty = Math.max(0, role.maxSingleColorPip - 1) * 0.18
  if (pipPenalty > 0) {
    adjustments.push({
      label: `Double/triple pip penalty (${role.maxSingleColorPip} max pip)`,
      delta: -pipPenalty,
    })
  }
  if (role.isConditionalCard) {
    adjustments.push({ label: "Conditional card", delta: -0.08 })
  }

  const total = Number(
    (card.rating + adjustments.reduce((sum, a) => sum + a.delta, 0)).toFixed(2),
  )

  return {
    baseRating: card.rating,
    adjustments: adjustments.map((a) => ({ label: a.label, delta: Number(a.delta.toFixed(2)) })),
    total,
  }
}

// ---------------------------------------------------------------------------
// Synergy tags with reasons
// ---------------------------------------------------------------------------

type TagCandidate = { re: RegExp; reason: string }

function firstTextMatch(text: string, candidates: TagCandidate[]): string | null {
  for (const { re, reason } of candidates) {
    if (re.test(text)) return reason
  }
  return null
}

function firstKeywordMatch(keywords: string[], candidates: TagCandidate[]): string | null {
  for (const kw of keywords) {
    for (const { re, reason } of candidates) {
      if (re.test(kw)) return reason
    }
  }
  return null
}

function resolvedText(card: ScryfallCard): { text: string; keywords: string[] } {
  if (card.card_faces && card.card_faces.length > 0) {
    return {
      text: card.card_faces.map((f) => f.oracle_text).join("\n"),
      keywords: card.card_faces.flatMap((f) => f.keywords),
    }
  }
  return { text: card.oracle_text ?? "", keywords: card.keywords }
}

function isSpell(card: ScryfallCard): boolean {
  if (!card.card_faces) return /instant|sorcery/i.test(card.type_line)
  return card.card_faces.some((f) => /instant|sorcery/i.test(f.type_line))
}

function getCreatureSubtypes(card: ScryfallCard): string[] {
  const parseSubtypes = (tl: string) => {
    const i = tl.indexOf("—")
    if (i === -1) return []
    return tl.slice(i + 1).trim().split(/\s+/).filter(Boolean)
  }
  if (!card.card_faces) {
    return /creature/i.test(card.type_line) ? parseSubtypes(card.type_line) : []
  }
  return card.card_faces
    .filter((f) => /creature/i.test(f.type_line))
    .flatMap((f) => parseSubtypes(f.type_line))
}

function deriveTagsWithReasons(
  card: ScryfallCard,
  poolSubtypes: Set<string>,
  isFixing: boolean,
): SynergyTagAnalysis[] {
  const { text, keywords } = resolvedText(card)
  const results: SynergyTagAnalysis[] = []

  function push(tag: SynergyTag, role: SynergyRole, reason: string) {
    results.push({ tag, role, reason })
  }

  // spellPayoff
  const cardIsSpell = isSpell(card)
  const spellPayoffReason =
    firstKeywordMatch(keywords, [
      { re: /prowess/i, reason: "prowess keyword" },
      { re: /magecraft/i, reason: "magecraft keyword" },
    ]) ??
    firstTextMatch(text, [
      { re: /whenever you cast an instant or sorcery/i, reason: '"whenever you cast an instant or sorcery"' },
      { re: /prowess/i, reason: "prowess" },
      { re: /magecraft/i, reason: "magecraft" },
    ])
  if (cardIsSpell && spellPayoffReason) push("spellPayoff", "both", `instant/sorcery type + ${spellPayoffReason}`)
  else if (cardIsSpell) push("spellPayoff", "provider", "instant or sorcery type")
  else if (spellPayoffReason) push("spellPayoff", "payoff", spellPayoffReason)

  // graveyard
  const gyProviderReason = firstTextMatch(text, [
    { re: /\bmills?\b/i, reason: "mills" },
    { re: /\bdiscards?\b/i, reason: "discards" },
    { re: /\bput.{0,40}into.{0,20}graveyard/i, reason: "puts cards into graveyard" },
  ])
  const gyPayoffReason =
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
      { re: /from (your|a|the) graveyard/i, reason: "casts or returns from graveyard" },
      { re: /whenever.{0,40}(card|creature).{0,30}leaves.{0,20}(your )?graveyard/i, reason: "triggers on leaving graveyard" },
    ]) ??
    (card.layout === "aftermath" ? "aftermath layout" : null)
  if (gyProviderReason && gyPayoffReason) push("graveyard", "both", `${gyProviderReason}; ${gyPayoffReason}`)
  else if (gyProviderReason) push("graveyard", "provider", gyProviderReason)
  else if (gyPayoffReason) push("graveyard", "payoff", gyPayoffReason)

  // counters
  const ctProviderReason =
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
    ])
  const ctPayoffReason = firstTextMatch(text, [
    { re: /\bcounter on it\b/i, reason: "references counters on itself" },
    { re: /\bnumber of counters\b/i, reason: "scales with counter count" },
    { re: /\bfor each counter\b/i, reason: "triggers for each counter" },
  ])
  if (ctProviderReason && ctPayoffReason) push("counters", "both", `${ctProviderReason}; ${ctPayoffReason}`)
  else if (ctProviderReason) push("counters", "provider", ctProviderReason)
  else if (ctPayoffReason) push("counters", "payoff", ctPayoffReason)

  // tokens
  const tkProviderReason = firstTextMatch(text, [
    { re: /\bpopulate\b/i, reason: "populate keyword" },
    { re: /\bamass\b/i, reason: "amass keyword" },
    { re: /\bcreates?.{0,50}tokens?/i, reason: "creates tokens" },
  ])
  const tkPayoffReason = firstTextMatch(text, [
    { re: /whenever (a|another) token.{0,30}enters/i, reason: "triggers when token enters" },
    { re: /whenever (a|another) (creature|token).{0,30}enters.{0,60}token/i, reason: "triggers on token ETB" },
    { re: /\beach token\b/i, reason: '"each token" effect' },
    { re: /\bfor each token\b/i, reason: '"for each token" effect' },
  ])
  if (tkProviderReason && tkPayoffReason) push("tokens", "both", `${tkProviderReason}; ${tkPayoffReason}`)
  else if (tkProviderReason) push("tokens", "provider", tkProviderReason)
  else if (tkPayoffReason) push("tokens", "payoff", tkPayoffReason)

  // sacrifice
  const sacProviderReason = firstTextMatch(text, [
    { re: /\bsacrifice\b.{0,60}\bas an additional cost\b/i, reason: "sacrifice as additional cost" },
    { re: /\bsacrifice\b.{0,60}\bto activate\b/i, reason: "sacrifice to activate ability" },
    { re: /\bsacrifice\b.{0,60}\banother creature\b/i, reason: "sacrifice another creature" },
    { re: /\bsacrifice\b.{0,60}\bany number\b/i, reason: "sacrifice any number" },
    { re: /\b(you may )?sacrifice a (creature|permanent)\b/i, reason: "sacrifice a creature/permanent" },
  ])
  const sacPayoffReason = firstTextMatch(text, [
    { re: /whenever.{0,60}(creature|permanent).{0,30}\bdies\b/i, reason: "triggers when a creature dies" },
  ])
  if (sacProviderReason && sacPayoffReason) push("sacrifice", "both", `${sacProviderReason}; ${sacPayoffReason}`)
  else if (sacProviderReason) push("sacrifice", "provider", sacProviderReason)
  else if (sacPayoffReason) push("sacrifice", "payoff", sacPayoffReason)

  // lifegain
  const lgProviderReason =
    firstKeywordMatch(keywords, [{ re: /^lifelink$/i, reason: "lifelink keyword" }]) ??
    firstTextMatch(text, [
      { re: /\bgains? lifelink\b/i, reason: "grants lifelink" },
      { re: /\byou gain \d+ life\b/i, reason: "gains life" },
      { re: /\bgain life equal to\b/i, reason: "gains life equal to" },
      { re: /\byou gain life for each\b/i, reason: "gains life per trigger" },
      { re: /\byou gain X life\b/i, reason: "gains X life" },
      { re: /\bloses?.{0,40}you gain.{0,20}life\b/i, reason: "drain effect" },
    ])
  const lgPayoffReason = firstTextMatch(text, [
    { re: /whenever you gain life/i, reason: '"whenever you gain life"' },
  ])
  if (lgProviderReason && lgPayoffReason) push("lifegain", "both", `${lgProviderReason}; ${lgPayoffReason}`)
  else if (lgProviderReason) push("lifegain", "provider", lgProviderReason)
  else if (lgPayoffReason) push("lifegain", "payoff", lgPayoffReason)

  // keywordLord
  if (
    /other creatures you control (have|get|gain).{0,50}(flying|trample|lifelink|vigilance|menace|haste|first strike|deathtouch)/i.test(text)
  ) {
    push("keywordLord", "payoff", "grants keyword to other creatures you control")
  }

  // tribal
  if (poolSubtypes.size > 0) {
    const cardSubtypes = getCreatureSubtypes(card)
    const matchedProviderType = cardSubtypes.find((s) => poolSubtypes.has(s))
    const matchedPayoffType = [...poolSubtypes].find((subtype) =>
      new RegExp(`other ${subtype}s?|for each ${subtype}|${subtype}s? you control (get|have|gain)`, "i").test(text),
    )
    const isTribalProvider = Boolean(matchedProviderType)
    const isTribalPayoff = Boolean(matchedPayoffType)
    if (isTribalProvider && isTribalPayoff)
      push("tribal", "both", `${matchedProviderType} creature type; lords/synergizes with ${matchedPayoffType}s`)
    else if (isTribalProvider) push("tribal", "provider", `${matchedProviderType} creature type`)
    else if (isTribalPayoff) push("tribal", "payoff", `lords or synergizes with ${matchedPayoffType}s`)
  }

  // repartee
  const repProviderReason =
    cardIsSpell
      ? firstTextMatch(text, [
          {
            re: /target (a |your |another )?creature.{0,80}(gets? \+[0-9]+\/|gains? (hexproof|indestructible|protection|trample|flying|first strike|double strike|vigilance)|\+[0-9]+\/\+[0-9]+)/i,
            reason: "instant/sorcery that pumps or protects a creature",
          },
        ])
      : null
  const repPayoffReason = firstTextMatch(text, [
    {
      re: /whenever.{0,50}becomes? (the )?target(ed)?.{0,40}spell.{0,40}you control/i,
      reason: '"whenever … becomes the target of a spell you control"',
    },
    {
      re: /whenever you cast a spell that targets? (it\b|this\b)/i,
      reason: '"whenever you cast a spell that targets it"',
    },
  ])
  if (repProviderReason && repPayoffReason) push("repartee", "both", `${repProviderReason}; ${repPayoffReason}`)
  else if (repProviderReason) push("repartee", "provider", repProviderReason)
  else if (repPayoffReason) push("repartee", "payoff", repPayoffReason)

  // expensiveSpells
  const exIsProvider = card.cmc !== undefined && card.cmc >= 5 && !/\bland\b/i.test(card.type_line)
  const exPayoffReason = firstTextMatch(text, [
    {
      re: /whenever you cast a spell with (mana value|converted mana cost) [5-9]/i,
      reason: "triggers when casting spells with MV 5+",
    },
    { re: /\bopus\b/i, reason: '"opus" ability' },
  ])
  if (exIsProvider && exPayoffReason) push("expensiveSpells", "both", `CMC ${card.cmc}; ${exPayoffReason}`)
  else if (exIsProvider) push("expensiveSpells", "provider", `CMC ${card.cmc ?? "?"} (5 or higher)`)
  else if (exPayoffReason) push("expensiveSpells", "payoff", exPayoffReason)

  // converge
  const convPayoffReason =
    firstTextMatch(text, [
      { re: /\bconverge\b/i, reason: "converge keyword" },
      { re: /for each (different )?color of mana spent to cast/i, reason: "scales with colors of mana spent" },
    ]) ??
    firstKeywordMatch(keywords, [{ re: /converge/i, reason: "converge keyword" }])
  if (isFixing && convPayoffReason) push("converge", "both", `mana-fixing land; ${convPayoffReason}`)
  else if (isFixing) push("converge", "provider", "mana-fixing land")
  else if (convPayoffReason) push("converge", "payoff", convPayoffReason)

  return results
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeCard(
  cardName: string,
  ratingIndex: Map<string, RatingIndexEntry>,
  scryfallData: ScryfallDataMap,
  poolSubtypes: Set<string> = new Set(),
): CardAnalysis | null {
  const normalized = normalizeCardName(cardName)
  const entry = ratingIndex.get(normalized)
  if (!entry) return null

  const { card } = entry
  const scryfallCard = scryfallData.get(normalized) ?? null

  const synergyTags =
    scryfallCard
      ? deriveTagsWithReasons(scryfallCard, poolSubtypes, card.role.isFixing)
      : []

  return {
    card,
    scryfallCard,
    roleFlags: buildRoleFlags(card),
    synergyTags,
    scoreBreakdown: buildScoreBreakdown(card),
  }
}
