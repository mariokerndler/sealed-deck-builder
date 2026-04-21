import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mockDeck = {
  id: "deck-1",
  colors: { base: ["W", "U"] },
  mainDeck: [],
  fullDeck: [
    {
      quantity: 1,
      adjustedScore: 3.4,
      notes: [],
      card: {
        name: "Harsh Annotation",
        displayName: "Harsh Annotation",
        aliases: [],
        normalizedAliases: ["harshannotation"],
        type: "Enchantment",
        rarity: "common",
        rating: 3.4,
        cmc: 2,
        rawColors: { W: 1, U: 0, B: 0, R: 0, G: 0 },
        primaryCost: "{1}{W}",
        image: undefined,
        isCreature: false,
        isLand: false,
        isInstantLike: false,
        normalizedName: "harshannotation",
        role: {
          colorCount: 1,
          maxSingleColorPip: 1,
          totalColoredPips: 1,
          hasHybridMana: false,
          isHybridOnlyFlexible: false,
          isCheapCreature: false,
          isExpensiveFinisher: false,
          isInteraction: false,
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
  totalScore: 92.4,
  explanation: "A stable Azorius build with clean tempo and solid mana.",
  diagnostics: ["Good curve", "Reliable mana"],
  metrics: {
    creatureCount: 14,
    nonCreatureCount: 9,
    interactionCount: 6,
    cheapPlays: 8,
    expensiveSpells: 3,
    cardDrawCount: 1,
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

async function renderApp() {
  vi.resetModules()
  vi.doUnmock("@/lib/mtg")
  const { default: App } = await import("@/App")
  return render(<App />)
}

async function renderAppWithMockedEvaluation() {
  vi.resetModules()
  vi.doMock("@/lib/mtg", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/mtg")>()
    return {
      ...actual,
      evaluateSealedPool: vi.fn(() => ({
        decks: [mockDeck],
        missingCards: [],
      })),
    }
  })

  const { default: App } = await import("@/App")
  return render(<App />)
}

afterEach(() => {
  vi.doUnmock("@/lib/mtg")
  vi.resetModules()
})

describe("App", () => {
  it("renders the brand name in the topbar", async () => {
    await renderApp()
    expect(screen.getByText(/sealed deck builder/i)).toBeInTheDocument()
  })

  it("disables Evaluate button when no ratings are loaded", async () => {
    await renderApp()
    expect(screen.getByRole("button", { name: /evaluate pool/i })).toBeDisabled()
  })

  it("adds the highlighted quick-add suggestion into the pool text", async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)

    const quickAddInput = screen.getByLabelText(/quick add cards/i)
    fireEvent.change(quickAddInput, { target: { value: "2x harsh ann" } })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add highlighted match/i })).toBeEnabled()
    })

    fireEvent.keyDown(quickAddInput, { key: "Enter" })

    expect(screen.getByLabelText(/raw sealed pool list/i)).toHaveValue("2 Harsh Annotation")
  })

  it("adjusts pool quantities from the pool list", async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)

    const quickAddInput = screen.getByLabelText(/quick add cards/i)
    fireEvent.change(quickAddInput, { target: { value: "harsh ann" } })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add highlighted match/i })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole("button", { name: /Add highlighted match/i }))

    const before = String(
      (screen.getByLabelText(/raw sealed pool list/i) as HTMLTextAreaElement).value,
    )
    const beforeCount = Number(before.match(/^(\d+)\s+Harsh Annotation/m)?.[1] ?? "0")

    fireEvent.click(screen.getByRole("button", { name: /Add one Harsh Annotation/i }))

    const after = String(
      (screen.getByLabelText(/raw sealed pool list/i) as HTMLTextAreaElement).value,
    )
    const afterCount = Number(after.match(/^(\d+)\s+Harsh Annotation/m)?.[1] ?? "0")

    expect(afterCount).toBe(beforeCount + 1)
  })

  it("opens the analyzer in an accessible dialog", async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)

    const analyzerInput = screen.getByPlaceholderText(/search any card/i)
    fireEvent.change(analyzerInput, { target: { value: "Harsh Annotation" } })
    fireEvent.keyDown(analyzerInput, { key: "Enter" })

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(/Harsh Annotation/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Close dialog/i }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("shows quick-search suggestions in the left analyzer widget", async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)
    fireEvent.change(screen.getByPlaceholderText(/search any card/i), {
      target: { value: "stand up" },
    })

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Stand Up for Yourself/i })).toBeInTheDocument()
    })
  })

  it("shows copy feedback after copying a deck list", async () => {
    await renderAppWithMockedEvaluation()

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)
    fireEvent.change(screen.getByLabelText(/raw sealed pool list/i), {
      target: { value: "1 Harsh Annotation" },
    })
    fireEvent.click(screen.getByRole("button", { name: /evaluate pool/i }))

    const copyDeckButton = await screen.findByRole("button", { name: /Copy deck/i })
    fireEvent.click(copyDeckButton)

    await waitFor(() => {
      expect(screen.getByText(/Deck list copied to the clipboard/i)).toBeInTheDocument()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it("shows Scryfall enriched chip after loading a preset", async () => {
    await renderApp()

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)

    await waitFor(() => {
      expect(screen.getByText(/Scryfall enriched/i)).toBeInTheDocument()
    })
  })
})
