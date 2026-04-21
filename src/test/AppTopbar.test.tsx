import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppTopbar } from "@/components/AppTopbar"

const baseProps = {
  totalRatedCards: 0,
  parsedPoolCount: 0,
  scryfallLoaded: false,
  notice: null,
  isEvaluating: false,
  hasRatings: false,
  hasPool: false,
  onEvaluate: vi.fn(),
}

describe("AppTopbar", () => {
  it("renders brand name", () => {
    render(<AppTopbar {...baseProps} />)
    expect(screen.getByText(/sealed deck builder/i)).toBeInTheDocument()
  })

  it("shows No ratings chip when hasRatings is false", () => {
    render(<AppTopbar {...baseProps} />)
    expect(screen.getByText(/no ratings/i)).toBeInTheDocument()
  })

  it("shows card count chip when hasRatings is true", () => {
    render(<AppTopbar {...baseProps} hasRatings totalRatedCards={248} />)
    expect(screen.getByText(/248 cards/i)).toBeInTheDocument()
  })

  it("shows pool count chip when parsedPoolCount > 0", () => {
    render(<AppTopbar {...baseProps} parsedPoolCount={30} />)
    expect(screen.getByText(/30 entries/i)).toBeInTheDocument()
  })

  it("shows Scryfall enriched chip when scryfallLoaded is true", () => {
    render(<AppTopbar {...baseProps} scryfallLoaded />)
    expect(screen.getByText(/scryfall enriched/i)).toBeInTheDocument()
  })

  it("disables Evaluate button when hasRatings is false", () => {
    render(<AppTopbar {...baseProps} hasPool />)
    expect(screen.getByRole("button", { name: /evaluate/i })).toBeDisabled()
  })

  it("disables Evaluate button when hasPool is false", () => {
    render(<AppTopbar {...baseProps} hasRatings />)
    expect(screen.getByRole("button", { name: /evaluate/i })).toBeDisabled()
  })

  it("enables Evaluate button when both hasRatings and hasPool are true", () => {
    render(<AppTopbar {...baseProps} hasRatings hasPool />)
    expect(screen.getByRole("button", { name: /evaluate/i })).toBeEnabled()
  })

  it("calls onEvaluate when Evaluate button is clicked", () => {
    const onEvaluate = vi.fn()
    render(<AppTopbar {...baseProps} hasRatings hasPool onEvaluate={onEvaluate} />)
    fireEvent.click(screen.getByRole("button", { name: /evaluate/i }))
    expect(onEvaluate).toHaveBeenCalledOnce()
  })

  it("shows notice message when notice is provided", () => {
    render(
      <AppTopbar
        {...baseProps}
        notice={{ id: 1, tone: "success", message: "FDN preset loaded." }}
      />,
    )
    expect(screen.getByText("FDN preset loaded.")).toBeInTheDocument()
  })

  it("disables Evaluate button while evaluating", () => {
    render(<AppTopbar {...baseProps} hasRatings hasPool isEvaluating />)
    expect(screen.getByRole("button", { name: /evaluate/i })).toBeDisabled()
  })
})
