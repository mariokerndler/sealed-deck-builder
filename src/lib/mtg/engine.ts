import {
  BASIC_LAND_NAMES,
  COLOR_NAMES,
  DEFAULT_SEARCH_CONFIG,
  EMPTY_COLOR_COUNTS,
} from "@/lib/mtg/constants"
import type {
  ColorCountMap,
  ColorSymbol,
  DeckCard,
  DeckColorIdentity,
  DeckMetrics,
  MissingPoolCard,
  PoolCard,
  PoolEntry,
  RankedDeckResult,
  RatingCard,
  RatingIndexEntry,
  RatingMergeResult,
  ScoreBreakdown,
  SearchConfig,
} from "@/lib/mtg/types"
import { COLOR_SYMBOLS } from "@/lib/mtg/types"

type CandidateConfig = DeckColorIdentity

type CandidateEvaluation = {
  candidate: CandidateConfig
  poolStrength: number
  playableCards: PoolCard[]
  fixingCount: number
}

type VariantProfile = {
  key: "aggressive" | "balanced" | "greedy"
  label: string
  preferredCheapPlays: number
  preferredCreatures: number
  preferredInteraction: number
  preferredTopEnd: number
  topEndPenaltyScale: number
}

type ResolvedPool = {
  poolCards: PoolCard[]
  missingCards: MissingPoolCard[]
}

type ManaRequirements = {
  sources: ColorCountMap
  earlyPressure: ColorCountMap
}

const VARIANT_PROFILES: VariantProfile[] = [
  {
    key: "balanced",
    label: "balanced",
    preferredCheapPlays: 7,
    preferredCreatures: 15,
    preferredInteraction: 5,
    preferredTopEnd: 4,
    topEndPenaltyScale: 1,
  },
  {
    key: "aggressive",
    label: "lean",
    preferredCheapPlays: 9,
    preferredCreatures: 16,
    preferredInteraction: 4,
    preferredTopEnd: 3,
    topEndPenaltyScale: 1.25,
  },
  {
    key: "greedy",
    label: "top-end",
    preferredCheapPlays: 6,
    preferredCreatures: 14,
    preferredInteraction: 5,
    preferredTopEnd: 5,
    topEndPenaltyScale: 0.8,
  },
]

function getCardColors(card: RatingCard): ColorSymbol[] {
  return COLOR_SYMBOLS.filter((symbol) => card.rawColors[symbol] > 0)
}

function flattenDeck(mainDeck: DeckCard[]): RatingCard[] {
  return mainDeck.flatMap((entry) =>
    Array.from({ length: entry.quantity }, () => entry.card),
  )
}

function resolvePool(pool: PoolEntry[], ratings: RatingMergeResult): ResolvedPool {
  const poolCards: PoolCard[] = []
  const missingCards: MissingPoolCard[] = []

  for (const entry of pool) {
    const match = entry.normalizedAliases
      .map((alias) => ratings.index.get(alias))
      .find(Boolean) as RatingIndexEntry | undefined

    if (!match) {
      missingCards.push({
        quantity: entry.quantity,
        inputName: entry.inputName,
        normalizedName: entry.normalizedName,
      })
      continue
    }

    poolCards.push({
      quantity: entry.quantity,
      ratingCard: match.card,
    })
  }

  return { poolCards, missingCards }
}

function getAllCandidateConfigs(config: SearchConfig): CandidateConfig[] {
  const candidates: CandidateConfig[] = []

  if (config.includeMonoColor) {
    for (const color of COLOR_SYMBOLS) {
      candidates.push({ base: [color] })
    }
  }

  for (let i = 0; i < COLOR_SYMBOLS.length; i += 1) {
    for (let j = i + 1; j < COLOR_SYMBOLS.length; j += 1) {
      candidates.push({ base: [COLOR_SYMBOLS[i], COLOR_SYMBOLS[j]] })
    }
  }

  if (config.allowSplash) {
    const baseCandidates = [...candidates]
    for (const candidate of baseCandidates) {
      for (const color of COLOR_SYMBOLS) {
        if (candidate.base.includes(color)) {
          continue
        }

        candidates.push({ ...candidate, splash: color })
      }
    }
  }

  return candidates
}

function getFixingValue(card: RatingCard, candidate: CandidateConfig): number {
  if (!card.role.isFixing || card.isLand) {
    return 0
  }
  return candidate.splash ? 1 : 0
}

function isCandidatePlayable(
  card: RatingCard,
  candidate: CandidateConfig,
  fixingCount: number,
): boolean {
  if (card.isLand) {
    return false
  }

  const colors = getCardColors(card)

  if (colors.length === 0) {
    return card.role.isColorlessPlayable
  }

  const baseColors = new Set(candidate.base)
  const splash = candidate.splash

  if (!colors.every((color) => baseColors.has(color) || color === splash)) {
    return false
  }

  if (!splash || !colors.includes(splash)) {
    return true
  }

  const splashPips = card.rawColors[splash]
  if (splashPips > 1) {
    return false
  }

  if (card.role.maxSingleColorPip >= 2) {
    return false
  }

  if (card.cmc <= 2 && fixingCount < 2 && card.rating < 3.1) {
    return false
  }

  return card.rating >= 2.9 || (card.rating >= 2.7 && fixingCount > 0)
}

