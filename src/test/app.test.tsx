import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"

describe("App", () => {
  it("renders the main sealed-builder workflow", () => {
    render(<App />)

    expect(
      screen.getByText(/Build the best Sealed deck from your pool/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Sealed card pool/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Rating files/i)).toBeInTheDocument()
  })

  it("shows a validation message when evaluating without ratings", () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole("button", { name: /Evaluate pool/i })[0])

    expect(
      screen.getByText(/Upload at least one rating file before evaluating/i),
    ).toBeInTheDocument()
  })
})
