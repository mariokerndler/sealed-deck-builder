import { BASIC_LAND_NAMES, COLOR_NAMES, DEFAULT_SEARCH_CONFIG, EMPTY_COLOR_COUNTS } from "@/lib/mtg/constants"
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
  RatingMergeResult,
  SearchConfig,
} from "@/lib/mtg/types"
import { COLOR_SYMBOLS } from "@/lib/mtg/types"

type CandidateConfig = DeckColorIdentity

type ResolvedPool = {
  poolCards: PoolCard[]
  missingCards: MissingPoolCard[]
}

function getCardColors(card: RatingCard): ColorSymbol[] {
  return COLOR_SYMBOLS.filter((symbol) => card.rawColors[symbol] > 0)
}

function resolvePool(pool: PoolEntry[], ratings: RatingMergeResult): ResolvedPool {
  const poolCards: PoolCard[] = []
  const missingCards: MissingPoolCard[] = []

  for (const entry of pool) {
    const match = ratings.index.get(entry.normalizedName)

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

      if (config.allowSplash) {
        for (const splash of COLOR_SYMBOLS.filter((symbol) => symbol !== color)) {
          candidates.push({ base: [color], splash })
        }
      }
    }
  }

  for (let i = 0; i < COLOR_SYMBOLS.length; i += 1) {
    for (let j = i + 1; j < COLOR_SYMBOLS.length; j += 1) {
      const base: ColorSymbol[] = [COLOR_SYMBOLS[i], COLOR_SYMBOLS[j]]
      candidates.push({ base })

      if (config.allowSplash) {
        for (const splash of COLOR_SYMBOLS.filter(
          (symbol) => !base.includes(symbol),
        )) {
          candidates.push({ base, splash })
        }
      }
    }
  }

  return candidates
}

function isOnPlan(card: RatingCard, candidate: CandidateConfig): boolean {
  if (card.isLand) {
    return false
  }

  const colors = getCardColors(card)

  if (colors.length === 0) {
    return true
  }

  const allowedColors = new Set(
    candidate.splash ? [...candidate.base, candidate.splash] : candidate.base,
  )

  if (!colors.every((color) => allowedColors.has(color))) {
    return false
  }

  if (!candidate.splash) {
    return true
  }

  const usesSplashColor = colors.includes(candidate.splash)

  if (!usesSplashColor) {
    return true
  }

  const splashPips = card.rawColors[candidate.splash]
  return splashPips <= 1 && card.cmc >= 2 && card.rating >= 2.7
}

function cardCopyCount(card: PoolCard): number {
  return card.ratingCard.isLand ? 0 : card.quantity
}

function getCardBaseScore(card: RatingCard, candidate: CandidateConfig): {
  score: number
  notes: string[]
} {
  let score = card.rating
  const notes: string[] = []
  const colors = getCardColors(card)
  const totalPips = colors.reduce((sum, color) => sum + card.rawColors[color], 0)
  const isSplashCard = Boolean(candidate.splash && colors.includes(candidate.splash))

  if (card.isCreature) {
    score += 0.18
    notes.push("Creature helps build board presence.")
  } else {
    score -= 0.04
  }

  if (card.cmc <= 2) {
    score += 0.16
    notes.push("Cheap play supports a smoother curve.")
  } else if (card.cmc >= 5) {
    score -= 0.1
  }

  if (card.isInstantLike && !card.isCreature) {
    score += 0.14
    notes.push("Interactive spell adds flexibility.")
  }

  if (totalPips >= 2) {
    score -= 0.12 * (totalPips - 1)
    notes.push("Heavy color requirements make mana less forgiving.")
  }

  if (card.cmc >= 6) {
    score -= 0.16
  }

  if (isSplashCard) {
    score -= 0.28
    notes.push("Splash cards are slightly discounted for consistency.")
  }

  if (colors.length === 0 && !card.isCreature) {
    score += 0.05
  }

  return { score, notes }
}