function scorePoolCardForCandidate(card: RatingCard, candidate: CandidateConfig): number {
  const colors = getCardColors(card)
  const isSplashCard = Boolean(candidate.splash && colors.includes(candidate.splash))

  let score = card.rating
  score += card.role.isCheapCreature ? 0.15 : 0
  score += card.role.isInteraction ? 0.2 : 0
  score += card.role.isColorlessPlayable ? 0.08 : 0
  score -= Math.max(0, card.role.maxSingleColorPip - 1) * 0.18
  score -= card.role.isConditionalCard ? 0.08 : 0

  if (isSplashCard) {
    score -= 0.4
  }

  if (candidate.base.length === 1 && colors.length > 1) {
    score -= 0.5
  }

  return score
}

function rankCandidateConfigs(
  poolCards: PoolCard[],
  config: SearchConfig,
): CandidateEvaluation[] {
  const candidates = getAllCandidateConfigs(config)

  const evaluated = candidates.map((candidate) => {
    const fixingCount = poolCards.reduce(
      (sum, poolCard) => sum + getFixingValue(poolCard.ratingCard, candidate) * poolCard.quantity,
      0,
    )

    const playableCards = poolCards.filter((poolCard) =>
      isCandidatePlayable(poolCard.ratingCard, candidate, fixingCount),
    )

    const allScores = playableCards.flatMap((poolCard) =>
      Array.from({ length: poolCard.quantity }, () =>
        scorePoolCardForCandidate(poolCard.ratingCard, candidate),
      ),
    )
    const sortedScores = [...allScores].sort((a, b) => b - a)
    const topCardQuality = sortedScores.slice(0, 12).reduce((sum, score) => sum + score, 0)
    const creatureDepth = playableCards.reduce(
      (sum, poolCard) =>
        sum + (poolCard.ratingCard.isCreature ? poolCard.quantity : 0),
      0,
    )
    const interactionDepth = playableCards.reduce(
      (sum, poolCard) =>
        sum + (poolCard.ratingCard.role.isInteraction ? poolCard.quantity : 0),
      0,
    )
    const playableDepth = playableCards.reduce((sum, poolCard) => sum + poolCard.quantity, 0)

    let poolStrength =
      topCardQuality +
      playableDepth * 0.35 +
      creatureDepth * 0.5 +
      interactionDepth * 0.45 +
      fixingCount * 0.35

    if (candidate.base.length === 1) {
      poolStrength -= 2.2
      if (playableDepth >= 26) {
        poolStrength += 2.4
      }
    }

    if (candidate.splash) {
      const splashCards = playableCards.filter((poolCard) =>
        getCardColors(poolCard.ratingCard).includes(candidate.splash as ColorSymbol),
      )

      const splashPips = splashCards.reduce(
        (sum, poolCard) =>
          sum + poolCard.ratingCard.rawColors[candidate.splash as ColorSymbol] * poolCard.quantity,
        0,
      )

      poolStrength -= 1.1
      poolStrength -= Math.max(0, splashCards.length - 2) * 0.5
      poolStrength -= Math.max(0, splashPips - 2) * 0.35
      poolStrength += fixingCount * 0.9
    }

    return {
      candidate,
      poolStrength,
      playableCards,
      fixingCount,
    }
  })

  return evaluated
    .filter((entry) => entry.playableCards.reduce((sum, card) => sum + card.quantity, 0) >= 18)
    .sort((a, b) => b.poolStrength - a.poolStrength)
    .slice(0, config.candidateLimit)
}

function getBaseCardScore(
  card: RatingCard,
  candidate: CandidateConfig,
  profile: VariantProfile,
  copyIndex: number,
): number {
  const colors = getCardColors(card)
  const isSplashCard = Boolean(candidate.splash && colors.includes(candidate.splash))
  let score = scorePoolCardForCandidate(card, candidate)

  if (card.isCreature) {
    score += 0.2
  }

  if (card.role.isCheapCreature) {
    score += profile.key === "aggressive" ? 0.35 : 0.15
  }

  if (card.role.isInteraction) {
    score += profile.key === "balanced" ? 0.18 : 0.08
  }

  if (card.role.isExpensiveFinisher) {
    score += profile.key === "greedy" ? 0.22 : -0.12 * profile.topEndPenaltyScale
  }

  if (card.role.isConditionalCard) {
    score -= 0.12
  }

  if (card.cmc >= 5) {
    score -= 0.08 * profile.topEndPenaltyScale
  }

  if (card.role.maxSingleColorPip >= 2 && card.cmc <= 3) {
    score -= 0.24
  }

  if (isSplashCard) {
    score -= 0.18
  }

  if (copyIndex >= 1 && (card.role.isConditionalCard || card.cmc >= 5)) {
    score -= copyIndex * 0.72
  } else if (copyIndex >= 2) {
    score -= copyIndex * 0.18
  }

  return score
}

