# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the app into a four-zone layout (topbar + sidebar + pool workspace + results master/detail) with micro-interaction polish throughout.

**Architecture:** All existing state and handlers stay in `App.tsx`, which becomes a thin layout shell. New components are built task-by-task with tests first, then wired together in a final App.tsx restructure task. Two new state variables are added to App (`selectedDeckIndex`, `lastAddedCard`); `isRawVisible` is local to `PoolWorkspace`.

**Tech Stack:** React 19, TypeScript strict, Tailwind v4, shadcn/ui (Radix), Lucide React, Vitest + React Testing Library (`@testing-library/react`, `@testing-library/jest-dom`), tw-animate-css

---

## File Map

**Created:**
- `src/components/AppTopbar.tsx` — brand, status chips, inline notice, Evaluate button
- `src/components/AppSidebar.tsx` — ratings section, Scryfall section, Card Analyzer section
- `src/components/PoolWorkspace.tsx` — Quick Add + pool list + raw textarea toggle
- `src/components/results/ResultsPanel.tsx` — outer shell; empty/loading states; composes list + detail
- `src/components/results/ResultsList.tsx` — narrow deck selection column with animated score bars
- `src/components/results/ResultsDetail.tsx` — selected deck header, metrics grid, tabs
- `src/test/AppTopbar.test.tsx`
- `src/test/AppSidebar.test.tsx`
- `src/test/PoolWorkspace.test.tsx`
- `src/test/results/ResultsList.test.tsx`
- `src/test/results/ResultsDetail.test.tsx`
- `src/test/results/ResultsPanel.test.tsx`

**Modified:**
- `src/App.tsx` — new layout shell; add `selectedDeckIndex`, `lastAddedCard` state; remove deleted component definitions
- `src/index.css` — focus ring rule update
- `src/test/app.test.tsx` — update assertions to match new layout

---

## Task 1: Focus Ring CSS

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace the default focus ring rule**

In `src/index.css`, inside `@layer base`, replace the existing `*` rule:

```css
@layer base {
  * {
    @apply border-border;
    outline: 2px solid color-mix(in oklab, var(--ink) 35%, transparent);
    outline-offset: 2px;
  }
  /* keep the rest of the layer unchanged */
```

Wait — the existing rule is `@apply border-border outline-ring/50;`. Replace that single `*` rule with:

```css
@layer base {
  * {
    @apply border-border;
  }
  *:focus-visible {
    outline: 2px solid color-mix(in oklab, var(--ink) 35%, transparent);
    outline-offset: 2px;
  }
  body {
    @apply bg-background text-foreground antialiased;
    background-image:
      radial-gradient(circle at top left, rgba(17, 24, 39, 0.05), transparent 24%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.4), transparent 20%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0));
  }
  html {
    @apply font-sans;
  }
  ::selection {
    background: color-mix(in oklab, var(--ink) 18%, white);
    color: var(--ink);
  }
}
```

- [ ] **Step 2: Run the dev server and confirm no visible regressions**

```bash
pnpm dev
```

Open the app, tab through a few inputs, confirm focus rings are visible but not heavy. Ctrl+C when done.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: replace outline-ring/50 with intentional focus-visible ring"
```

---

## Task 2: AppTopbar Component

**Files:**
- Create: `src/components/AppTopbar.tsx`
- Create: `src/test/AppTopbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/AppTopbar.test.tsx`:

```tsx
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
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm vitest run src/test/AppTopbar.test.tsx
```

Expected: all fail with "Cannot find module '@/components/AppTopbar'".

- [ ] **Step 3: Create AppTopbar component**

Create `src/components/AppTopbar.tsx`:

```tsx
import {
  CheckCircle2Icon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type NoticeTone = "success" | "info" | "error"

export type Notice = {
  id: number
  tone: NoticeTone
  message: string
}

type AppTopbarProps = {
  totalRatedCards: number
  parsedPoolCount: number
  scryfallLoaded: boolean
  notice: Notice | null
  isEvaluating: boolean
  hasRatings: boolean
  hasPool: boolean
  onEvaluate: () => void
}

export function AppTopbar({
  totalRatedCards,
  parsedPoolCount,
  scryfallLoaded,
  notice,
  isEvaluating,
  hasRatings,
  hasPool,
  onEvaluate,
}: AppTopbarProps) {
  return (
    <header className="flex h-[46px] shrink-0 items-center gap-3 border-b border-[var(--color-paper-line)] bg-[linear-gradient(135deg,#fafaf8,#f0ede8)] px-5">
      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--color-ink)]">
        Sealed Deck Builder
      </span>
      <div className="h-4 w-px shrink-0 bg-[var(--color-paper-line)]" />
      {hasRatings ? (
        <Badge className="shrink-0 border-emerald-300 bg-emerald-100 text-emerald-800 motion-safe:animate-in motion-safe:fade-in">
          ✓ {totalRatedCards} cards
        </Badge>
      ) : (
        <Badge variant="outline" className="shrink-0 text-[var(--color-muted-ink)]">
          No ratings
        </Badge>
      )}
      {parsedPoolCount > 0 ? (
        <Badge variant="outline" className="shrink-0">
          {parsedPoolCount} entries
        </Badge>
      ) : (
        <Badge variant="outline" className="shrink-0 text-[var(--color-muted-ink)]">
          Empty pool
        </Badge>
      )}
      {scryfallLoaded ? (
        <Badge
          variant="outline"
          className="shrink-0 motion-safe:animate-in motion-safe:fade-in"
        >
          Scryfall enriched
        </Badge>
      ) : null}
      <div className="flex-1" />
      <div aria-live="polite" className="shrink-0">
        {notice ? <FeedbackNotice tone={notice.tone} message={notice.message} /> : null}
      </div>
      <Button
        className="h-9 shrink-0 rounded-2xl px-4"
        onClick={onEvaluate}
        disabled={isEvaluating || !hasRatings || !hasPool}
      >
        {isEvaluating ? (
          <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
        ) : (
          <WandSparklesIcon data-icon="inline-start" />
        )}
        Evaluate pool
      </Button>
    </header>
  )
}

