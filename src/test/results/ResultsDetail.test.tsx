import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ResultsDetail } from "@/components/results/ResultsDetail"

const mockDeck = {
  id: "deck-1",
  colors: { base: ["W", "U"] as const, splash: null },
  mainDeck: [],
  fullDeck: [
    {
      quantity: 1,
      adjustedScore: 8.1,
      notes: [],
      card: {
        name: "Last Gasp",
        displayName: "Last Gasp",
        aliases: [],
        normalizedAliases: ["lastgasp"],
        type: "Instant",
        rarity: "common",
        rating: 8.1,
        cmc: 2,
        rawColors: { W: 0, U: 0, B: 1, R: 0, G: 0 },
        primaryCost: "{1}{B}",
        image: undefined,
        isCreature: false,
        isLand: false,
        isInstantLike: true,
        normalizedName: "lastgasp",
        role: {
          colorCount: 1,
          maxSingleColorPip: 1,
          totalColoredPips: 1,
          isCheapCreature: false,
          isExpensiveFinisher: false,
          isInteraction: true,
          isConditionalCard: false,
          isColorlessPlayable: false,
          isFixing: false,
        },
      },
    },
  ],
  basicLands: { W: 9, U: 8, B: 0, R: 0, G: 0 },
  spellCount: 23,
  landCount: 17,
  totalCardCount: 40,
  totalScore: 87.4,
  explanation: "Strong Azorius build.",
  diagnostics: ["Good curve"],
  metrics: {
    creatureCount: 14,
    nonCreatureCount: 9,
    interactionCount: 6,
    cheapPlays: 8,
    expensiveSpells: 3,
    averageCmc: 2.9,
    manaStability: 8.7,
    curveScore: 8.2,
    earlyBoardPresence: 7.8,
    removalDensity: 7.1,
    splashStrain: 0,
    manaSourceSufficiency: 8.5,
    topEndLoad: 3.1,
    nonCreatureSaturation: 4.2,
  },
  scoreBreakdown: {
    cardQuality: 18,
    manaConsistency: 12,
    earlyGameStability: 9,
    creatureStructure: 8,
    interactionQuality: 10,
    topEndBurden: 5,
    colorDepthResilience: 8,
    fixingBonus: 0,
    synergyBonus: 0,
    deckCoherence: 9,
    penalties: 0,
    total: 79,
  },
  synergyBreakdown: {},
  synergyDetail: {},
} as const

const baseProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deck: mockDeck as any,
  index: 0,
  copiedDeckId: null,
  onCopyDeck: vi.fn(),
  onCopyMana: vi.fn(),
  onAnalyzeCard: vi.fn(),
  scryfallLoaded: false,
}

describe("ResultsDetail", () => {
  it("renders the deck score", () => {
    render(<ResultsDetail {...baseProps} />)
    expect(screen.getByText("87.4")).toBeInTheDocument()
  })

  it("renders all 6 metric labels", () => {
    render(<ResultsDetail {...baseProps} />)
    expect(screen.getByText(/creatures/i)).toBeInTheDocument()
    expect(screen.getByText(/interaction/i)).toBeInTheDocument()
    expect(screen.getByText(/avg cmc/i)).toBeInTheDocument()
    expect(screen.getByText(/cheap plays/i)).toBeInTheDocument()
    expect(screen.getByText(/stability/i)).toBeInTheDocument()
    expect(screen.getByText(/lands/i)).toBeInTheDocument()
  })

  it("renders deck list tab content by default", () => {
    render(<ResultsDetail {...baseProps} />)
    expect(screen.getByText("Last Gasp")).toBeInTheDocument()
  })

  it("calls onAnalyzeCard with card name when a card row is clicked", () => {
    const onAnalyzeCard = vi.fn()
    render(<ResultsDetail {...baseProps} onAnalyzeCard={onAnalyzeCard} />)
    fireEvent.click(screen.getByRole("button", { name: "Last Gasp" }))
    expect(onAnalyzeCard).toHaveBeenCalledWith("Last Gasp")
  })

  it("calls onCopyDeck when Copy deck button is clicked", () => {
    const onCopyDeck = vi.fn()
    render(<ResultsDetail {...baseProps} onCopyDeck={onCopyDeck} />)
    fireEvent.click(screen.getByRole("button", { name: /copy deck/i }))
    expect(onCopyDeck).toHaveBeenCalledWith(mockDeck)
  })

  it("shows 'Copied deck' label when copiedDeckId matches", () => {
    render(<ResultsDetail {...baseProps} copiedDeckId="deck-1-deck" />)
    expect(screen.getByRole("button", { name: /copied deck/i })).toBeInTheDocument()
  })

  it("shows 'Copied mana' label when copiedDeckId matches mana", () => {
    render(<ResultsDetail {...baseProps} copiedDeckId="deck-1-mana" />)
    expect(screen.getByRole("button", { name: /copied mana/i })).toBeInTheDocument()
  })
})