function buildBaselineDeck(
  candidateEvaluation: CandidateEvaluation,
  profile: VariantProfile,
  config: SearchConfig,
): DeckCard[] {
  const candidates = candidateEvaluation.playableCards.flatMap((poolCard) =>
    Array.from({ length: poolCard.quantity }, (_, copyIndex) => ({
      card: poolCard.ratingCard,
      quantity: 1,
      adjustedScore: getBaseCardScore(
        poolCard.ratingCard,
        candidateEvaluation.candidate,
        profile,
        copyIndex,
      ),
      notes: [`Built from ${profile.label} profile.`],
    })),
  )

  candidates.sort((a, b) => b.adjustedScore - a.adjustedScore)

  const selection = candidates.slice(0, config.spellSlots)
  const merged = new Map<string, DeckCard>()

  for (const entry of selection) {
    const existing = merged.get(entry.card.normalizedName)

    if (!existing) {
      merged.set(entry.card.normalizedName, { ...entry })
      continue
    }

    existing.quantity += 1
    existing.adjustedScore += entry.adjustedScore
  }

  return normalizeDeckSize(
    [...merged.values()],
    candidateEvaluation,
    profile,
    config.spellSlots,
  )
}

function cardMetricContribution(card: RatingCard): Partial<DeckMetrics> {
  return {
    creatureCount: card.isCreature ? 1 : 0,
    nonCreatureCount: card.isCreature ? 0 : 1,
    interactionCount: card.role.isInteraction ? 1 : 0,
    cheapPlays: card.cmc <= 2 ? 1 : 0,
    expensiveSpells: card.cmc >= 5 ? 1 : 0,
    earlyBoardPresence: card.role.isCheapCreature ? 1 : 0,
  }
}

function getManaRequirements(
  mainDeck: DeckCard[],
  colors: DeckColorIdentity,
): ManaRequirements {
  const sources = EMPTY_COLOR_COUNTS()
  const earlyPressure = EMPTY_COLOR_COUNTS()

  for (const entry of mainDeck) {
    for (const color of COLOR_SYMBOLS) {
      const pips = entry.card.rawColors[color]
      if (pips === 0) {
        continue
      }

      const multiplier = colors.splash === color ? 0.8 : 1
      sources[color] +=
        entry.quantity *
        (pips * 1.6 +
          (entry.card.cmc <= 2 ? 1.2 : entry.card.cmc <= 4 ? 0.7 : 0.2)) *
        multiplier

      if (entry.card.cmc <= 3) {
        earlyPressure[color] += entry.quantity * (1 + pips * 0.5)
      }
    }
  }

  return { sources, earlyPressure }
}

function getDeckMetrics(
  mainDeck: DeckCard[],
  colors: DeckColorIdentity,
  basicLands: ColorCountMap,
): DeckMetrics {
  const flattened = flattenDeck(mainDeck)
  const count = flattened.length
  const averageCmc =
    count === 0 ? 0 : flattened.reduce((sum, card) => sum + card.cmc, 0) / count

  const totals = flattened.reduce(
    (acc, card) => {
      const contribution = cardMetricContribution(card)
      acc.creatureCount += contribution.creatureCount ?? 0
      acc.nonCreatureCount += contribution.nonCreatureCount ?? 0
      acc.interactionCount += contribution.interactionCount ?? 0
      acc.cheapPlays += contribution.cheapPlays ?? 0
      acc.expensiveSpells += contribution.expensiveSpells ?? 0
      acc.earlyBoardPresence += contribution.earlyBoardPresence ?? 0
      return acc
    },
    {
      creatureCount: 0,
      nonCreatureCount: 0,
      interactionCount: 0,
      cheapPlays: 0,
      expensiveSpells: 0,
      earlyBoardPresence: 0,
    },
  )

  const requirements = getManaRequirements(mainDeck, colors)

  const manaSourceSufficiency = COLOR_SYMBOLS.reduce((sum, color) => {
    if (requirements.sources[color] <= 0) {
      return sum + 1
    }

    const desired =
      Math.max(1, Math.ceil(requirements.sources[color] / 4.2)) +
      (requirements.earlyPressure[color] >= 3 ? 1 : 0)
    return sum + Math.min(1, basicLands[color] / desired)
  }, 0)

  const splashStrain = colors.splash
    ? flattened.reduce((sum, card) => {
        const splash = colors.splash as ColorSymbol
        if (!getCardColors(card).includes(splash)) {
          return sum
        }

        return sum + card.rawColors[splash] + (card.cmc <= 3 ? 1.2 : 0.4)
      }, 0)
    : 0

  const topEndLoad = totals.expensiveSpells / Math.max(1, count)
  const nonCreatureSaturation = totals.nonCreatureCount / Math.max(1, count)
  const removalDensity = totals.interactionCount / Math.max(1, count)
  const manaStability = Math.max(
    0,
    manaSourceSufficiency * 4 -
      flattened.reduce(
        (sum, card) => sum + Math.max(0, card.role.maxSingleColorPip - 1) * 0.35,
        0,
      ) -
      splashStrain * 0.18,
  )

  const curveScore =
    4 +
    Math.min(totals.cheapPlays, 8) * 0.42 +
    Math.min(totals.earlyBoardPresence, 6) * 0.28 -
    Math.max(0, totals.expensiveSpells - 4) * 0.55

  return {
    creatureCount: totals.creatureCount,
    nonCreatureCount: totals.nonCreatureCount,
    interactionCount: totals.interactionCount,
    cheapPlays: totals.cheapPlays,
    expensiveSpells: totals.expensiveSpells,
    averageCmc,
    manaStability,
    curveScore,
    earlyBoardPresence: totals.earlyBoardPresence,
    removalDensity,
    splashStrain,
    manaSourceSufficiency,
    topEndLoad,
    nonCreatureSaturation,
  }
}

