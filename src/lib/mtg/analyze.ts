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

function buildRoleFlags(card: RatingCard): RoleFlag[] {
  const { role } = card
  return [
    {
      label: "Cheap creature",
      active: role.isCheapCreature,
      explanation: "Creature with CMC <= 3. Scores +0.15.",
    },
    {
      label: "Expensive finisher",
      active: role.isExpensiveFinisher,
      explanation: "Creature with CMC >= 5.",
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
      explanation: "Non-land with no colored pips; castable in any deck. Scores +0.08.",
    },
    {
      label: "Conditional",
      active: role.isConditionalCard,
      explanation: "High effective pip pressure, CMC >= 6, or X cost. Penalized -0.08.",
    },
    {
      label: "Instant-like",
      active: card.isInstantLike,
      explanation: "Can be cast at instant speed.",
    },
  ]
}

function buildScoreBreakdown(card: RatingCard): CardAnalysis["scoreBreakdown"] {
  const { role } = card
  const adjustments: ScoreAdjustment[] = []

  if (role.isCheapCreature) {
    adjustments.push({ label: "Cheap creature (CMC <= 3)", delta: 0.15 })
  }
  if (role.isInteraction) {
    adjustments.push({ label: "Interaction", delta: 0.20 })
  }
  if (role.isColorlessPlayable) {
    adjustments.push({ label: "Colorless playable", delta: 0.08 })
  }

  const pipPenalty = Math.max(0, role.maxSingleColorPip - 1) * 0.18
  if (pipPenalty > 0) {
    const formattedPipPressure =
      Number.isInteger(role.maxSingleColorPip)
        ? String(role.maxSingleColorPip)
        : role.maxSingleColorPip.toFixed(1)
    adjustments.push({
      label: `Effective pip pressure penalty (${formattedPipPressure} max pip)`,
      delta: -pipPenalty,
    })
  }

  if (role.isConditionalCard) {
    adjustments.push({ label: "Conditional card", delta: -0.08 })
  }

  const total = Number(
    (card.rating + adjustments.reduce((sum, adjustment) => sum + adjustment.delta, 0)).toFixed(2),
  )

  return {
    baseRating: card.rating,
    adjustments: adjustments.map((adjustment) => ({
      label: adjustment.label,
      delta: Number(adjustment.delta.toFixed(2)),
    })),
    total,
  }
}

function resolveCardLookup(
  cardName: string,
  ratingIndex: Map<string, RatingIndexEntry>,
  scryfallData: ScryfallDataMap,
): { entry: RatingIndexEntry; scryfallCard: CardAnalysis["scryfallCard"] } | null {
  const normalized = normalizeCardName(cardName)
  const directEntry = ratingIndex.get(normalized)
  const directScryfall = scryfallData.get(normalized) ?? null

  if (directEntry) {
    const scryfallCard =
      directScryfall ??
      directEntry.card.normalizedAliases
        .map((alias) => scryfallData.get(alias))
        .find((card): card is NonNullable<CardAnalysis["scryfallCard"]> => Boolean(card)) ??
      null

    return { entry: directEntry, scryfallCard }
  }

  if (!directScryfall) {
    return null
  }

  const candidateNames = [
    directScryfall.name,
    ...(directScryfall.card_faces?.map((face) => face.name) ?? []),
  ]
  const entry = candidateNames
    .map((name) => ratingIndex.get(normalizeCardName(name)))
    .find((candidate): candidate is RatingIndexEntry => Boolean(candidate))

  return entry ? { entry, scryfallCard: directScryfall } : null
}

export function analyzeCard(
  cardName: string,
  ratingIndex: Map<string, RatingIndexEntry>,
  scryfallData: ScryfallDataMap,
  poolSubtypes: Set<string> = new Set(),
): CardAnalysis | null {
  const resolved = resolveCardLookup(cardName, ratingIndex, scryfallData)
  if (!resolved) return null

  const { entry, scryfallCard } = resolved
  const { card } = entry

  const synergyTags = scryfallCard
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
