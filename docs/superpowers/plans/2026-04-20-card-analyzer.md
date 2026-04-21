# Card Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a card analyzer that explains each card's score — role flags, synergy tags with trigger reasons, and a score breakdown — accessible via a standalone search section and by clicking any card name in the deck results.

**Architecture:** A pure `analyzeCard()` function in `src/lib/mtg/analyze.ts` builds a `CardAnalysis` object from rating + Scryfall data; a `CardAnalyzerModal` component renders it; App.tsx wires up the two entry points (search section + clickable card names) to the same shared `analyzedCard` state.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vitest, shadcn-style UI primitives (Badge, Button, Input, Separator, ScrollArea)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/mtg/types.ts` | Modify | Add `RoleFlag`, `SynergyTagAnalysis`, `ScoreAdjustment`, `CardAnalysis` types |
| `src/lib/mtg/analyze.ts` | Create | Pure `analyzeCard()` function — no React, fully testable |
| `src/lib/mtg/index.ts` | Modify | Re-export `analyze.ts` |
| `src/test/analyze.test.ts` | Create | Unit tests for `analyzeCard()` |
| `src/components/CardAnalyzerModal.tsx` | Create | Modal UI component |
| `src/App.tsx` | Modify | State, standalone section, clickable card names, modal render |

---

## Task 1: Add new types to `src/lib/mtg/types.ts`

**Files:**
- Modify: `src/lib/mtg/types.ts`

- [ ] **Step 1: Add the four new types at the end of `types.ts`**

Append after the `SearchConfig` type (currently the last type in the file):

```typescript
export type RoleFlag = {
  label: string
  active: boolean
  explanation: string
}

export type SynergyTagAnalysis = {
  tag: SynergyTag
  role: SynergyRole
  /** The specific keyword name or oracle text fragment that triggered this tag */
  reason: string
}

export type ScoreAdjustment = {
  label: string
  delta: number
}

export type CardAnalysis = {
  card: RatingCard
  /** null when Scryfall data is not loaded */
  scryfallCard: ScryfallCard | null
  roleFlags: RoleFlag[]
  /** Empty array when scryfallCard is null */
  synergyTags: SynergyTagAnalysis[]
  scoreBreakdown: {
    baseRating: number
    /** Only non-zero adjustments are included */
    adjustments: ScoreAdjustment[]
    total: number
  }
}
```

Note: `ScryfallCard` is already imported in files that use these types via `@/lib/mtg/scryfall`. Since `CardAnalysis` references it, files that import `CardAnalysis` will also need `ScryfallCard` available — but because `index.ts` re-exports both `types.ts` and `scryfall.ts`, consumers get both through the barrel.

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mtg/types.ts
git commit -m "feat: add CardAnalysis types (RoleFlag, SynergyTagAnalysis, ScoreAdjustment, CardAnalysis)"
```

---

## Task 2: Create `src/lib/mtg/analyze.ts`

**Files:**
- Create: `src/lib/mtg/analyze.ts`

This is the most complex task. The file contains one exported function (`analyzeCard`) and two private helpers (`buildRoleFlags`, `deriveTagsWithReasons`).

- [ ] **Step 1: Create the file**

```typescript
// src/lib/mtg/analyze.ts
import { normalizeCardName } from "@/lib/mtg/normalize"
import type { ScryfallCard, ScryfallDataMap } from "@/lib/mtg/scryfall"
import type {
  CardAnalysis,
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

function buildRoleFlags(card: import("@/lib/mtg/types").RatingCard): RoleFlag[] {
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

function buildScoreBreakdown(card: import("@/lib/mtg/types").RatingCard): CardAnalysis["scoreBreakdown"] {
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
  const convPayoffReason = firstTextMatch(text, [
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
```

- [ ] **Step 2: Run the type-checker to confirm no errors**

```bash
pnpm build 2>&1 | head -30
```

Expected: no TypeScript errors (may see Vite output; zero `error TS` lines).

- [ ] **Step 3: Commit**

```bash
git add src/lib/mtg/analyze.ts
git commit -m "feat: add analyzeCard() function with role flags, synergy reasons, score breakdown"
```

---