function suggestLandCount(metrics: DeckMetrics, profile: VariantProfile, config: SearchConfig): number {
  let lands = config.defaultLands

  if (metrics.averageCmc >= 3.8 || metrics.expensiveSpells >= profile.preferredTopEnd + 1) {
    lands += 1
  }

  if (profile.key === "aggressive" && metrics.cheapPlays >= 9 && metrics.averageCmc <= 2.6) {
    lands -= 1
  }

  return Math.min(18, Math.max(16, lands))
}

function suggestBasicLands(
  mainDeck: DeckCard[],
  colors: DeckColorIdentity,
  landCount: number,
): ColorCountMap {
  const basics = EMPTY_COLOR_COUNTS()
  const requirements = getManaRequirements(mainDeck, colors)
  const activeColors = COLOR_SYMBOLS.filter((color) => requirements.sources[color] > 0)

  if (activeColors.length === 0) {
    return basics
  }

  const desiredSources = EMPTY_COLOR_COUNTS()
  for (const color of activeColors) {
    desiredSources[color] =
      Math.max(1, Math.ceil(requirements.sources[color] / 4.2)) +
      (requirements.earlyPressure[color] >= 3 ? 1 : 0)

    if (colors.splash === color) {
      desiredSources[color] = Math.max(1, desiredSources[color] - 1)
    }
  }

  const totalDesired = activeColors.reduce((sum, color) => sum + desiredSources[color], 0)
  const remainingBasics = landCount

  for (const color of activeColors) {
    const adjustedDesired = Math.max(0.4, desiredSources[color])
    basics[color] = Math.max(
      remainingBasics > 0 ? 1 : 0,
      Math.round((adjustedDesired / Math.max(1, totalDesired)) * remainingBasics),
    )
  }

  while (COLOR_SYMBOLS.reduce((sum, color) => sum + basics[color], 0) > remainingBasics) {
    const donor = [...activeColors]
      .sort((a, b) => basics[b] - basics[a])
      .find((color) => basics[color] > 1)

    if (!donor) {
      break
    }

    basics[donor] -= 1
  }

  while (COLOR_SYMBOLS.reduce((sum, color) => sum + basics[color], 0) < remainingBasics) {
    const recipient = [...activeColors].sort(
      (a, b) => desiredSources[b] - desiredSources[a],
    )[0]
    basics[recipient] += 1
  }

  if (colors.splash && basics[colors.splash] === 0) {
    const donor = [...colors.base].sort((a, b) => basics[b] - basics[a])[0]
    if (basics[donor] > 1) {
      basics[donor] -= 1
      basics[colors.splash] = 1
    }
  }

  return basics
}

function scoreDeckShape(metrics: DeckMetrics, profile: VariantProfile): number {
  let shape = 0
  shape += 2.8 - Math.abs(metrics.creatureCount - profile.preferredCreatures) * 0.42
  shape += 2.2 - Math.abs(metrics.cheapPlays - profile.preferredCheapPlays) * 0.35
  shape += 1.5 - Math.abs(metrics.interactionCount - profile.preferredInteraction) * 0.28
  shape -= Math.max(0, metrics.expensiveSpells - profile.preferredTopEnd) * 0.55
  shape -= Math.max(0, metrics.nonCreatureSaturation - 0.48) * 4
  return shape
}

