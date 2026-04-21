import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ResultsPanel } from "@/components/results/ResultsPanel"

const baseProps = {
  isEvaluating: false,
  results: [],
  missingCards: [],
  selectedDeckIndex: 0,
  onSelectDeck: vi.fn(),
  copiedDeckId: null,
  onCopyDeck: vi.fn(),
  onCopyMana: vi.fn(),
  onAnalyzeCard: vi.fn(),
  scryfallLoaded: false,
}

const mockDeck = {
  id: "deck-1",
  colors: { base: ["W", "U"] as const, splash: null },
  mainDeck: [],
  fullDeck: [],
  basicLands: { W: 9, U: 8, B: 0, R: 0, G: 0 },
  spellCount: 23,
  landCount: 17,
  totalCardCount: 40,
  totalScore: 87.4,
  explanation: "Strong build.",
  diagnostics: [],
  metrics: {
    creatureCount: 14, nonCreatureCount: 9, interactionCount: 6,
    cheapPlays: 8, expensiveSpells: 3, averageCmc: 2.9, manaStability: 8.7,
    curveScore: 8.2, earlyBoardPresence: 7.8, removalDensity: 7.1,
    splashStrain: 0, manaSourceSufficiency: 8.5, topEndLoad: 3.1,
    nonCreatureSaturation: 4.2,
  },
  scoreBreakdown: {
    cardQuality: 18, manaConsistency: 12, earlyGameStability: 9,
    creatureStructure: 8, interactionQuality: 10, topEndBurden: 5,
    colorDepthResilience: 8, fixingBonus: 0, synergyBonus: 0,
    deckCoherence: 9, penalties: 0, total: 79,
  },
  synergyBreakdown: {},
  synergyDetail: {},
} as const

describe("ResultsPanel", () => {
  it("shows empty state when there are no results and not evaluating", () => {
    render(<ResultsPanel {...baseProps} />)
    expect(screen.getByText(/no ranked decks yet/i)).toBeInTheDocument()
  })

  it("shows skeleton cards when isEvaluating is true", () => {
    render(<ResultsPanel {...baseProps} isEvaluating />)
    expect(screen.queryByText(/no ranked decks yet/i)).not.toBeInTheDocument()
    expect(screen.getByTestId("evaluating-skeletons")).toBeInTheDocument()
  })

  it("renders ResultsList when results are present", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<ResultsPanel {...baseProps} results={[mockDeck as any]} />)
    // Score visible in the list (may appear in both list and detail panels)
    expect(screen.getAllByText("87.4").length).toBeGreaterThan(0)
  })

  it("shows missing cards alert when missingCards is non-empty", () => {
    render(
      <ResultsPanel
        {...baseProps}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results={[mockDeck as any]}
        missingCards={["2 Some Card"]}
      />,
    )
    expect(screen.getByText(/missing from the combined rating files/i)).toBeInTheDocument()
    expect(screen.getByText(/2 Some Card/i)).toBeInTheDocument()
  })

  it("persists width to localStorage when drag handle is used", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<ResultsPanel {...baseProps} results={[mockDeck as any]} />)

    const handle = screen.getByTestId("resize-handle")

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent(window, new MouseEvent("mousemove", { clientX: 440 }))
    fireEvent(window, new MouseEvent("mouseup"))

    expect(setItemSpy).toHaveBeenCalledWith("resultsPanelWidth", "420")
  })
})
