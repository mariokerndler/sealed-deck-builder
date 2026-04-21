import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PoolWorkspace } from "@/components/PoolWorkspace"

const baseEntry = {
  inputName: "Last Gasp",
  normalizedName: "lastgasp",
  normalizedAliases: ["lastgasp"],
  quantity: 1,
}

const baseSuggestion = {
  name: "Last Gasp",
  normalizedName: "lastgasp",
  type: "Instant",
  source: "FDN",
}

const baseProps = {
  parsedPoolCount: 0,
  poolText: "",
  setPoolText: vi.fn(),
  quickAddInput: "",
  setQuickAddInput: vi.fn(),
  quickAddCandidatesCount: 0,
  parsedQuickAddQuantity: 1,
  parsedQuickAddQuery: "",
  quickAddSuggestions: [],
  highlightedSuggestionIndex: 0,
  setHighlightedSuggestionIndex: vi.fn(),
  onQuickAdd: vi.fn(),
  onQuickAddKeyDown: vi.fn(),
  parsedPool: [],
  onAdjustPoolEntry: vi.fn(),
  onQuickAddFromPool: vi.fn(),
  onLoadSample: vi.fn(),
  onClearPool: vi.fn(),
  lastAddedCard: null,
}

describe("PoolWorkspace", () => {
  it("renders Quick add cards label", () => {
    render(<PoolWorkspace {...baseProps} />)
    expect(screen.getByLabelText(/quick add cards/i)).toBeInTheDocument()
  })

  it("shows load-a-set alert when quickAddCandidatesCount is 0", () => {
    render(<PoolWorkspace {...baseProps} />)
    expect(screen.getByText(/load a set first/i)).toBeInTheDocument()
  })

  it("shows suggestion items when quickAddCandidatesCount > 0 and suggestions exist", () => {
    render(
      <PoolWorkspace
        {...baseProps}
        quickAddCandidatesCount={248}
        quickAddSuggestions={[baseSuggestion]}
        quickAddInput="last"
        parsedQuickAddQuery="last"
      />,
    )
    expect(screen.getByText("Last Gasp")).toBeInTheDocument()
  })

  it("calls onQuickAdd when Enter is pressed on the input", () => {
    const onQuickAdd = vi.fn()
    render(
      <PoolWorkspace
        {...baseProps}
        quickAddCandidatesCount={248}
        quickAddSuggestions={[baseSuggestion]}
        onQuickAdd={onQuickAdd}
        onQuickAddKeyDown={(e) => {
          if (e.key === "Enter") onQuickAdd()
        }}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText(/quick add cards/i), { key: "Enter" })
    expect(onQuickAdd).toHaveBeenCalledOnce()
  })

  it("renders pool entries", () => {
    render(
      <PoolWorkspace
        {...baseProps}
        parsedPool={[baseEntry]}
        parsedPoolCount={1}
      />,
    )
    expect(screen.getByText("Last Gasp")).toBeInTheDocument()
  })

  it("calls onAdjustPoolEntry with -1 when minus button is clicked", () => {
    const onAdjustPoolEntry = vi.fn()
    render(
      <PoolWorkspace
        {...baseProps}
        parsedPool={[baseEntry]}
        parsedPoolCount={1}
        onAdjustPoolEntry={onAdjustPoolEntry}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /remove one Last Gasp/i }))
    expect(onAdjustPoolEntry).toHaveBeenCalledWith("Last Gasp", -1)
  })

  it("calls onAdjustPoolEntry with +1 when plus button is clicked", () => {
    const onAdjustPoolEntry = vi.fn()
    render(
      <PoolWorkspace
        {...baseProps}
        parsedPool={[baseEntry]}
        parsedPoolCount={1}
        onAdjustPoolEntry={onAdjustPoolEntry}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /add one Last Gasp/i }))
    expect(onAdjustPoolEntry).toHaveBeenCalledWith("Last Gasp", 1)
  })

  it("raw textarea is not visible by default", () => {
    render(<PoolWorkspace {...baseProps} />)
    const textarea = screen.getByLabelText(/raw sealed pool list/i)
    expect(textarea.closest(".overflow-hidden")).toBeInTheDocument()
  })

  it("calls onLoadSample when Load sample button is clicked", () => {
    const onLoadSample = vi.fn()
    render(<PoolWorkspace {...baseProps} onLoadSample={onLoadSample} />)
    fireEvent.click(screen.getByRole("button", { name: /load sample/i }))
    expect(onLoadSample).toHaveBeenCalledOnce()
  })
})