function evaluateDeckScore(
  mainDeck: DeckCard[],
  candidateEvaluation: CandidateEvaluation,
  profile: VariantProfile,
  basicLands: ColorCountMap,
): { total: number; metrics: DeckMetrics; breakdown: ScoreBreakdown } {
  const metrics = getDeckMetrics(mainDeck, candidateEvaluation.candidate, basicLands)
  const flattened = flattenDeck(mainDeck)

  const cardQuality = mainDeck.reduce((sum, card) => sum + card.adjustedScore, 0)
  const manaConsistency = metrics.manaStability * 2.4 + metrics.manaSourceSufficiency * 3.2
  const earlyGameStability = metrics.curveScore + metrics.earlyBoardPresence * 0.7
  const creatureStructure = metrics.creatureCount * 0.35 - metrics.nonCreatureSaturation * 2.5
  const interactionQuality = metrics.interactionCount * 0.9 + metrics.removalDensity * 5
  const topEndBurden = -metrics.topEndLoad * 9 - Math.max(0, metrics.expensiveSpells - 4) * 0.6
  const colorDepthResilience =
    candidateEvaluation.poolStrength * 0.12 -
    (candidateEvaluation.candidate.splash ? metrics.splashStrain * 0.5 : 0)
  const deckCoherence = scoreDeckShape(metrics, profile)

  let penalties = 0
  if (metrics.creatureCount < 12) penalties += (12 - metrics.creatureCount) * 1.5
  if (metrics.cheapPlays < 5) penalties += (5 - metrics.cheapPlays) * 1.2
  if (metrics.expensiveSpells > 5) penalties += (metrics.expensiveSpells - 5) * 0.9
  penalties += flattened.reduce(
    (sum, card) => sum + (card.role.maxSingleColorPip >= 2 && card.cmc <= 3 ? 0.4 : 0),
    0,
  )
  penalties += metrics.splashStrain * 0.3

  const total =
    cardQuality +
    manaConsistency +
    earlyGameStability +
    creatureStructure +
    interactionQuality +
    topEndBurden +
    colorDepthResilience +
    deckCoherence -
    penalties

  return {
    total: Number(total.toFixed(2)),
    metrics,
    breakdown: {
      cardQuality: Number(cardQuality.toFixed(2)),
      manaConsistency: Number(manaConsistency.toFixed(2)),
      earlyGameStability: Number(earlyGameStability.toFixed(2)),
      creatureStructure: Number(creatureStructure.toFixed(2)),
      interactionQuality: Number(interactionQuality.toFixed(2)),
      topEndBurden: Number(topEndBurden.toFixed(2)),
      colorDepthResilience: Number(colorDepthResilience.toFixed(2)),
      deckCoherence: Number(deckCoherence.toFixed(2)),
      penalties: Number(penalties.toFixed(2)),
      total: Number(total.toFixed(2)),
    },
  }
}

function countDeckCards(deck: DeckCard[]): number {
  return deck.reduce((sum, entry) => sum + entry.quantity, 0)
}

function getPoolQuantityMap(poolCards: PoolCard[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const poolCard of poolCards) {
    counts.set(
      poolCard.ratingCard.normalizedName,
      (counts.get(poolCard.ratingCard.normalizedName) ?? 0) + poolCard.quantity,
    )
  }

  return counts
}

function addDeckCopy(
  deckMap: Map<string, DeckCard>,
  card: RatingCard,
  candidate: CandidateConfig,
  profile: VariantProfile,
): void {
  const existing = deckMap.get(card.normalizedName)
  const copyIndex = existing?.quantity ?? 0
  const score = getBaseCardScore(card, candidate, profile, copyIndex)

  if (!existing) {
    deckMap.set(card.normalizedName, {
      card,
      quantity: 1,
      adjustedScore: score,
      notes: [`Normalized with ${profile.label} sizing.`],
    })
    return
  }

  existing.quantity += 1
  existing.adjustedScore += score
}

function removeWeakestDeckCopy(deckMap: Map<string, DeckCard>): void {
  const removable = [...deckMap.values()]
    .filter((entry) => entry.quantity > 0)
    .sort(
      (a, b) =>
        a.adjustedScore / Math.max(1, a.quantity) -
        b.adjustedScore / Math.max(1, b.quantity),
    )[0]

  if (!removable) {
    return
  }

  removable.quantity -= 1
  removable.adjustedScore -= removable.adjustedScore / Math.max(1, removable.quantity + 1)
  if (removable.quantity <= 0) {
    deckMap.delete(removable.card.normalizedName)
  }
}

function normalizeDeckSize(
  deck: DeckCard[],
  candidateEvaluation: CandidateEvaluation,
  profile: VariantProfile,
  targetSize: number,
): DeckCard[] {
  const poolCounts = getPoolQuantityMap(candidateEvaluation.playableCards)
  const normalized = new Map<string, DeckCard>(
    deck
      .filter((entry) => entry.quantity > 0)
      .map((entry) => [
        entry.card.normalizedName,
        {
          ...entry,
          quantity: Math.min(
            entry.quantity,
            poolCounts.get(entry.card.normalizedName) ?? 0,
          ),
          notes: [...entry.notes],
        },
      ]),
  )

  while (countDeckCards([...normalized.values()]) > targetSize) {
    removeWeakestDeckCopy(normalized)
  }

  while (countDeckCards([...normalized.values()]) < targetSize) {
    const nextCard = candidateEvaluation.playableCards
      .flatMap((poolCard) => {
        const used = normalized.get(poolCard.ratingCard.normalizedName)?.quantity ?? 0
        const remaining = Math.max(0, poolCard.quantity - used)
        if (remaining === 0) {
          return []
        }

        const nextCopyScore = getBaseCardScore(
          poolCard.ratingCard,
          candidateEvaluation.candidate,
          profile,
          used,
        )

        return [
          {
            card: poolCard.ratingCard,
            score: nextCopyScore,
          },
        ]
      })
      .sort((a, b) => b.score - a.score)[0]

    if (!nextCard) {
      break
    }

    addDeckCopy(normalized, nextCard.card, candidateEvaluation.candidate, profile)
  }

  return [...normalized.values()].sort((a, b) => b.adjustedScore - a.adjustedScore)
}