function getSelectionBonus(selection: DeckCard[], card: RatingCard): number {
  const creatures = selection.reduce(
    (sum, current) => sum + (current.card.isCreature ? current.quantity : 0),
    0,
  )
  const interaction = selection.reduce(
    (sum, current) =>
      sum + (current.card.isInstantLike && !current.card.isCreature ? current.quantity : 0),
    0,
  )
  const cheapPlays = selection.reduce(
    (sum, current) => sum + (current.card.cmc <= 2 ? current.quantity : 0),
    0,
  )
  const expensiveSpells = selection.reduce(
    (sum, current) => sum + (current.card.cmc >= 5 ? current.quantity : 0),
    0,
  )

  let bonus = 0

  if (card.isCreature && creatures < 15) {
    bonus += 0.2
  }

  if (card.isCreature && creatures >= 17) {
    bonus -= 0.2
  }

  if (!card.isCreature && interaction < 5 && card.isInstantLike) {
    bonus += 0.18
  }

  if (card.cmc <= 2 && cheapPlays < 7) {
    bonus += 0.16
  }

  if (card.cmc >= 5 && expensiveSpells >= 5) {
    bonus -= 0.3
  }

  return bonus
}

function buildCandidateDeck(
  poolCards: PoolCard[],
  candidate: CandidateConfig,
  config: SearchConfig,
): DeckCard[] {
  const playableCopies: DeckCard[] = []

  for (const poolCard of poolCards) {
    if (!isOnPlan(poolCard.ratingCard, candidate)) {
      continue
    }

    const copies = cardCopyCount(poolCard)
    const base = getCardBaseScore(poolCard.ratingCard, candidate)

    for (let copy = 0; copy < copies; copy += 1) {
      playableCopies.push({
        card: poolCard.ratingCard,
        quantity: 1,
        adjustedScore: base.score,
        notes: [...base.notes],
      })
    }
  }

  const selection: DeckCard[] = []
  const remaining = [...playableCopies]

  while (selection.length < config.spellSlots && remaining.length > 0) {
    let bestIndex = 0
    let bestScore = Number.NEGATIVE_INFINITY

    remaining.forEach((candidateCard, index) => {
      const totalScore =
        candidateCard.adjustedScore + getSelectionBonus(selection, candidateCard.card)

      if (totalScore > bestScore) {
        bestScore = totalScore
        bestIndex = index
      }
    })

    const [chosen] = remaining.splice(bestIndex, 1)
    selection.push({
      ...chosen,
      adjustedScore: bestScore,
    })
  }

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

  return [...merged.values()].sort((a, b) => {
    if (b.adjustedScore !== a.adjustedScore) {
      return b.adjustedScore - a.adjustedScore
    }

    return a.card.cmc - b.card.cmc
  })
}

function getDeckMetrics(mainDeck: DeckCard[]): DeckMetrics {
  const flattenedCount = mainDeck.reduce((sum, card) => sum + card.quantity, 0)
  const creatureCount = mainDeck.reduce(
    (sum, card) => sum + (card.card.isCreature ? card.quantity : 0),
    0,
  )
  const interactionCount = mainDeck.reduce(
    (sum, card) =>
      sum + (card.card.isInstantLike && !card.card.isCreature ? card.quantity : 0),
    0,
  )
  const cheapPlays = mainDeck.reduce(
    (sum, card) => sum + (card.card.cmc <= 2 ? card.quantity : 0),
    0,
  )
  const expensiveSpells = mainDeck.reduce(
    (sum, card) => sum + (card.card.cmc >= 5 ? card.quantity : 0),
    0,
  )
  const averageCmc =
    flattenedCount === 0
      ? 0
      : mainDeck.reduce((sum, card) => sum + card.card.cmc * card.quantity, 0) /
        flattenedCount

  const manaStability = Math.max(
    0,
    10 -
      mainDeck.reduce((sum, card) => {
        const pips = COLOR_SYMBOLS.reduce(
          (pipTotal, symbol) => pipTotal + card.card.rawColors[symbol],
          0,
        )

        return sum + Math.max(0, pips - 1) * card.quantity
      }, 0) *
        0.7,
  )

  const curveScore =
    4 +
    Math.min(cheapPlays, 7) * 0.35 -
    Math.max(0, expensiveSpells - 4) * 0.45 +
    Math.min(creatureCount, 16) * 0.12

  return {
    creatureCount,
    nonCreatureCount: flattenedCount - creatureCount,
    interactionCount,
    cheapPlays,
    expensiveSpells,
    averageCmc,
    manaStability,
    curveScore,
  }
}

