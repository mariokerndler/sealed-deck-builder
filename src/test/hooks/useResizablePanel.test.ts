import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useResizablePanel } from "@/hooks/useResizablePanel"

describe("useResizablePanel", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns defaultWidth when localStorage has no entry", () => {
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )
    expect(result.current.width).toBe(360)
  })

  it("initializes from localStorage when a valid number is stored", () => {
    localStorage.setItem("testPanel", "480")
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )
    expect(result.current.width).toBe(480)
  })

  it("falls back to defaultWidth when localStorage value is not a number", () => {
    localStorage.setItem("testPanel", "notanumber")
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )
    expect(result.current.width).toBe(360)
  })

  it("clamps stored value to min when below range", () => {
    localStorage.setItem("testPanel", "100")
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )
    expect(result.current.width).toBe(280)
  })

  it("clamps stored value to max when above range", () => {
    localStorage.setItem("testPanel", "900")
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )
    expect(result.current.width).toBe(600)
  })

  it("persists final width to localStorage on mouseup", () => {
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )

    // Start drag at x=500
    act(() => {
      result.current.handleMouseDown({
        clientX: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent)
    })

    // Move 40px to the left → width should grow by 40: 360 + 40 = 400
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 460 }))
    })

    // End drag
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"))
    })

    expect(result.current.width).toBe(400)
    expect(localStorage.getItem("testPanel")).toBe("400")
  })

  it("clamps width to min during drag", () => {
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )

    act(() => {
      result.current.handleMouseDown({
        clientX: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent)
    })

    // Move 200px to the right → would give 160, but min is 280
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 700 }))
    })

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"))
    })

    expect(result.current.width).toBe(280)
  })

  it("clamps width to max during drag", () => {
    const { result } = renderHook(() =>
      useResizablePanel("testPanel", 360, 280, 600),
    )

    act(() => {
      result.current.handleMouseDown({
        clientX: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent)
    })

    // Move 300px to the left → would give 660, but max is 600
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 }))
    })

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"))
    })

    expect(result.current.width).toBe(600)
  })
})