function mergeFlatCards(cards: RatingCard[], candidate: CandidateConfig, profile: VariantProfile): DeckCard[] {
  const countByName = new Map<string, number>()
  const merged = new Map<string, DeckCard>()

  for (const card of cards) {
    const copyIndex = countByName.get(card.normalizedName) ?? 0
    countByName.set(card.normalizedName, copyIndex + 1)
    const score = getBaseCardScore(card, candidate, profile, copyIndex)

    const existing = merged.get(card.normalizedName)
    if (!existing) {
      merged.set(card.normalizedName, {
        card,
        quantity: 1,
        adjustedScore: score,
        notes: [`Refined with ${profile.label} priorities.`],
      })
      continue
    }

    existing.quantity += 1
    existing.adjustedScore += score
  }

  return [...merged.values()].sort((a, b) => b.adjustedScore - a.adjustedScore)
}

function refineDeck(
  baseline: DeckCard[],
  candidateEvaluation: CandidateEvaluation,
  profile: VariantProfile,
  config: SearchConfig,
): DeckCard[] {
  let deckCards = flattenDeck(baseline)

  const getUnusedCards = () =>
    candidateEvaluation.playableCards.flatMap((poolCard) => {
      const used =
        deckCards.filter((card) => card.normalizedName === poolCard.ratingCard.normalizedName)
          .length
      const remaining = Math.max(0, poolCard.quantity - used)
      return Array.from({ length: remaining }, () => poolCard.ratingCard)
    })

  const scoreFlatDeck = (cards: RatingCard[]) => {
    const merged = mergeFlatCards(cards, candidateEvaluation.candidate, profile)
    const landCount = suggestLandCount(
        getDeckMetrics(merged, candidateEvaluation.candidate, EMPTY_COLOR_COUNTS()),
        profile,
        config,
      )
    const basics = suggestBasicLands(merged, candidateEvaluation.candidate, landCount)
    return evaluateDeckScore(merged, candidateEvaluation, profile, basics).total
  }

  const enforceThresholds = () => {
    let merged = mergeFlatCards(deckCards, candidateEvaluation.candidate, profile)
    let metrics = getDeckMetrics(merged, candidateEvaluation.candidate, EMPTY_COLOR_COUNTS())

    const byWorstShape = [...deckCards].sort((a, b) => {
      const aPenalty = (a.isCreature ? 0 : 0.4) + (a.cmc >= 5 ? 0.35 : 0) + (a.role.isConditionalCard ? 0.2 : 0)
      const bPenalty = (b.isCreature ? 0 : 0.4) + (b.cmc >= 5 ? 0.35 : 0) + (b.role.isConditionalCard ? 0.2 : 0)
      return bPenalty - aPenalty
    })

    const unused = getUnusedCards()

    while (metrics.creatureCount < 13) {
      const add = unused.find((card) => card.isCreature)
      const remove = byWorstShape.find((candidateCard) => !candidateCard.isCreature || candidateCard.cmc >= 5)
      if (!add || !remove) break
      const removeIndex = deckCards.indexOf(remove)
      deckCards = [...deckCards.slice(0, removeIndex), ...deckCards.slice(removeIndex + 1)]
      deckCards.push(add)
      unused.splice(unused.indexOf(add), 1)
      merged = mergeFlatCards(deckCards, candidateEvaluation.candidate, profile)
      metrics = getDeckMetrics(merged, candidateEvaluation.candidate, EMPTY_COLOR_COUNTS())
    }

    while (metrics.cheapPlays < 5) {
      const add = unused.find((card) => card.cmc <= 2)
      const remove = [...deckCards].sort((a, b) => b.cmc - a.cmc)[0]
      if (!add || !remove || add.normalizedName === remove.normalizedName) break
      const removeIndex = deckCards.indexOf(remove)
      deckCards = [...deckCards.slice(0, removeIndex), ...deckCards.slice(removeIndex + 1)]
      deckCards.push(add)
      unused.splice(unused.indexOf(add), 1)
      merged = mergeFlatCards(deckCards, candidateEvaluation.candidate, profile)
      metrics = getDeckMetrics(merged, candidateEvaluation.candidate, EMPTY_COLOR_COUNTS())
    }
  }

  enforceThresholds()

  let bestScore = scoreFlatDeck(deckCards)
  let improved = true

  while (improved) {
    improved = false
    const unused = getUnusedCards()

    for (let removeIndex = 0; removeIndex < deckCards.length; removeIndex += 1) {
      for (const addCard of unused) {
        if (addCard.normalizedName === deckCards[removeIndex]?.normalizedName) {
          continue
        }

        const nextDeck = [...deckCards]
        nextDeck.splice(removeIndex, 1, addCard)
        const nextScore = scoreFlatDeck(nextDeck)
        if (nextScore > bestScore + 0.18) {
          deckCards = nextDeck
          bestScore = nextScore
          improved = true
          break
        }
      }

      if (improved) {
        break
      }
    }
  }

  return normalizeDeckSize(
    mergeFlatCards(deckCards, candidateEvaluation.candidate, profile),
    candidateEvaluation,
    profile,
    config.spellSlots,
  )
}