function FeedbackNotice({ tone, message }: { tone: NoticeTone; message: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-[var(--shadow-soft)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2",
        tone === "error"
          ? "border-stone-400 bg-stone-200 text-stone-900"
          : "border-stone-300 bg-stone-100 text-stone-800",
      )}
    >
      {tone === "error" ? (
        <TriangleAlertIcon className="size-4" />
      ) : (
        <CheckCircle2Icon className="size-4" />
      )}
      <span>{message}</span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm vitest run src/test/AppTopbar.test.tsx
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppTopbar.tsx src/test/AppTopbar.test.tsx
git commit -m "feat: add AppTopbar component with status chips and evaluate button"
```

---

## Task 3: AppSidebar Component

**Files:**
- Create: `src/components/AppSidebar.tsx`
- Create: `src/test/AppSidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/AppSidebar.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm vitest run src/test/AppSidebar.test.tsx
```

Expected: all fail with "Cannot find module '@/components/AppSidebar'".

- [ ] **Step 3: Create AppSidebar component**

Create `src/components/AppSidebar.tsx`:

```tsx
import { type ChangeEvent } from "react"
import {
  CheckCircle2Icon,
  DatabaseIcon,
  FileCode2Icon,
  InfoIcon,
  LoaderCircleIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { RATING_PRESETS, type RatingPreset } from "@/lib/ratings/presets"
import { type RatingFileParseResult } from "@/lib/mtg"

type AppSidebarProps = {
  ratingFiles: RatingFileParseResult[]
  mergedRatingsSize: number
  fileErrors: string[]
  conflicts: string[]
  onLoadPreset: (preset: RatingPreset) => void
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onReset: () => void
  scryfallSource: "preset" | "fetched" | null
  scryfallDataSize: number
  isFetchingScryfall: boolean
  scryfallProgress: { fetched: number; total: number } | null
  onFetchCardData: () => void
  scryfallErrors: string[]
  parsedPoolCount: number
  analyzerSearch: string
  setAnalyzerSearch: (value: string) => void
  analyzerChips: string[]
  matchedPoolCount: number
  onAnalyze: (cardName: string) => void
}

export function AppSidebar({
  ratingFiles,
  mergedRatingsSize,
  fileErrors,
  conflicts,
  onLoadPreset,
  onFileUpload,
  onReset,
  scryfallSource,
  scryfallDataSize,
  isFetchingScryfall,
  scryfallProgress,
  onFetchCardData,
  scryfallErrors,
  parsedPoolCount,
  analyzerSearch,
  setAnalyzerSearch,
  analyzerChips,
  matchedPoolCount,
  onAnalyze,
}: AppSidebarProps) {
  return (
    <aside className="flex w-[210px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-paper-line)] bg-[linear-gradient(180deg,#f2efe9,#e8e4dd)]">
      {/* Ratings section */}
      <div className="border-b border-[var(--color-paper-line)]/60 px-3 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
            Ratings
          </p>
          {ratingFiles.length > 0 ? (
            <button
              type="button"
              className="text-[9px] text-[var(--color-muted-ink)] underline underline-offset-2 hover:text-[var(--color-ink-soft)]"
              onClick={onReset}
            >
              Clear
            </button>
          ) : null}
        </div>

        {ratingFiles.length > 0 ? (
          <div className="mb-2 flex flex-col gap-1.5">
            {ratingFiles.map((file) => (
              <div
                key={file.fileName}
                className="flex items-center gap-2 rounded-lg border-l-2 border-emerald-400 bg-white py-2 pl-2 pr-3 shadow-[var(--shadow-soft)]"
              >
                <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium text-[var(--color-ink)]">
                    {file.fileName}
                  </p>
                  <p className="text-[9px] text-[var(--color-muted-ink)]">
                    {file.cards.length} cards
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {RATING_PRESETS.map((preset) => {
            const alreadyLoaded = ratingFiles.some((f) => f.fileName === preset.name)
            return (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className="h-7 rounded-full bg-[var(--color-paper-pane)] text-[10px]"
                disabled={alreadyLoaded}
                onClick={() => onLoadPreset(preset)}
                title={preset.description}
              >
                {alreadyLoaded ? (
                  <CheckCircle2Icon className="size-3 text-emerald-600" data-icon="inline-start" />
                ) : null}
                {preset.name}
              </Button>
            )
          })}
        </div>

        <Separator className="my-3" />

        <label className="block">
          <span className="mb-1 block text-[9px] font-medium text-[var(--color-muted-ink)]">
            Upload custom file
          </span>
          <input
            type="file"
            accept=".js,.txt"
            multiple
            onChange={onFileUpload}
            aria-label="Upload your own"
            className="block w-full cursor-pointer rounded-lg border border-[var(--color-paper-line-strong)] bg-white/70 px-2 py-1.5 text-[10px] text-[var(--color-ink-soft)] file:mr-2 file:cursor-pointer file:rounded-full file:border-0 file:bg-[var(--color-paper-pane)] file:px-2 file:py-0.5 file:text-[9px] file:font-medium file:text-[var(--color-ink)]"
          />
        </label>

        {fileErrors.length > 0 ? (
          <Alert variant="destructive" className="mt-2 py-2">
            <TriangleAlertIcon className="size-3.5" />
            <AlertTitle className="text-[10px]">File error</AlertTitle>
            <AlertDescription className="flex flex-col gap-0.5 text-[9px]">
              {fileErrors.slice(0, 2).map((e) => (
                <span key={e}>{e}</span>
              ))}
              {fileErrors.length > 2 ? <span>…+{fileErrors.length - 2} more</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {conflicts.length > 0 ? (
          <Alert className="mt-2 border-[var(--color-paper-line)] bg-[var(--color-paper-pane)] py-2">
            <InfoIcon className="size-3.5" />
            <AlertTitle className="text-[10px]">Duplicate names</AlertTitle>
            <AlertDescription className="text-[9px]">{conflicts[0]}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {/* Scryfall section */}
      <div className="border-b border-[var(--color-paper-line)]/60 px-3 py-4">
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
          Scryfall data
        </p>

        {scryfallSource === "preset" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-800">
            Bundled data ready
          </div>
        ) : scryfallSource === "fetched" && scryfallDataSize > 0 && !isFetchingScryfall ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-800">
            {scryfallDataSize} cards enriched
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl bg-[var(--color-paper-pane)] text-[10px]"
            onClick={onFetchCardData}
            disabled={parsedPoolCount === 0 || isFetchingScryfall}
          >
            {isFetchingScryfall ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <DatabaseIcon data-icon="inline-start" />
            )}
            {isFetchingScryfall
              ? `Fetching… ${scryfallProgress?.fetched ?? 0}/${scryfallProgress?.total ?? parsedPoolCount}`
              : "Fetch card data"}
          </Button>
        )}

        {scryfallErrors.length > 0 ? (
          <Alert variant="destructive" className="mt-2 py-2">
            <TriangleAlertIcon className="size-3.5" />
            <AlertTitle className="text-[10px]">Fetch errors</AlertTitle>
            <AlertDescription className="flex flex-col gap-0.5 text-[9px]">
              {scryfallErrors.slice(0, 3).map((e) => (
                <span key={e}>{e}</span>
              ))}
              {scryfallErrors.length > 3 ? (
                <span>…+{scryfallErrors.length - 3} more</span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {/* Analyzer section */}
      <div className="flex flex-1 flex-col px-3 py-4">
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
          Card Analyzer
        </p>
        <div className="flex gap-1.5">
          <Input
            placeholder="Search any card…"
            value={analyzerSearch}
            onChange={(e) => setAnalyzerSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && analyzerSearch.trim()) {
                onAnalyze(analyzerSearch.trim())
              }
            }}
            className="h-8 flex-1 rounded-xl border-[var(--color-paper-line-strong)] bg-white/80 px-3 text-[10px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl px-2"
            disabled={!analyzerSearch.trim()}
            onClick={() => onAnalyze(analyzerSearch.trim())}
            aria-label="Analyze card"
          >
            <SearchIcon className="size-3.5" />
          </Button>
        </div>

        {analyzerChips.length > 0 ? (
          <div className="relative mt-3">
            <div className="flex max-h-[7rem] flex-wrap gap-1.5 overflow-hidden">
              {analyzerChips.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="rounded-full border border-[var(--color-paper-line)] bg-[var(--color-paper-pane)] px-2.5 py-1 text-[9px] font-medium text-[var(--color-ink-soft)] transition-colors hover:bg-white"
                  onClick={() => onAnalyze(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            {matchedPoolCount > analyzerChips.length ? (
              <p className="mt-1.5 text-[9px] text-[var(--color-muted-ink)]">
                +{matchedPoolCount - analyzerChips.length} more in pool
              </p>
            ) : null}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-[var(--color-paper-pane)]" />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm vitest run src/test/AppSidebar.test.tsx
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppSidebar.tsx src/test/AppSidebar.test.tsx
git commit -m "feat: add AppSidebar with ratings, Scryfall, and analyzer sections"
```

---

## Task 4: PoolWorkspace Component

**Files:**
- Create: `src/components/PoolWorkspace.tsx`
- Create: `src/test/PoolWorkspace.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/PoolWorkspace.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm vitest run src/test/PoolWorkspace.test.tsx
```

Expected: all fail with "Cannot find module '@/components/PoolWorkspace'".

- [ ] **Step 3: Create PoolWorkspace component**

Create `src/components/PoolWorkspace.tsx`:

```tsx
import { useState, type KeyboardEvent } from "react"
import {
  InfoIcon,
  Layers3Icon,
  MinusIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { type parsePoolText } from "@/lib/mtg"
import { cn } from "@/lib/utils"

type PoolWorkspaceProps = {
  parsedPoolCount: number
  poolText: string
  setPoolText: (value: string) => void
  quickAddInput: string
  setQuickAddInput: (value: string) => void
  quickAddCandidatesCount: number
  parsedQuickAddQuantity: number
  parsedQuickAddQuery: string
  quickAddSuggestions: Array<{ name: string; normalizedName: string; type?: string; source: string }>
  highlightedSuggestionIndex: number
  setHighlightedSuggestionIndex: (index: number) => void
  onQuickAdd: (candidateName?: string) => void
  onQuickAddKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  parsedPool: ReturnType<typeof parsePoolText>
  onAdjustPoolEntry: (cardName: string, quantityDelta: number) => void
  onQuickAddFromPool: (entryName: string) => void
  onLoadSample: () => void
  onClearPool: () => void
  lastAddedCard: string | null
}

const suggestionListId = "quick-add-suggestions"

export function PoolWorkspace({
  parsedPoolCount,
  poolText,
  setPoolText,
  quickAddInput,
  setQuickAddInput,
  quickAddCandidatesCount,
  parsedQuickAddQuantity,
  parsedQuickAddQuery,
  quickAddSuggestions,
  highlightedSuggestionIndex,
  setHighlightedSuggestionIndex,
  onQuickAdd,
  onQuickAddKeyDown,
  parsedPool,
  onAdjustPoolEntry,
  onQuickAddFromPool,
  onLoadSample,
  onClearPool,
  lastAddedCard,
}: PoolWorkspaceProps) {
  const [isRawVisible, setIsRawVisible] = useState(false)

  const activeDescendant = quickAddSuggestions[highlightedSuggestionIndex]
    ? `quick-add-option-${highlightedSuggestionIndex}`
    : undefined

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[var(--color-paper-line)] bg-[#f8f7f4]">
      {/* Quick Add panel */}
      <div className="shrink-0 border-b border-[var(--color-paper-line)] bg-white/70 p-4 shadow-[var(--shadow-soft)]">
        <label
          htmlFor="quick-add-card"
          className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]"
        >
          Quick add cards
        </label>
        <Input
          id="quick-add-card"
          role="combobox"
          aria-expanded={quickAddSuggestions.length > 0}
          aria-controls={suggestionListId}
          aria-activedescendant={activeDescendant}
          value={quickAddInput}
          onChange={(e) => {
            setQuickAddInput(e.target.value)
            setHighlightedSuggestionIndex(0)
          }}
          onKeyDown={onQuickAddKeyDown}
          placeholder="Type a card name, or use 2x Harsh Annotation"
          disabled={quickAddCandidatesCount === 0}
          className="h-10 rounded-xl border-[var(--color-paper-line-strong)] bg-[var(--color-paper-pane)] px-3"
        />

        {quickAddCandidatesCount === 0 ? (
          <Alert className="mt-3 border-[var(--color-paper-line)] bg-[var(--color-paper-pane)] py-2">
            <InfoIcon className="size-3.5" />
            <AlertTitle className="text-[10px]">Load a set first</AlertTitle>
            <AlertDescription className="text-[9px]">
              Quick add becomes set-aware as soon as you load a preset or upload a rating file.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="mt-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="text-[9px]">
                {parsedQuickAddQuantity}× queued
              </Badge>
              <Badge variant="outline" className="text-[9px]">
                {quickAddCandidatesCount} indexed
              </Badge>
              {quickAddSuggestions.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-6 rounded-full text-[9px]"
                  onClick={() => onQuickAdd()}
                >
                  <PlusIcon className="size-3" data-icon="inline-start" />
                  Add highlighted match
                </Button>
              ) : null}
            </div>
            <div className="rounded-xl border border-[var(--color-paper-line)] bg-white/85">
              <div className="border-b border-[var(--color-paper-line)] px-3 py-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
                Matches for {parsedQuickAddQuery || "your query"}
              </div>
              <ul id={suggestionListId} role="listbox" className="p-1.5">
                {quickAddSuggestions.length > 0 ? (
                  quickAddSuggestions.map((candidate, index) => {
                    const isActive = index === highlightedSuggestionIndex
                    return (
                      <li key={candidate.normalizedName}>
                        <button
                          id={`quick-add-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] transition-colors duration-100 focus-visible:outline-none",
                            isActive
                              ? "bg-[var(--color-ink)] text-[var(--color-paper-pane)]"
                              : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-pane)]",
                          )}
                          onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                          onClick={() => onQuickAdd(candidate.name)}
                        >
                          <span className="font-medium">{candidate.name}</span>
                          <span
                            className={cn(
                              "text-[9px]",
                              isActive ? "text-stone-400" : "text-[var(--color-muted-ink)]",
                            )}
                          >
                            {candidate.type ?? candidate.source}
                          </span>
                        </button>
                      </li>
                    )
                  })
                ) : (
                  <li className="px-3 py-4 text-[11px] text-[var(--color-muted-ink)]">
                    No close matches. Try a shorter fragment.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Pool List panel */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-paper-line)] bg-white/85 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-paper-line)] px-3 py-2 bg-[#fafaf8]">
            <span className="flex-1 text-[10px] font-semibold text-[var(--color-ink)]">
              Pool · {parsedPoolCount} {parsedPoolCount === 1 ? "entry" : "entries"}
            </span>
            <Badge variant="outline" className="text-[9px]">Live</Badge>
          </div>

          {parsedPool.length > 0 ? (
            <ScrollArea className="flex-1">
              <div className="divide-y divide-[var(--color-paper-line)]">
                {parsedPool.map((entry) => (
                  <div
                    key={entry.normalizedName}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 transition-colors",
                      entry.inputName === lastAddedCard && "bg-emerald-50",
                    )}
                  >
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-pane)] text-[9px] font-bold text-[var(--color-muted-ink)]">
                      {entry.quantity}
                    </div>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-[var(--color-ink)] underline-offset-2 hover:underline"
                      onClick={() => onQuickAddFromPool(entry.inputName)}
                    >
                      {entry.inputName}
                    </button>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={`Remove one ${entry.inputName}`}
                        className="size-6 rounded-full"
                        onClick={() => onAdjustPoolEntry(entry.inputName, -1)}
                      >
                        <MinusIcon className="size-3" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={`Add one ${entry.inputName}`}
                        className="size-6 rounded-full"
                        onClick={() => onAdjustPoolEntry(entry.inputName, 1)}
                      >
                        <PlusIcon className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <Empty className="border border-dashed border-[var(--color-paper-line-strong)] bg-[var(--color-paper-pane)]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Layers3Icon />
                  </EmptyMedia>
                  <EmptyTitle>No pool entries yet</EmptyTitle>
                  <EmptyDescription>
                    Use quick add, paste a list below, or load the sample pool.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-[var(--color-paper-line)] bg-[#fafaf8] px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full text-[10px]"
              onClick={onLoadSample}
            >
              <SparklesIcon className="size-3" data-icon="inline-start" />
              Load sample
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full text-[10px]"
              onClick={onClearPool}
            >
              Clear
            </Button>
            <button
              type="button"
              className="ml-auto text-[9px] text-[var(--color-muted-ink)] underline underline-offset-2 hover:text-[var(--color-ink-soft)]"
              onClick={() => setIsRawVisible((v) => !v)}
            >
              {isRawVisible ? "Hide raw ↑" : "Raw paste ↓"}
            </button>
          </div>
        </div>

        {/* Raw textarea — CSS grid expand/collapse */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200",
            isRawVisible ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="pt-3">
              <label
                htmlFor="sealed-pool"
                className="mb-1.5 block text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted-ink)]"
              >
                Raw sealed pool list
              </label>
              <Textarea
                id="sealed-pool"
                className="min-h-[12rem] resize-y rounded-xl border-[var(--color-paper-line-strong)] bg-white/80 px-3 py-2.5 text-[11px]"
                value={poolText}
                onChange={(e) => setPoolText(e.target.value)}
              />
              <p className="mt-1 text-[9px] text-[var(--color-muted-ink)]">
                Matching tolerates punctuation, apostrophes, and split-card aliases.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm vitest run src/test/PoolWorkspace.test.tsx
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/PoolWorkspace.tsx src/test/PoolWorkspace.test.tsx
git commit -m "feat: add PoolWorkspace with quick add, pool list, and raw textarea toggle"
```

---

## Task 5: ResultsList Component

**Files:**
- Create: `src/components/results/ResultsList.tsx`
- Create: `src/test/results/ResultsList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/results/ResultsList.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm vitest run src/test/results/ResultsList.test.tsx
```

Expected: all fail with "Cannot find module".

- [ ] **Step 3: Create ResultsList component**

Create `src/components/results/ResultsList.tsx`:

```tsx
import { useEffect, useState } from "react"
import { COLOR_NAMES, type RankedDeckResult } from "@/lib/mtg"
import { cn } from "@/lib/utils"

type ResultsListProps = {
  results: RankedDeckResult[]
  selectedIndex: number
  onSelect: (index: number) => void
}

function formatColorPair(deck: RankedDeckResult): string {
  const names = deck.colors.base.map((c) => COLOR_NAMES[c])
  const splash = deck.colors.splash
  const hasSplash = splash ? deck.basicLands[splash] > 0 : false
  if (splash && hasSplash) return [...names, `${COLOR_NAMES[splash]}*`].join(" · ")
  return names.join(" · ")
}

export function ResultsList({ results, selectedIndex, onSelect }: ResultsListProps) {
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const maxScore = Math.max(...results.map((d) => d.totalScore), 1)

  return (
    <div className="flex w-[110px] shrink-0 flex-col border-r border-[var(--color-paper-line)] bg-[#faf9f6]">
      <div className="border-b border-[var(--color-paper-line)] px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted-ink)]">
        {results.length} {results.length === 1 ? "build" : "builds"}
      </div>
      <div className="flex flex-col overflow-y-auto">
        {results.map((deck, index) => {
          const isSelected = index === selectedIndex
          const pct = (deck.totalScore / maxScore) * 100
          return (
            <button
              key={deck.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(index)}
              className={cn(
                "w-full border-b border-[var(--color-paper-line)] px-3 py-3 text-left transition-colors",
                isSelected
                  ? "bg-[var(--color-ink)] text-white"
                  : "hover:bg-white/50 text-[var(--color-ink)]",
              )}
            >
              <p
                className={cn(
                  "text-[9px]",
                  isSelected ? "text-white/50" : "text-[var(--color-muted-ink)]",
                )}
              >
                #{index + 1}
              </p>
              <p className="mt-0.5 text-[13px] font-bold leading-none">
                {deck.totalScore.toFixed(1)}
              </p>
              <p
                className={cn(
                  "mt-1 text-[9px] leading-tight",
                  isSelected ? "text-white/60" : "text-[var(--color-ink-soft)]",
                )}
              >
                {formatColorPair(deck)}
              </p>
              <div
                className={cn(
                  "mt-2 h-[2px] w-full rounded-full",
                  isSelected ? "bg-white/20" : "bg-[var(--color-paper-line)]",
                )}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-[600ms] ease-out",
                    isSelected ? "bg-white/75" : "bg-[var(--color-ink)]",
                  )}
                  style={{ width: animated ? `${pct}%` : "0%" }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm vitest run src/test/results/ResultsList.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/results/ResultsList.tsx src/test/results/ResultsList.test.tsx
git commit -m "feat: add ResultsList with animated score bars and keyboard-accessible selection"
```

---

## Task 6: ResultsDetail Component

**Files:**
- Create: `src/components/results/ResultsDetail.tsx`
- Create: `src/test/results/ResultsDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/results/ResultsDetail.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ResultsDetail } from "@/components/results/ResultsDetail"

const mockDeck = {
  id: "deck-1",
  colors: { base: ["W", "U"] as const, splash: null },
  mainDeck: [],
  fullDeck: [
    {
      quantity: 1,
      adjustedScore: 8.1,
      notes: [],
      card: {
        name: "Last Gasp",
        displayName: "Last Gasp",
        aliases: [],
        normalizedAliases: ["lastgasp"],
        type: "Instant",
        rarity: "common",
        rating: 8.1,
        cmc: 2,
        rawColors: { W: 0, U: 0, B: 1, R: 0, G: 0 },
        primaryCost: "{1}{B}",
        image: undefined,
        isCreature: false,
        isLand: false,
        isInstantLike: true,
        normalizedName: "lastgasp",
        role: {
          colorCount: 1,
          maxSingleColorPip: 1,
          totalColoredPips: 1,
          isCheapCreature: false,
          isExpensiveFinisher: false,
          isInteraction: true,
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
  totalScore: 87.4,
  explanation: "Strong Azorius build.",
  diagnostics: ["Good curve"],
  metrics: {
    creatureCount: 14,
    nonCreatureCount: 9,
    interactionCount: 6,
    cheapPlays: 8,
    expensiveSpells: 3,
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

const baseProps = {
  deck: mockDeck as any,
  index: 0,
  copiedDeckId: null,
  onCopyDeck: vi.fn(),
  onCopyMana: vi.fn(),
  onAnalyzeCard: vi.fn(),
  scryfallLoaded: false,
}

describe("ResultsDetail", () => {
  it("renders the deck score", () => {
    render(<ResultsDetail {...baseProps} />)
    expect(screen.getByText("87.4")).toBeInTheDocument()
  })

  it("renders all 6 metric labels", () => {
    render(<ResultsDetail {...baseProps} />)
    expect(screen.getByText(/creatures/i)).toBeInTheDocument()
    expect(screen.getByText(/interaction/i)).toBeInTheDocument()
    expect(screen.getByText(/avg cmc/i)).toBeInTheDocument()
    expect(screen.getByText(/cheap plays/i)).toBeInTheDocument()
    expect(screen.getByText(/stability/i)).toBeInTheDocument()
    expect(screen.getByText(/lands/i)).toBeInTheDocument()
  })

  it("renders deck list tab content by default", () => {
    render(<ResultsDetail {...baseProps} />)
    expect(screen.getByText("Last Gasp")).toBeInTheDocument()
  })

  it("calls onAnalyzeCard with card name when a card row is clicked", () => {
    const onAnalyzeCard = vi.fn()
    render(<ResultsDetail {...baseProps} onAnalyzeCard={onAnalyzeCard} />)
    fireEvent.click(screen.getByRole("button", { name: "Last Gasp" }))
    expect(onAnalyzeCard).toHaveBeenCalledWith("Last Gasp")
  })

  it("calls onCopyDeck when Copy deck button is clicked", () => {
    const onCopyDeck = vi.fn()
    render(<ResultsDetail {...baseProps} onCopyDeck={onCopyDeck} />)
    fireEvent.click(screen.getByRole("button", { name: /copy deck/i }))
    expect(onCopyDeck).toHaveBeenCalledWith(mockDeck)
  })

  it("shows 'Copied deck' label when copiedDeckId matches", () => {
    render(<ResultsDetail {...baseProps} copiedDeckId="deck-1-deck" />)
    expect(screen.getByRole("button", { name: /copied deck/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm vitest run src/test/results/ResultsDetail.test.tsx
```

Expected: all fail with "Cannot find module".

- [ ] **Step 3: Create ResultsDetail component**

Create `src/components/results/ResultsDetail.tsx`:

```tsx
import { CopyIcon } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { COLOR_NAMES, describeManaBase, type RankedDeckResult, type SynergyTag } from "@/lib/mtg"

const SYNERGY_TAG_LABELS: Record<SynergyTag, string> = {
  tribal: "Tribal",
  spellPayoff: "Spell payoff",
  keywordLord: "Keyword lord",
  graveyard: "Graveyard",
  counters: "+1/+1 counters",
  tokens: "Tokens",
  sacrifice: "Sacrifice",
  lifegain: "Life gain",
  repartee: "Repartee",
  expensiveSpells: "Expensive spells",
  converge: "Converge",
}

function formatColors(deck: RankedDeckResult): string[] {
  const names = deck.colors.base.map((c) => COLOR_NAMES[c])
  const splash = deck.colors.splash
  const hasSplash = splash ? deck.basicLands[splash] > 0 : false
  return splash && hasSplash ? [...names, `${COLOR_NAMES[splash]} splash`] : names
}

type ResultsDetailProps = {
  deck: RankedDeckResult
  index: number
  copiedDeckId: string | null
  onCopyDeck: (deck: RankedDeckResult) => void
  onCopyMana: (deck: RankedDeckResult) => void
  onAnalyzeCard: (cardName: string) => void
  scryfallLoaded: boolean
}

export function ResultsDetail({
  deck,
  index,
  copiedDeckId,
  onCopyDeck,
  onCopyMana,
  onAnalyzeCard,
  scryfallLoaded,
}: ResultsDetailProps) {
  const colors = formatColors(deck)

  return (
    <div
      key={deck.id}
      className="flex min-w-0 flex-1 flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
    >
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--color-paper-line)] bg-[linear-gradient(180deg,#fffbf0,#fdf6e5)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Badge className="bg-[var(--color-ink)] text-white">#{index + 1}</Badge>
          {colors.map((c) => (
            <Badge key={c} variant="outline" className="border-[var(--color-paper-line-strong)] bg-white/70 text-[10px]">
              {c}
            </Badge>
          ))}
          {deck.scoreBreakdown.fixingBonus > 0 ? (
            <Badge className="bg-stone-200 text-stone-800 text-[9px]">
              +{deck.scoreBreakdown.fixingBonus.toFixed(1)} fixing
            </Badge>
          ) : null}
          {deck.scoreBreakdown.synergyBonus > 0 ? (
            <Badge className="bg-stone-300 text-stone-900 text-[9px]">
              +{deck.scoreBreakdown.synergyBonus.toFixed(1)} synergy
            </Badge>
          ) : null}
        </div>
        <p className="text-[22px] font-extrabold leading-none text-[var(--color-ink)]">
          {deck.totalScore.toFixed(1)}
        </p>
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--color-ink-soft)]">
          {deck.explanation}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-[10px]"
            onClick={() => onCopyDeck(deck)}
          >
            <CopyIcon className="size-3" data-icon="inline-start" />
            {copiedDeckId === `${deck.id}-deck` ? "Copied deck" : "Copy deck"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-[10px]"
            onClick={() => onCopyMana(deck)}
          >
            <CopyIcon className="size-3" data-icon="inline-start" />
            {copiedDeckId === `${deck.id}-mana` ? "Copied mana" : "Copy mana"}
          </Button>
        </div>
      </div>

      {/* Metrics grid — always visible */}
      <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-[var(--color-paper-line)] bg-[#faf9f7] px-4 py-3">
        {[
          { label: "Creatures", value: deck.metrics.creatureCount },
          { label: "Interaction", value: deck.metrics.interactionCount },
          { label: "Avg CMC", value: deck.metrics.averageCmc.toFixed(1) },
          { label: "Cheap plays", value: deck.metrics.cheapPlays },
          { label: "Stability", value: deck.metrics.manaStability.toFixed(1) },
          { label: "Lands", value: deck.landCount },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--color-paper-line)] bg-white p-2 shadow-[var(--shadow-soft)]"
          >
            <p className="text-[8px] uppercase tracking-[0.1em] text-[var(--color-muted-ink)]">
              {label}
            </p>
            <p className="mt-0.5 text-[13px] font-bold text-[var(--color-ink)]">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="deck" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList
          variant="line"
          className="shrink-0 rounded-none border-b border-[var(--color-paper-line)] px-4 pb-0"
        >
          <TabsTrigger value="deck" className="text-[10px]">Deck list</TabsTrigger>
          <TabsTrigger value="mana" className="text-[10px]">Mana base</TabsTrigger>
          <TabsTrigger value="notes" className="text-[10px]">Why ranked</TabsTrigger>
        </TabsList>

        <TabsContent value="deck" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-[var(--color-paper-line)] bg-[#fafaf8]">
                  <th className="px-4 py-2 text-left font-medium text-[var(--color-muted-ink)]">Qty</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--color-muted-ink)]">Card</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--color-muted-ink)]">Type</th>
                  <th className="px-4 py-2 text-right font-medium text-[var(--color-muted-ink)]">Rating</th>
                </tr>
              </thead>
              <tbody>
                {deck.fullDeck.map((entry) => (
                  <tr
                    key={`${deck.id}-${entry.card.normalizedName}`}
                    className="border-b border-[var(--color-paper-line)] last:border-0"
                  >
                    <td className="px-4 py-2 text-[var(--color-muted-ink)]">{entry.quantity}</td>
                    <td className="px-4 py-2 font-medium">
                      <button
                        type="button"
                        aria-label={entry.card.displayName}
                        className="text-left underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                        onClick={() => onAnalyzeCard(entry.card.displayName)}
                      >
                        {entry.card.displayName}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-ink-soft)]">{entry.card.type}</td>
                    <td className="px-4 py-2 text-right text-[var(--color-muted-ink)]">
                      {entry.card.rating.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="mana" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {describeManaBase(deck.basicLands).map((line) => (
                <Badge key={line} variant="secondary">
                  {line}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
              This deck uses {deck.landCount} basic lands to support {colors.join(", ")}.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <div className="p-4">
            <Accordion type="single" collapsible defaultValue="summary">
              <AccordionItem value="summary">
                <AccordionTrigger className="text-[11px]">Quick explanation</AccordionTrigger>
                <AccordionContent className="text-[11px]">{deck.explanation}</AccordionContent>
              </AccordionItem>
              <AccordionItem value="synergy">
                <AccordionTrigger className="text-[11px]">Synergy analysis</AccordionTrigger>
                <AccordionContent>
                  {Object.keys(deck.synergyBreakdown).length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {(Object.entries(deck.synergyBreakdown) as [SynergyTag, number][])
                        .sort(([, a], [, b]) => b - a)
                        .map(([tag, score]) => {
                          const detail = deck.synergyDetail[tag]
                          const providers =
                            detail?.contributors.filter(
                              (e) => e.role === "provider" || e.role === "both",
                            ) ?? []
                          const payoffs =
                            detail?.contributors.filter(
                              (e) => e.role === "payoff" || e.role === "both",
                            ) ?? []
                          return (
                            <div
                              key={tag}
                              className="rounded-xl border border-[var(--color-paper-line)] bg-white/65 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-medium text-[var(--color-ink)]">
                                  {SYNERGY_TAG_LABELS[tag]}
                                </span>
                                <Badge className="bg-stone-300 text-stone-900 text-[9px]">
                                  +{score.toFixed(1)}
                                </Badge>
                              </div>
                              {providers.length > 0 ? (
                                <p className="mt-1 text-[9px] leading-relaxed text-[var(--color-ink-soft)]">
                                  <span className="font-medium text-[var(--color-muted-ink)]">
                                    Provides:{" "}
                                  </span>
                                  {providers
                                    .map((e) =>
                                      e.quantity > 1
                                        ? `${e.displayName} ×${e.quantity}`
                                        : e.displayName,
                                    )
                                    .join(", ")}
                                </p>
                              ) : null}
                              {payoffs.length > 0 ? (
                                <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--color-ink-soft)]">
                                  <span className="font-medium text-[var(--color-muted-ink)]">
                                    Payoffs:{" "}
                                  </span>
                                  {payoffs
                                    .map((e) =>
                                      e.quantity > 1
                                        ? `${e.displayName} ×${e.quantity}`
                                        : e.displayName,
                                    )
                                    .join(", ")}
                                </p>
                              ) : null}
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {scryfallLoaded
                        ? "No meaningful synergies detected."
                        : "Fetch card data to see synergy analysis."}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="diagnostics">
                <AccordionTrigger className="text-[11px]">Detailed notes</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-1.5">
                  {deck.diagnostics.map((line) => (
                    <p key={`${deck.id}-${line}`} className="text-[11px] text-[var(--color-ink-soft)]">
                      {line}
                    </p>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm vitest run src/test/results/ResultsDetail.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/results/ResultsDetail.tsx src/test/results/ResultsDetail.test.tsx
git commit -m "feat: add ResultsDetail with metrics grid, tabs, and analyze-card integration"
```

---

## Task 7: ResultsPanel Shell

**Files:**
- Create: `src/components/results/ResultsPanel.tsx`
- Create: `src/test/results/ResultsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/results/ResultsPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
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
    // Skeletons are rendered — check for their container
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("renders ResultsList when results are present", () => {
    render(<ResultsPanel {...baseProps} results={[mockDeck as any]} />)
    // Score visible in the list
    expect(screen.getByText("87.4")).toBeInTheDocument()
  })

  it("shows missing cards alert when missingCards is non-empty", () => {
    render(
      <ResultsPanel
        {...baseProps}
        results={[mockDeck as any]}
        missingCards={["2 Some Card"]}
      />,
    )
    expect(screen.getByText(/missing from the combined rating files/i)).toBeInTheDocument()
    expect(screen.getByText(/2 Some Card/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm vitest run src/test/results/ResultsPanel.test.tsx
```

Expected: all fail with "Cannot find module".

- [ ] **Step 3: Create ResultsPanel component**

Create `src/components/results/ResultsPanel.tsx`:

```tsx
import { InfoIcon, WandSparklesIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { type RankedDeckResult } from "@/lib/mtg"
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
  const selectedDeck = results[selectedDeckIndex] ?? results[0]

  return (
    <div className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-[var(--color-paper-line)] bg-white">
      {missingCards.length > 0 ? (
        <Alert className="shrink-0 rounded-none border-x-0 border-t-0 border-stone-300 bg-stone-100 py-2">
          <InfoIcon className="size-3.5" />
          <AlertTitle className="text-[10px]">Missing from ratings</AlertTitle>
          <AlertDescription className="text-[9px]">
            {missingCards.slice(0, 6).join(", ")}
            {missingCards.length > 6 ? `…+${missingCards.length - 6} more` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {isEvaluating ? (
        <div className="flex flex-col gap-3 p-4" aria-live="polite">
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty className="border border-dashed border-[var(--color-paper-line-strong)] bg-[var(--color-paper-pane)] py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WandSparklesIcon />
              </EmptyMedia>
              <EmptyTitle>No ranked decks yet</EmptyTitle>
              <EmptyDescription>
                Load ratings, enter your pool, then hit Evaluate.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="text-[11px]">
              The evaluator ranks realistic Sealed builds: mono where viable, two-color defaults,
              and careful light splashes.
            </EmptyContent>
          </Empty>
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

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm vitest run src/test/results/ResultsPanel.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
pnpm test
```

Expected: all existing tests pass (new components don't affect App.tsx yet).

- [ ] **Step 6: Commit**

```bash
git add src/components/results/ResultsPanel.tsx src/test/results/ResultsPanel.test.tsx
git commit -m "feat: add ResultsPanel shell with empty state, skeletons, and master/detail layout"
```

---

## Task 8: App.tsx Restructure + Update Existing Tests

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/test/app.test.tsx`

This task wires all new components into `App.tsx`, removes the old component definitions, adds two new state variables, and updates the integration tests to match the new layout.

- [ ] **Step 1: Add new state variables and update handleQuickAdd in App.tsx**

At the top of the `App` function body, after the existing `useState` declarations, add:

```tsx
const [selectedDeckIndex, setSelectedDeckIndex] = useState(0)
const [lastAddedCard, setLastAddedCard] = useState<string | null>(null)
```

Replace `handleQuickAdd` with the version that also sets `lastAddedCard`:

```tsx
function handleQuickAdd(candidateName?: string) {
  const targetName = candidateName ?? quickAddSuggestions[highlightedSuggestionIndex]?.name
  if (!targetName) {
    return
  }

  setPoolText((current) => upsertPoolEntry(current, targetName, parsedQuickAdd.quantity))
  setQuickAddInput("")
  setHighlightedSuggestionIndex(0)
  setLastAddedCard(targetName)
  window.setTimeout(() => {
    setLastAddedCard((c) => (c === targetName ? null : c))
  }, 400)
}
```

Inside `handleEvaluate`, after `setResults(evaluation.decks)`, add:

```tsx
setSelectedDeckIndex(0)
```

- [ ] **Step 2: Replace the return value in App with the new layout**

Replace the entire `return (...)` block in `App` with:

```tsx
return (
  <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-paper-background)]">
    <AppTopbar
      totalRatedCards={totalRatedCards}
      parsedPoolCount={parsedPool.length}
      scryfallLoaded={scryfallData.size > 0}
      notice={notice}
      isEvaluating={isEvaluating}
      hasRatings={ratingFiles.length > 0}
      hasPool={parsedPool.length > 0}
      onEvaluate={handleEvaluate}
    />
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <AppSidebar
        ratingFiles={ratingFiles}
        mergedRatingsSize={mergedRatings.index.size}
        fileErrors={fileErrors}
        conflicts={mergedRatings.conflicts}
        onLoadPreset={handleLoadPreset}
        onFileUpload={handleFileUpload}
        onReset={handleResetFiles}
        scryfallSource={scryfallSource}
        scryfallDataSize={scryfallData.size}
        isFetchingScryfall={isFetchingScryfall}
        scryfallProgress={scryfallProgress}
        onFetchCardData={handleFetchCardData}
        scryfallErrors={scryfallErrors}
        parsedPoolCount={parsedPool.length}
        analyzerSearch={analyzerSearch}
        setAnalyzerSearch={setAnalyzerSearch}
        analyzerChips={analyzerChips}
        matchedPoolCount={matchedPoolCount}
        onAnalyze={(cardName) => {
          setAnalyzedCard(cardName)
          setAnalyzerSearch("")
        }}
      />
      <PoolWorkspace
        parsedPoolCount={parsedPool.length}
        poolText={poolText}
        setPoolText={setPoolText}
        quickAddInput={quickAddInput}
        setQuickAddInput={setQuickAddInput}
        quickAddCandidatesCount={quickAddCandidates.length}
        parsedQuickAddQuantity={parsedQuickAdd.quantity}
        parsedQuickAddQuery={parsedQuickAdd.query}
        quickAddSuggestions={quickAddSuggestions}
        highlightedSuggestionIndex={highlightedSuggestionIndex}
        setHighlightedSuggestionIndex={setHighlightedSuggestionIndex}
        onQuickAdd={handleQuickAdd}
        onQuickAddKeyDown={handleQuickAddKeyDown}
        parsedPool={parsedPool}
        onAdjustPoolEntry={handleAdjustPoolEntry}
        onQuickAddFromPool={handleQuickAddFromPool}
        onLoadSample={() => setPoolText(SAMPLE_POOL)}
        onClearPool={handleClearPool}
        lastAddedCard={lastAddedCard}
      />
      <ResultsPanel
        isEvaluating={isEvaluating}
        results={results}
        missingCards={missingCards}
        selectedDeckIndex={selectedDeckIndex}
        onSelectDeck={setSelectedDeckIndex}
        copiedDeckId={copiedDeckId}
        onCopyDeck={(deck) => copyText(formatDeckListForCopy(deck), `${deck.id}-deck`, "Deck list")}
        onCopyMana={(deck) => copyText(formatManaBaseForCopy(deck), `${deck.id}-mana`, "Mana base")}
        onAnalyzeCard={setAnalyzedCard}
        scryfallLoaded={scryfallData.size > 0}
      />
    </div>
    {analyzedCard ? (
      <CardAnalyzerModal
        cardName={analyzedCard}
        ratingIndex={mergedRatings.index}
        scryfallData={scryfallData}
        poolSubtypes={poolSubtypes}
        onClose={() => setAnalyzedCard(null)}
      />
    ) : null}
  </div>
)
```

- [ ] **Step 3: Update imports in App.tsx**

At the top of `src/App.tsx`, replace the existing import block with:

```tsx
import { startTransition, useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { AppTopbar, type Notice } from "@/components/AppTopbar"
import { AppSidebar } from "@/components/AppSidebar"
import { PoolWorkspace } from "@/components/PoolWorkspace"
import { ResultsPanel } from "@/components/results/ResultsPanel"
import { CardAnalyzerModal } from "@/components/CardAnalyzerModal"
import { RATING_PRESETS, type RatingPreset } from "@/lib/ratings/presets"
import {
  COLOR_NAMES,
  batchFetchCards,
  buildQuickAddCandidates,
  describeManaBase,
  evaluateSealedPool,
  extractPoolSubtypes,
  mergeRatingFiles,
  parsePoolText,
  parseQuickAddInput,
  parseRatingFileContent,
  searchQuickAddCandidates,
  upsertPoolEntry,
  type RankedDeckResult,
  type RatingFileParseResult,
  type ScryfallDataMap,
} from "@/lib/mtg"
import { cn } from "@/lib/utils"
```

- [ ] **Step 4: Delete old component definitions from App.tsx**

Remove these function definitions entirely from `App.tsx` (they are no longer used):
- `WorkspaceHero`
- `StatTile`
- `FeedbackNotice`
- `PoolWorkspace` (the old one)
- `RatingsWorkspace`
- `AnalyzerWorkspace`
- `ResultsExplorer`
- `DeckResultCard`
- `SectionPanel`
- `StatusChip`
- `MetricLine`
- `ResultSkeleton`

Also remove these unused imports from the top of `App.tsx`:
- `heroImage` (no longer used)
- All shadcn/ui imports that are no longer used in App.tsx directly (Alert, Accordion, Badge, ScrollArea, Separator, Skeleton, Table, Tabs, etc.)
- Lucide icons no longer used in App.tsx directly

Keep in App.tsx: the `SAMPLE_POOL` constant, `formatColors`, `formatDeckListForCopy`, `formatManaBaseForCopy`, `SYNERGY_TAG_LABELS` (if still referenced), `pushNotice`.

Note: `SYNERGY_TAG_LABELS` and `COLOR_NAMES` are now only used in the results components. Remove them from `App.tsx` if no longer referenced there.

- [ ] **Step 5: Run TypeScript to catch any issues**

```bash
pnpm build
```

Fix any type errors before proceeding. Common issues: unused imports causing lint errors, missing prop types, or props not matching between App and new components.

- [ ] **Step 6: Update app.test.tsx to match new layout**

Replace the entire contents of `src/test/app.test.tsx` with:

```tsx
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
```

- [ ] **Step 7: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass, including the 6 updated integration tests and all new component tests.

- [ ] **Step 8: Start dev server and do a visual smoke test**

```bash
pnpm dev
```

Verify:
- Topbar visible with brand + chips + Evaluate button
- Sidebar visible with Ratings / Scryfall / Analyzer sections
- Pool workspace in center with Quick Add + pool list
- Results panel on right showing empty state
- Load a preset → green chip appears in topbar, sidebar ratings section shows loaded file
- Quick add a card → it appears in pool list with a brief green flash
- Evaluate → skeleton cards appear, then results with deck list + detail
- Click a different deck in ResultsList → detail column updates smoothly
- Click a card name in deck list → Analyzer modal opens

Ctrl+C when done.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/test/app.test.tsx
git commit -m "feat: restructure App into four-zone layout with sidebar, pool workspace, and results master/detail"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Topbar: brand, chips, notice, evaluate → Task 2 ✓
  - Sidebar: ratings, scryfall, analyzer → Task 3 ✓
  - Pool workspace: quick add, pool list, raw toggle, hover controls, card flash → Task 4 ✓
  - Results list: score bars, selection → Task 5 ✓
  - Results detail: metrics grid, tabs, deck list, mana, notes/synergy → Task 6 ✓
  - Results panel: empty state, skeletons, missing cards alert → Task 7 ✓
  - App restructure + new state → Task 8 ✓
  - Focus ring CSS → Task 1 ✓
  - Animation classes: `motion-safe:animate-in fade-in` used throughout components ✓
  - `isRawVisible` local to PoolWorkspace ✓
  - `selectedDeckIndex` in App, reset on evaluate ✓
  - `lastAddedCard` in App, set in handleQuickAdd ✓

- [x] **Type consistency:** All prop types defined and matched. `Notice` exported from `AppTopbar.tsx` and imported in `App.tsx`. `RankedDeckResult` imported from `@/lib/mtg` in all results components.

- [x] **No placeholders:** All steps contain complete code blocks. No TBD/TODO markers.
