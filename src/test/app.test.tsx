import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"

describe("App", () => {
  it("renders the quick-entry pool workflow", () => {
    render(<App />)

    expect(
      screen.getAllByText(/Build the best Sealed deck from your pool/i)[0],
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Quick add cards/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Raw sealed pool list/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Upload your own/i)).toBeInTheDocument()
  })

  it("shows a validation message when evaluating without ratings", () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole("button", { name: /Evaluate pool/i })[0])

    expect(
      screen.getByText(/Upload at least one rating file before evaluating/i),
    ).toBeInTheDocument()
  })

  it("adds the highlighted quick-add suggestion into the pool text", async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)

    const quickAddInput = screen.getByLabelText(/Quick add cards/i)
    fireEvent.change(quickAddInput, { target: { value: "2x harsh ann" } })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add highlighted match/i })).toBeEnabled()
    })

    fireEvent.keyDown(quickAddInput, { key: "Enter" })

    expect(screen.getByLabelText(/Raw sealed pool list/i)).toHaveValue("2 Harsh Annotation")
  })

  it("adjusts pool quantities from the current-pool table", async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole("button", { name: /Secrets of Strixhaven/i })[0]!)

    const quickAddInput = screen.getByLabelText(/Quick add cards/i)
    fireEvent.change(quickAddInput, { target: { value: "harsh ann" } })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add highlighted match/i })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole("button", { name: /Add highlighted match/i }))
    const before = String(
      (screen.getByLabelText(/Raw sealed pool list/i) as HTMLTextAreaElement).value,
    )
    const beforeCount = Number(before.match(/^(\d+)\s+Harsh Annotation/m)?.[1] ?? "0")

    fireEvent.click(screen.getAllByRole("button", { name: /Add one Harsh Annotation/i })[0]!)

    const after = String(
      (screen.getByLabelText(/Raw sealed pool list/i) as HTMLTextAreaElement).value,
    )
    const afterCount = Number(after.match(/^(\d+)\s+Harsh Annotation/m)?.[1] ?? "0")

    expect(afterCount).toBe(beforeCount + 1)
  })
})