function enforcePoolLegality(
  deck: DeckCard[],
  candidateEvaluation: CandidateEvaluation,
): DeckCard[] {
  const poolCounts = getPoolQuantityMap(candidateEvaluation.playableCards)

  return deck
    .map((entry) => ({
      ...entry,
      quantity: Math.min(entry.quantity, poolCounts.get(entry.card.normalizedName) ?? 0),
    }))
    .filter((entry) => entry.quantity > 0)
}

function buildExplanation(
  deck: RankedDeckResult,
  profile: VariantProfile,
): string {
  const colorLabel = deck.colors.splash
    ? `${COLOR_NAMES[deck.colors.base[0]]}-${COLOR_NAMES[deck.colors.base[1]]} with a light ${COLOR_NAMES[deck.colors.splash]} splash`
    : deck.colors.base.map((color) => COLOR_NAMES[color]).join("-")

  const topCards = deck.mainDeck.slice(0, 3).map((entry) => entry.card.displayName)
  const biggestStrength =
    [
      { label: "mana consistency", value: deck.scoreBreakdown.manaConsistency },
      { label: "early-game stability", value: deck.scoreBreakdown.earlyGameStability },
      { label: "creature structure", value: deck.scoreBreakdown.creatureStructure },
      { label: "interaction quality", value: deck.scoreBreakdown.interactionQuality },
    ].sort((a, b) => b.value - a.value)[0]?.label ?? "balanced construction"

  const weakness =
    deck.metrics.splashStrain > 0
      ? "the splash stretches the manabase a bit"
      : deck.metrics.topEndLoad > 0.22
        ? "the top end is still slightly heavy"
        : deck.metrics.nonCreatureSaturation > 0.5
          ? "it leans a little hard on noncreature spells"
          : "it does not have quite as much raw depth as the very best pools"

  return `This ${colorLabel} ${profile.label} build ranked highly because the pool is deep enough to support it and its biggest edge is ${biggestStrength}. The deck is defined by ${topCards.join(", ")}, while the main thing keeping it from scoring even higher is that ${weakness}.`
}

function getDeckDiagnostics(
  deck: RankedDeckResult,
  candidateEvaluation: CandidateEvaluation,
  profile: VariantProfile,
  ratingConflicts: string[],
): string[] {
  const diagnostics = [
    `Color pair pool strength: ${candidateEvaluation.poolStrength.toFixed(2)} using the ${profile.label} build profile.`,
    `${deck.metrics.creatureCount} creatures, ${deck.metrics.interactionCount} interaction spells, ${deck.metrics.cheapPlays} cheap plays.`,
    `Mana source sufficiency scored ${deck.metrics.manaSourceSufficiency.toFixed(2)} with a ${deck.landCount}-land basic mana base.`,
  ]

  if (deck.metrics.creatureCount < 13) {
    diagnostics.push("Strong card quality, but the deck still came in slightly light on creatures.")
  }

  if (deck.metrics.splashStrain > 0) {
    diagnostics.push("Good splash cards were kept only because the base colors had enough depth to support the strain.")
  }

  if (deck.metrics.manaSourceSufficiency < 3.5) {
    diagnostics.push("Mana pressure remains one of this deck's main risks despite the chosen basic-land split.")
  }

  if (deck.metrics.expensiveSpells > 5) {
    diagnostics.push("Curve-balancing swaps reduced some clunk, but the deck still carries a notable top-end burden.")
  }

  if (ratingConflicts.length > 0) {
    diagnostics.push(...ratingConflicts)
  }

  return diagnostics
}

function deckSignature(mainDeck: DeckCard[]): Set<string> {
  return new Set(
    mainDeck.flatMap((entry) =>
      Array.from(
        { length: entry.quantity },
        (_, index) => `${entry.card.normalizedName}:${index}`,
      ),
    ),
  )
}

function roleProfileSignature(metrics: DeckMetrics): string {
  return [
    metrics.creatureCount >= 15 ? "creature-heavy" : "spell-heavy",
    metrics.cheapPlays >= 8 ? "fast" : "midrange",
    metrics.expensiveSpells >= 5 ? "top-end" : "trimmed",
    metrics.splashStrain > 0 ? "splash" : "clean",
  ].join("|")
}