## Task 3: Add tests for `analyzeCard()`

**Files:**
- Create: `src/test/analyze.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
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
      expect(tag!.role).toBe("both") // sorcery = provider, flashback = payoff
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
      expect(tag!.role).toBe("both") // sorcery = spellPayoff provider; cmc 6 = expensiveSpells provider
      expect(tag!.reason).toContain("CMC 6")
    })

    it("returns empty synergyTags when no scryfall data", () => {
      const entry = makeEntry({ normalizedName: "some card" })
      const result = analyzeCard("some card", makeIndex([entry]), new Map())!
      expect(result.synergyTags).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
pnpm vitest run src/test/analyze.test.ts
```

Expected: all tests pass. If any fail, the most likely cause is a type mismatch between `makeScryData` key format and the normalized name used in `analyzeCard` — ensure both use the same normalization (lowercase card name).

- [ ] **Step 3: Run all tests to confirm no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/test/analyze.test.ts
git commit -m "test: add analyzeCard() unit tests"
```

---

## Task 4: Export `analyzeCard` from the barrel

**Files:**
- Modify: `src/lib/mtg/index.ts`

- [ ] **Step 1: Add the export**

In `src/lib/mtg/index.ts`, append after the last existing line:

```typescript
export * from "@/lib/mtg/analyze"
```

The full file should read:

```typescript
export * from "@/lib/mtg/constants"
export * from "@/lib/mtg/engine"
export * from "@/lib/mtg/normalize"
export * from "@/lib/mtg/parser"
export * from "@/lib/mtg/scryfall"
export * from "@/lib/mtg/synergy"
export * from "@/lib/mtg/types"
export * from "@/lib/mtg/analyze"
```

- [ ] **Step 2: Confirm build is clean**

```bash
pnpm build 2>&1 | grep "error TS"
```

Expected: no output (zero TypeScript errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/mtg/index.ts
git commit -m "feat: export analyzeCard from mtg barrel"
```

---

## Task 5: Create `CardAnalyzerModal` component

