import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppSidebar } from "@/components/AppSidebar"
import { RATING_PRESETS } from "@/lib/ratings/presets"

const baseProps = {
  ratingFiles: [],
  mergedRatingsSize: 0,
  fileErrors: [],
  conflicts: [],
  onLoadPreset: vi.fn(),
  onFileUpload: vi.fn(),
  onReset: vi.fn(),
  scryfallSource: null as "preset" | "fetched" | null,
  scryfallDataSize: 0,
  isFetchingScryfall: false,
  scryfallProgress: null,
  onFetchCardData: vi.fn(),
  scryfallErrors: [],
  parsedPoolCount: 0,
  analyzerSearch: "",
  setAnalyzerSearch: vi.fn(),
  analyzerChips: [],
  matchedPoolCount: 0,
  onAnalyze: vi.fn(),
}

describe("AppSidebar", () => {
  it("renders a button for each rating preset", () => {
    render(<AppSidebar {...baseProps} />)
    for (const preset of RATING_PRESETS) {
      expect(screen.getByRole("button", { name: new RegExp(preset.name, "i") })).toBeInTheDocument()
    }
  })

  it("calls onLoadPreset with the correct preset when clicked", () => {
    const onLoadPreset = vi.fn()
    render(<AppSidebar {...baseProps} onLoadPreset={onLoadPreset} />)
    fireEvent.click(screen.getByRole("button", { name: new RegExp(RATING_PRESETS[0]!.name, "i") }))
    expect(onLoadPreset).toHaveBeenCalledWith(RATING_PRESETS[0])
  })

  it("disables a preset button when that file is already loaded", () => {
    const loaded = { fileName: RATING_PRESETS[0]!.name, cards: [], conflicts: [] }
    render(<AppSidebar {...baseProps} ratingFiles={[loaded] as any} />)
    expect(
      screen.getByRole("button", { name: new RegExp(RATING_PRESETS[0]!.name, "i") }),
    ).toBeDisabled()
  })

  it("renders a loaded file row with card count", () => {
    const loaded = { fileName: "MySet.js", cards: new Array(120), conflicts: [] }
    render(<AppSidebar {...baseProps} ratingFiles={[loaded] as any} mergedRatingsSize={120} />)
    expect(screen.getByText("MySet.js")).toBeInTheDocument()
    expect(screen.getByText(/120 cards/i)).toBeInTheDocument()
  })

  it("shows Fetch card data button when scryfallSource is null and pool has entries", () => {
    render(<AppSidebar {...baseProps} parsedPoolCount={10} />)
    expect(screen.getByRole("button", { name: /fetch card data/i })).toBeInTheDocument()
  })

  it("shows bundled data status when scryfallSource is preset", () => {
    render(<AppSidebar {...baseProps} scryfallSource="preset" />)
    expect(screen.getByText(/bundled data ready/i)).toBeInTheDocument()
  })

  it("calls onFetchCardData when Fetch button is clicked", () => {
    const onFetchCardData = vi.fn()
    render(<AppSidebar {...baseProps} parsedPoolCount={10} onFetchCardData={onFetchCardData} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch card data/i }))
    expect(onFetchCardData).toHaveBeenCalledOnce()
  })

  it("renders analyzer chips for pool cards", () => {
    render(<AppSidebar {...baseProps} analyzerChips={["Last Gasp", "Firedancer"]} />)
    expect(screen.getByText("Last Gasp")).toBeInTheDocument()
    expect(screen.getByText("Firedancer")).toBeInTheDocument()
  })

  it("calls onAnalyze with chip name when chip is clicked", () => {
    const onAnalyze = vi.fn()
    render(<AppSidebar {...baseProps} analyzerChips={["Last Gasp"]} onAnalyze={onAnalyze} />)
    fireEvent.click(screen.getByText("Last Gasp"))
    expect(onAnalyze).toHaveBeenCalledWith("Last Gasp")
  })

  it("calls onAnalyze when Enter is pressed in analyzer search", () => {
    const onAnalyze = vi.fn()
    render(<AppSidebar {...baseProps} analyzerSearch="Harsh Annotation" onAnalyze={onAnalyze} />)
    fireEvent.keyDown(screen.getByPlaceholderText(/search any card/i), { key: "Enter" })
    expect(onAnalyze).toHaveBeenCalledWith("Harsh Annotation")
  })
})