function suggestLandCount(metrics: DeckMetrics, config: SearchConfig): number {
  if (metrics.averageCmc >= 3.9 || metrics.expensiveSpells >= 6) {
    return config.defaultLands + 1
  }

  if (metrics.averageCmc <= 2.4 && metrics.cheapPlays >= 9) {
    return config.defaultLands - 1
  }

  return config.defaultLands
}

function suggestBasicLands(
  mainDeck: DeckCard[],
  colors: DeckColorIdentity,
  landCount: number,
): ColorCountMap {
  const weights = EMPTY_COLOR_COUNTS()

  for (const entry of mainDeck) {
    for (const color of COLOR_SYMBOLS) {
      const pips = entry.card.rawColors[color]
      if (pips === 0) {
        continue
      }

      let weight = pips * entry.quantity

      if (entry.card.cmc <= 2) {
        weight *= 1.4
      } else if (entry.card.cmc <= 4) {
        weight *= 1.15
      }

      if (colors.splash === color) {
        weight *= 0.7
      }

      weights[color] += weight
    }
  }

  const activeColors = COLOR_SYMBOLS.filter((color) => weights[color] > 0)
  if (activeColors.length === 0) {
    return EMPTY_COLOR_COUNTS()
  }

  const totalWeight = activeColors.reduce((sum, color) => sum + weights[color], 0)
  const basics = EMPTY_COLOR_COUNTS()

  for (const color of activeColors) {
    basics[color] = Math.max(1, Math.round((weights[color] / totalWeight) * landCount))
  }

  while (COLOR_SYMBOLS.reduce((sum, color) => sum + basics[color], 0) > landCount) {
    const removable = [...activeColors].sort((a, b) => basics[b] - basics[a])[0]
    if (basics[removable] > 1) {
      basics[removable] -= 1
    } else {
      break
    }
  }

  while (COLOR_SYMBOLS.reduce((sum, color) => sum + basics[color], 0) < landCount) {
    const addable = [...activeColors].sort((a, b) => weights[b] - weights[a])[0]
    basics[addable] += 1
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

function getDeckScore(
  mainDeck: DeckCard[],
  metrics: DeckMetrics,
  colors: DeckColorIdentity,
): number {
  const cardScore = mainDeck.reduce((sum, card) => sum + card.adjustedScore, 0)
  let score =
    cardScore +
    metrics.curveScore +
    metrics.manaStability +
    metrics.interactionCount * 0.45

  if (metrics.creatureCount < 12) {
    score -= (12 - metrics.creatureCount) * 1.2
  }

  if (metrics.cheapPlays < 5) {
    score -= (5 - metrics.cheapPlays) * 0.8
  }

  if (colors.splash) {
    score -= 0.6
  }

  return Number(score.toFixed(2))
}

function buildExplanation(
  deck: RankedDeckResult,
  colors: DeckColorIdentity,
): string {
  const colorLabel = colors.splash
    ? `${COLOR_NAMES[colors.base[0]]}-${COLOR_NAMES[colors.base[1]]} with a light ${COLOR_NAMES[colors.splash]} splash`
    : colors.base.map((color) => COLOR_NAMES[color]).join("-")

  const strengths: string[] = []
  const risks: string[] = []

  if (deck.metrics.creatureCount >= 14) {
    strengths.push("a reliable creature count for new players")
  }

  if (deck.metrics.cheapPlays >= 7) {
    strengths.push("enough early plays to avoid slow starts")
  }

  if (deck.metrics.interactionCount >= 5) {
    strengths.push("good interaction to answer opposing threats")
  }

  if (deck.metrics.averageCmc > 3.8) {
    risks.push("a slightly heavier curve")
  }

  if (colors.splash) {
    risks.push("a splash that makes the mana a bit less forgiving")
  }

  if (deck.metrics.creatureCount < 13) {
    risks.push("fewer creatures than an ideal beginner build")
  }

  const strengthsText =
    strengths.length > 0 ? strengths.join(", ") : "solid card quality across the main deck"
  const riskText = risks.length > 0 ? risks.join(" and ") : "no major structural weakness"

  return `This ${colorLabel} deck ranked highly because it combines ${strengthsText}. The main thing to watch for is ${riskText}.`
}

function getDeckDiagnostics(
  deck: DeckCard[],
  colors: DeckColorIdentity,
  metrics: DeckMetrics,
  ratingConflicts: string[],
): string[] {
  const diagnostics: string[] = []

  if (colors.splash) {
    diagnostics.push(
      `Splash kept intentionally light with ${COLOR_NAMES[colors.splash]} cards only when they clear the rating threshold.`,
    )
  }

  diagnostics.push(
    `${metrics.creatureCount} creatures, ${metrics.interactionCount} interaction spells, average mana value ${metrics.averageCmc.toFixed(1)}.`,
  )

  if (metrics.expensiveSpells >= 5) {
    diagnostics.push("Curve includes several expensive cards, so the land count was kept higher.")
  }

  if (ratingConflicts.length > 0) {
    diagnostics.push(...ratingConflicts)
  }

  const topCards = deck.slice(0, 3).map((entry) => entry.card.displayName)
  if (topCards.length > 0) {
    diagnostics.push(`Top pull cards driving the score: ${topCards.join(", ")}.`)
  }

  return diagnostics
}

function deckSignature(mainDeck: DeckCard[]): Set<string> {
  return new Set(
    mainDeck.flatMap((entry) =>
      Array.from({ length: entry.quantity }, (_, index) => `${entry.card.normalizedName}:${index}`),
    ),
  )
}

function isNearDuplicate(deck: RankedDeckResult, selected: RankedDeckResult[]): boolean {
  const current = deckSignature(deck.mainDeck)

  return selected.some((other) => {
    const otherSig = deckSignature(other.mainDeck)
    const shared = [...current].filter((card) => otherSig.has(card)).length
    const overlap = shared / Math.max(current.size, otherSig.size)
    return overlap >= 0.87
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

  const candidates = getAllCandidateConfigs(config)
  const ranked: RankedDeckResult[] = []

  for (const candidate of candidates) {
    const mainDeck = buildCandidateDeck(poolCards, candidate, config)

    if (mainDeck.reduce((sum, card) => sum + card.quantity, 0) < config.spellSlots) {
      continue
    }

    const metrics = getDeckMetrics(mainDeck)
    const landCount = suggestLandCount(metrics, config)
    const basicLands = suggestBasicLands(mainDeck, candidate, landCount)
    const totalScore = getDeckScore(mainDeck, metrics, candidate)

    const deck: RankedDeckResult = {
      id: `${candidate.base.join("")}-${candidate.splash ?? "none"}`,
      colors: candidate,
      mainDeck,
      basicLands,
      spellCount: config.spellSlots,
      landCount,
      totalScore,
      explanation: "",
      diagnostics: [],
      metrics,
    }

    deck.explanation = buildExplanation(deck, candidate)
    deck.diagnostics = getDeckDiagnostics(
      mainDeck,
      candidate,
      metrics,
      ratings.conflicts,
    )
    ranked.push(deck)
  }

  ranked.sort((a, b) => b.totalScore - a.totalScore)

  const topDecks: RankedDeckResult[] = []
  for (const deck of ranked) {
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
