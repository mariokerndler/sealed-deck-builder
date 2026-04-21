// src/lib/mtg/analyze.ts
import { normalizeCardName } from "@/lib/mtg/normalize"
import type { ScryfallDataMap } from "@/lib/mtg/scryfall"
import { deriveCardSynergyTagAnalysis } from "@/lib/mtg/synergy"
import type {
  CardAnalysis,
  RatingCard,
  RatingIndexEntry,
  RoleFlag,
  ScoreAdjustment,
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
      ? deriveCardSynergyTagAnalysis(scryfallCard, poolSubtypes, card.role.isFixing)
      : []

  return {
    card,
    scryfallCard,
    roleFlags: buildRoleFlags(card),
    synergyTags,
    scoreBreakdown: buildScoreBreakdown(card),
  }
}
