import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ResultsList } from "@/components/results/ResultsList"

const makeDecks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `deck-${i}`,
    totalScore: 90 - i * 5,
    colors: { base: ["W", "U"] as const, splash: null },
    basicLands: { W: 9, U: 8, B: 0, R: 0, G: 0 },
  })) as any[]

describe("ResultsList", () => {
  it("renders a row for each deck", () => {
    render(<ResultsList results={makeDecks(3)} selectedIndex={0} onSelect={vi.fn()} />)
    expect(screen.getAllByRole("button")).toHaveLength(3)
  })

  it("shows the score for each deck", () => {
    render(<ResultsList results={makeDecks(2)} selectedIndex={0} onSelect={vi.fn()} />)
    expect(screen.getByText("90.0")).toBeInTheDocument()
    expect(screen.getByText("85.0")).toBeInTheDocument()
  })

  it("marks the selected deck as aria-pressed=true", () => {
    render(<ResultsList results={makeDecks(3)} selectedIndex={1} onSelect={vi.fn()} />)
    const buttons = screen.getAllByRole("button")
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false")
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true")
    expect(buttons[2]).toHaveAttribute("aria-pressed", "false")
  })

  it("calls onSelect with the correct index when a deck is clicked", () => {
    const onSelect = vi.fn()
    render(<ResultsList results={makeDecks(3)} selectedIndex={0} onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole("button")[2]!)
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