function isNearDuplicate(deck: RankedDeckResult, selected: RankedDeckResult[]): boolean {
  const current = deckSignature(deck.mainDeck)
  const currentRole = roleProfileSignature(deck.metrics)

  return selected.some((other) => {
    const otherSig = deckSignature(other.mainDeck)
    const shared = [...current].filter((card) => otherSig.has(card)).length
    const overlap = shared / Math.max(current.size, otherSig.size)
    const sameRole = currentRole === roleProfileSignature(other.metrics)
    return overlap >= 0.84 && sameRole
  })
}

export function evaluateSealedPool(
  poolEntries: PoolEntry[],
  ratings: RatingMergeResult,
  searchConfig: Partial<SearchConfig> = {},
): {
  decks: RankedDeckResult[]
  missingCards: MissingPoolCard[]
} {
  const config = { ...DEFAULT_SEARCH_CONFIG, ...searchConfig }
  const { poolCards, missingCards } = resolvePool(poolEntries, ratings)
  const rankedCandidates = rankCandidateConfigs(poolCards, config)
  const rankedDecks: RankedDeckResult[] = []

  for (const candidateEvaluation of rankedCandidates) {
    for (const profile of VARIANT_PROFILES.slice(0, config.variantsPerCandidate)) {
      const baseline = buildBaselineDeck(candidateEvaluation, profile, config)
      const refined = normalizeDeckSize(
        enforcePoolLegality(
          refineDeck(baseline, candidateEvaluation, profile, config),
          candidateEvaluation,
        ),
        candidateEvaluation,
        profile,
        config.spellSlots,
      )

      if (countDeckCards(refined) !== config.spellSlots) {
        continue
      }

      const landCount = suggestLandCount(
        getDeckMetrics(refined, candidateEvaluation.candidate, EMPTY_COLOR_COUNTS()),
        profile,
        config,
      )
      const basicLands = suggestBasicLands(refined, candidateEvaluation.candidate, landCount)
      const evaluation = evaluateDeckScore(refined, candidateEvaluation, profile, basicLands)
      const fullDeck = [
        ...refined,
        ...COLOR_SYMBOLS.filter((color) => basicLands[color] > 0).map((color) => ({
          card: {
            name: BASIC_LAND_NAMES[color],
            displayName: BASIC_LAND_NAMES[color],
            aliases: [BASIC_LAND_NAMES[color]],
            normalizedAliases: [BASIC_LAND_NAMES[color].toLowerCase()],
            type: "Land",
            rarity: "C",
            rating: 0,
            cmc: 0,
            rawColors: EMPTY_COLOR_COUNTS(),
            alternateRawColors: undefined,
            alternateCost: color,
            primaryCost: "0",
            image: undefined,
            isCreature: false,
            isLand: true,
            isInstantLike: false,
            normalizedName: BASIC_LAND_NAMES[color].toLowerCase(),
            role: {
              colorCount: 0,
              maxSingleColorPip: 0,
              totalColoredPips: 0,
              isCheapCreature: false,
              isExpensiveFinisher: false,
              isInteraction: false,
              isConditionalCard: false,
              isColorlessPlayable: false,
              isFixing: false,
            },
          },
          quantity: basicLands[color],
          adjustedScore: 0,
          notes: ["Basic land added to complete the deck."],
        })),
      ]

      const deck: RankedDeckResult = {
        id: `${candidateEvaluation.candidate.base.join("")}-${candidateEvaluation.candidate.splash ?? "none"}-${profile.key}`,
        colors: candidateEvaluation.candidate,
        mainDeck: refined,
        fullDeck,
        basicLands,
        spellCount: config.spellSlots,
        landCount,
        totalCardCount: fullDeck.reduce((sum, entry) => sum + entry.quantity, 0),
        totalScore: evaluation.total,
        explanation: "",
        diagnostics: [],
        metrics: evaluation.metrics,
        scoreBreakdown: evaluation.breakdown,
      }

      deck.explanation = buildExplanation(deck, profile)
      deck.diagnostics = getDeckDiagnostics(deck, candidateEvaluation, profile, ratings.conflicts)
      rankedDecks.push(deck)
    }
  }

  rankedDecks.sort((a, b) => b.totalScore - a.totalScore)

  const topDecks: RankedDeckResult[] = []
  for (const deck of rankedDecks) {
    if (isNearDuplicate(deck, topDecks)) {
      continue
    }

    topDecks.push(deck)
    if (topDecks.length >= config.maxResults) {
      break
    }
  }

  return {
    decks: topDecks,
    missingCards,
  }
}

export function describeManaBase(basicLands: ColorCountMap): string[] {
  return COLOR_SYMBOLS.filter((color) => basicLands[color] > 0).map(
    (color) => `${basicLands[color]} ${BASIC_LAND_NAMES[color]}`,
  )
}