**Files:**
- Create: `src/components/CardAnalyzerModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/CardAnalyzerModal.tsx
import { useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { analyzeCard } from "@/lib/mtg/analyze"
import type { RatingIndexEntry, SynergyRole, SynergyTag } from "@/lib/mtg/types"
import type { ScryfallDataMap } from "@/lib/mtg/scryfall"

const SYNERGY_TAG_LABELS: Record<SynergyTag, string> = {
  tribal: "Tribal",
  spellPayoff: "Spell payoff",
  keywordLord: "Keyword lord",
  graveyard: "Graveyard",
  counters: "+1/+1 counters",
  tokens: "Tokens",
  sacrifice: "Sacrifice",
  lifegain: "Life gain",
  repartee: "Repartee",
  expensiveSpells: "Expensive spells",
  converge: "Converge",
}

const ROLE_BADGE_COLORS: Record<SynergyRole, string> = {
  provider: "bg-sky-100 text-sky-800",
  payoff: "bg-emerald-100 text-emerald-800",
  both: "bg-violet-100 text-violet-800",
}

type Props = {
  cardName: string
  ratingIndex: Map<string, RatingIndexEntry>
  scryfallData: ScryfallDataMap
  poolSubtypes: Set<string>
  onClose: () => void
}

export function CardAnalyzerModal({ cardName, ratingIndex, scryfallData, poolSubtypes, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const analysis = analyzeCard(cardName, ratingIndex, scryfallData, poolSubtypes)

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal — stopPropagation prevents backdrop click from firing when clicking inside */}
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {analysis === null ? (
          // Not found state
          <div className="flex flex-col gap-3 p-6">
            <div className="flex items-start justify-between">
              <p className="font-semibold text-stone-800">Card not found</p>
              <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              "{cardName}" was not found in the loaded rating files. Check the spelling or load the correct rating set.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-stone-900">{analysis.card.displayName}</h2>
                <p className="mt-0.5 text-sm text-stone-500">
                  {analysis.card.type} · {analysis.card.rarity} · CMC {analysis.card.cmc}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-lg bg-amber-100 px-3 py-1 text-base font-bold text-amber-800">
                  {analysis.card.rating.toFixed(1)}
                </span>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-stone-400" onClick={onClose}>
                  ✕
                </Button>
              </div>
            </div>

            {/* Scrollable body */}
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-5 px-6 py-5">

                {/* Oracle text — only when scryfall data loaded */}
                {analysis.scryfallCard && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">Oracle text</p>
                    <p className="text-sm italic leading-relaxed text-stone-600">
                      {analysis.scryfallCard.card_faces
                        ? analysis.scryfallCard.card_faces.map((f) => f.oracle_text).join("\n\n")
                        : (analysis.scryfallCard.oracle_text ?? "")}
                    </p>
                  </div>
                )}

                {/* Synergy tags — only when scryfall data loaded */}
                {analysis.scryfallCard && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Synergy tags</p>
                    {analysis.synergyTags.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No synergy tags detected.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {analysis.synergyTags.map((t, i) => (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                {SYNERGY_TAG_LABELS[t.tag]}
                              </span>
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_COLORS[t.role]}`}>
                                {t.role}
                              </span>
                            </div>
                            <p className="pl-1 text-xs text-stone-500">↳ {t.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Separator />

                {/* Score breakdown — always shown */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Score breakdown</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-600">Base rating</span>
                      <span className="font-semibold text-stone-800">{analysis.scoreBreakdown.baseRating.toFixed(2)}</span>
                    </div>
                    {analysis.scoreBreakdown.adjustments.map((adj, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-stone-500">{adj.label}</span>
                        <span className={adj.delta >= 0 ? "text-emerald-600" : "text-red-500"}>
                          {adj.delta >= 0 ? "+" : ""}{adj.delta.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span className="text-stone-800">Adjusted score</span>
                      <span className="text-stone-900">{analysis.scoreBreakdown.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Role flags — always shown */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Role flags</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.roleFlags.map((flag) => (
                      <span
                        key={flag.label}
                        title={flag.explanation}
                        className={
                          flag.active
                            ? "rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800"
                            : "rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-400 line-through"
                        }
                      >
                        {flag.label}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm build is clean**

```bash
pnpm build 2>&1 | grep "error TS"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/CardAnalyzerModal.tsx
git commit -m "feat: add CardAnalyzerModal component"
```

---

## Task 6: Wire up App.tsx

**Files:**
- Modify: `src/App.tsx`

### Step 1: Add the import

- [ ] At the top of App.tsx, add to the existing `@/lib/mtg` import the new exports needed, and import the modal:

In the existing import on the line that starts with `import { COLOR_NAMES, batchFetchCards, ...` add `analyzeCard, extractPoolSubtypes` and the new types `type CardAnalysis`:

```typescript
import { COLOR_NAMES, analyzeCard, batchFetchCards, describeManaBase, evaluateSealedPool, extractPoolSubtypes, mergeRatingFiles, parsePoolText, parseRatingFileContent, type RankedDeckResult, type RatingFileParseResult, type ScryfallDataMap, type SynergyTag } from "@/lib/mtg"
import { CardAnalyzerModal } from "@/components/CardAnalyzerModal"
```

Also add `SearchIcon` to the lucide-react import:

```typescript
import {
  CheckCircle2Icon,
  CopyIcon,
  DatabaseIcon,
  FileCode2Icon,
  InfoIcon,
  LayersIcon,
  Layers3Icon,
  LoaderCircleIcon,
  SearchIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react"
```

### Step 2: Add new state and memos

- [ ] Inside the `App` function, after the existing `useState` declarations, add:

```typescript
const [analyzedCard, setAnalyzedCard] = useState<string | null>(null)
const [analyzerSearch, setAnalyzerSearch] = useState("")

const poolSubtypes = useMemo(() => extractPoolSubtypes(scryfallData), [scryfallData])

const analyzerChips = useMemo(() => {
  const chips: string[] = []
  for (const entry of parsedPool) {
    const found = entry.normalizedAliases.some((a) => mergedRatings.index.has(a))
    if (found) chips.push(entry.inputName)
    if (chips.length >= 8) break
  }
  return chips
}, [parsedPool, mergedRatings.index])
```

### Step 3: Add the Card Analyzer section

- [ ] In the JSX, inside the left column `<div className="grid gap-6">` (after the closing `</Card>` tag of the Ratings Input card, before the closing `</div>` of the left column), add:

```tsx
{totalRatedCards > 0 && (
  <Card className="border-stone-200/80 bg-white/90 shadow-lg shadow-stone-400/10 backdrop-blur">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <SearchIcon />
        Card Analyzer
      </CardTitle>
      <CardDescription>
        Look up any card from the loaded rating set to see its score breakdown and synergy tags.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search card name…"
          value={analyzerSearch}
          onChange={(e) => setAnalyzerSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && analyzerSearch.trim()) {
              setAnalyzedCard(analyzerSearch.trim())
              setAnalyzerSearch("")
            }
          }}
          className="flex-1 bg-stone-50"
        />
        <Button
          variant="outline"
          disabled={!analyzerSearch.trim()}
          onClick={() => {
            setAnalyzedCard(analyzerSearch.trim())
            setAnalyzerSearch("")
          }}
        >
          Analyze
        </Button>
      </div>
      {analyzerChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {analyzerChips.map((name) => (
            <button
              key={name}
              className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 hover:bg-stone-200 transition-colors"
              onClick={() => setAnalyzedCard(name)}
            >
              {name}
            </button>
          ))}
          {parsedPool.filter((e) => e.normalizedAliases.some((a) => mergedRatings.index.has(a))).length > 8 && (
            <span className="rounded-full bg-stone-50 px-2.5 py-0.5 text-xs text-stone-400">
              +{parsedPool.filter((e) => e.normalizedAliases.some((a) => mergedRatings.index.has(a))).length - 8} more
            </span>
          )}
        </div>
      )}
    </CardContent>
  </Card>
)}
```

### Step 4: Make card names clickable in deck list

- [ ] In the deck list table body (around line 644–654 in the original file), find:

```tsx
<TableCell className="font-medium">
  {entry.card.displayName}
</TableCell>
```

Replace with:

```tsx
<TableCell className="font-medium">
  <button
    className="text-left underline decoration-dotted underline-offset-2 hover:text-stone-600 transition-colors"
    onClick={() => setAnalyzedCard(entry.card.displayName)}
  >
    {entry.card.displayName}
  </button>
</TableCell>
```

### Step 5: Render the modal

- [ ] Before the closing `</div>` of the outermost `<main>` element (end of the JSX return), add:

```tsx
{analyzedCard && (
  <CardAnalyzerModal
    cardName={analyzedCard}
    ratingIndex={mergedRatings.index}
    scryfallData={scryfallData}
    poolSubtypes={poolSubtypes}
    onClose={() => setAnalyzedCard(null)}
  />
)}
```

- [ ] **Step 6: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Build to confirm no type errors**

```bash
pnpm build 2>&1 | grep "error TS"
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire up card analyzer — standalone search, clickable deck cards, modal"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Modal sections: oracle text, synergy tags with reasons, score breakdown, role flags
- ✅ Oracle text hidden when no Scryfall data
- ✅ Synergy tags hidden when no Scryfall data
- ✅ Score breakdown always shown
- ✅ Role flags always shown (active highlighted, inactive struck-through)
- ✅ Backdrop click closes modal
- ✅ Escape key closes modal
- ✅ "Card not found" state
- ✅ Standalone search section (hidden when no ratings loaded)
- ✅ Quick-pick chips from pool (up to 8)
- ✅ Clickable card names in deck list
- ✅ `poolSubtypes` derived via `useMemo` and passed to modal
- ✅ No modifications to `synergy.ts`
- ✅ `analyzeCard` exported from barrel

**Type consistency check:**
- `analyzeCard()` signature in Task 2 matches usage in `CardAnalyzerModal` (Task 5) and App.tsx (Task 6) ✅
- `CardAnalysis` fields (`roleFlags`, `synergyTags`, `scoreBreakdown`) accessed consistently across Tasks 2, 3, 5 ✅
- `SynergyTagAnalysis.tag` is `SynergyTag`, used with `SYNERGY_TAG_LABELS` in Task 5 ✅

**No placeholders:** All code blocks are complete. ✅
