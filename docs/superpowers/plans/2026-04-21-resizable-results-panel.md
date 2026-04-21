# Resizable Results Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Results Panel drag-resizable via a custom handle on its left border, with width persisted to `localStorage`.

**Architecture:** A new `useResizablePanel` hook manages width state and mouse event listeners; `ResultsPanel` imports the hook, applies the width as an inline style, and renders a thin drag handle div. No new dependencies required.

**Tech Stack:** React 19, TypeScript strict, Tailwind v4, Vitest + React Testing Library

---

## File Map

| File | Action |
|------|--------|
| `src/hooks/useResizablePanel.ts` | Create — hook managing width state, drag events, localStorage |
| `src/components/results/ResultsPanel.tsx` | Modify — use hook, swap `w-[360px]` for inline style, add handle div |
| `src/test/results/ResultsPanel.test.tsx` | Modify — add drag persistence test |

---

### Task 1: `useResizablePanel` hook

**Files:**
- Create: `src/hooks/useResizablePanel.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/hooks/useResizablePanel.test.ts` with this content:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/test/hooks/useResizablePanel.test.ts
```

Expected: FAIL — `Cannot find module '@/hooks/useResizablePanel'`

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useResizablePanel.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react"

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readFromStorage(key: string, defaultWidth: number, min: number, max: number): number {
  const stored = localStorage.getItem(key)
  if (stored === null) return defaultWidth
  const parsed = Number(stored)
  if (!Number.isFinite(parsed)) return defaultWidth
  return clamp(parsed, min, max)
}

export function useResizablePanel(
  key: string,
  defaultWidth: number,
  min: number,
  max: number,
): { width: number; handleMouseDown: React.MouseEventHandler } {
  const [width, setWidth] = useState(() => readFromStorage(key, defaultWidth, min, max))
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragState.current = { startX: e.clientX, startWidth: width }
    },
    [width],
  )

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragState.current === null) return
      const delta = dragState.current.startX - e.clientX
      setWidth(clamp(dragState.current.startWidth + delta, min, max))
    }

    function onMouseUp() {
      if (dragState.current === null) return
      dragState.current = null
      setWidth((current) => {
        localStorage.setItem(key, String(current))
        return current
      })
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [key, min, max])

  return { width, handleMouseDown }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/test/hooks/useResizablePanel.test.ts
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useResizablePanel.ts src/test/hooks/useResizablePanel.test.ts
git commit -m "feat: add useResizablePanel hook with localStorage persistence"
```

---

### Task 2: Wire hook into ResultsPanel + add drag handle

**Files:**
- Modify: `src/components/results/ResultsPanel.tsx:1-36`
- Modify: `src/test/results/ResultsPanel.test.tsx` (add one test)

- [ ] **Step 1: Add the drag persistence test to the existing test file**

Open `src/test/results/ResultsPanel.test.tsx`. Add this test inside the `describe("ResultsPanel", ...)` block, after the last existing `it(...)`:

```ts
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
```

Also add `fireEvent` to the import at the top of the file:

```ts
import { fireEvent, render, screen } from "@testing-library/react"
```

- [ ] **Step 2: Run the new test to verify it fails**

```bash
pnpm vitest run src/test/results/ResultsPanel.test.tsx
```

Expected: the new "persists width" test FAILS — no `resize-handle` testid found

- [ ] **Step 3: Update ResultsPanel to use the hook and render the drag handle**

Replace the entire content of `src/components/results/ResultsPanel.tsx` with:

```tsx
import { InfoIcon, WandSparklesIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { type RankedDeckResult } from "@/lib/mtg"
import { useResizablePanel } from "@/hooks/useResizablePanel"
import { ResultsList } from "./ResultsList"
import { ResultsDetail } from "./ResultsDetail"

type ResultsPanelProps = {
  isEvaluating: boolean
  results: RankedDeckResult[]
  missingCards: string[]
  selectedDeckIndex: number
  onSelectDeck: (index: number) => void
  copiedDeckId: string | null
  onCopyDeck: (deck: RankedDeckResult) => void
  onCopyMana: (deck: RankedDeckResult) => void
  onAnalyzeCard: (cardName: string) => void
  scryfallLoaded: boolean
}

export function ResultsPanel({
  isEvaluating,
  results,
  missingCards,
  selectedDeckIndex,
  onSelectDeck,
  copiedDeckId,
  onCopyDeck,
  onCopyMana,
  onAnalyzeCard,
  scryfallLoaded,
}: ResultsPanelProps) {
  const { width, handleMouseDown } = useResizablePanel("resultsPanelWidth", 360, 280, 600)
  const selectedDeck = results[selectedDeckIndex] ?? results[0]

  return (
    <div
      className="relative flex shrink-0 flex-col overflow-hidden border-l border-[var(--color-paper-line)] bg-white"
      style={{ width }}
    >
      <div
        data-testid="resize-handle"
        onMouseDown={handleMouseDown}
        className="absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize hover:bg-black/10 active:bg-black/20"
      />

      {missingCards.length > 0 ? (
        <Alert className="shrink-0 rounded-none border-x-0 border-t-0 border-stone-300 bg-stone-100 py-2">
          <InfoIcon className="size-3.5" />
          <AlertTitle className="text-[10px]">Missing from the combined rating files</AlertTitle>
          <AlertDescription className="text-[9px]">
            {missingCards.slice(0, 6).join(", ")}
            {missingCards.length > 6 ? `…+${missingCards.length - 6} more` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {isEvaluating ? (
        <div className="flex flex-col gap-3 p-4" aria-live="polite" data-testid="evaluating-skeletons">
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--color-paper-line-strong)] bg-[var(--color-paper-pane)] p-8 text-center">
            <WandSparklesIcon className="size-8 text-[var(--color-muted-ink)]" />
            <div>
              <p className="text-[12px] font-semibold text-[var(--color-ink)]">No ranked decks yet</p>
              <p className="mt-1 text-[10px] text-[var(--color-muted-ink)]">
                Load ratings, enter your pool, then hit Evaluate.
              </p>
            </div>
            <p className="text-[10px] text-[var(--color-muted-ink)]">
              The evaluator ranks realistic Sealed builds: mono where viable, two-color defaults,
              and careful light splashes.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ResultsList
            results={results}
            selectedIndex={selectedDeckIndex}
            onSelect={onSelectDeck}
          />
          {selectedDeck ? (
            <ResultsDetail
              deck={selectedDeck}
              index={selectedDeckIndex}
              copiedDeckId={copiedDeckId}
              onCopyDeck={onCopyDeck}
              onCopyMana={onCopyMana}
              onAnalyzeCard={onAnalyzeCard}
              scryfallLoaded={scryfallLoaded}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function ResultSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-paper-line)] bg-white/85">
      <div className="space-y-3 border-b border-[var(--color-paper-line)] px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-4 w-10 rounded-full" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="h-7 w-32 rounded-xl" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-4/5 rounded-full" />
      </div>
      <div className="space-y-2 px-4 py-3">
        <Skeleton className="h-8 w-44 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run all ResultsPanel tests**

```bash
pnpm vitest run src/test/results/ResultsPanel.test.tsx
```

Expected: all 5 tests PASS (4 existing + 1 new)

- [ ] **Step 5: Run the full test suite**

```bash
pnpm test
```

Expected: all tests PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add src/components/results/ResultsPanel.tsx src/test/results/ResultsPanel.test.tsx
git commit -m "feat: make Results Panel drag-resizable with localStorage persistence"
```
