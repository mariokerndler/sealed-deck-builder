# UI/UX Overhaul — Design Spec

**Date:** 2026-04-21
**Scope:** Full layout restructure + component polish (Option 2)
**Priority:** Polish & micro-interactions, UX workflow, layout declutter

---

## Problem Statement

The current app is functional but cluttered. All four workspaces (pool input, ratings setup, analyzer, results) are visible simultaneously in a flat grid, competing for attention. The large hero section consumes prime real estate with decorative content. The results explorer renders a scrolling stack of tabbed cards that is dense and hard to navigate. There is no clear visual hierarchy for where to start or what to do next.

---

## Goals

- Reduce visual clutter by separating setup from active workspace
- Make the workflow legible at a glance (load set → build pool → evaluate)
- Improve results navigation via master/detail instead of stacked cards
- Add micro-interactions and animation polish throughout
- Preserve the existing paper/ink design system and typography

---

## Section 1 — Layout

### Overall Structure

Four zones arranged in a single viewport-height shell (no page scroll):

```
┌─────────────────────────────────────────────────────┐
│  TOPBAR (46px)                                       │
├──────────┬──────────────────────┬───────────────────┤
│          │                      │                   │
│ SIDEBAR  │  POOL WORKSPACE      │  RESULTS PANEL    │
│ (210px)  │  (flex, min-width 0) │  (360px)          │
│          │                      │                   │
└──────────┴──────────────────────┴───────────────────┘
```

All four zones are always visible. No tabs, no page sections. Height is `100vh` with internal scroll within the results panel and pool list.

### Topbar (46px)

- Brand wordmark ("Sealed Deck Builder") — left-anchored, uppercase, 800 weight
- Separator line
- Live status chips (inline, animated on change):
  - Ratings chip: shows set name + card count when loaded; muted "No ratings" when empty
  - Pool chip: shows entry count; muted "Empty pool" when zero
  - Scryfall chip: shows "Enriched" when data loaded; hidden when not loaded
- Spacer (flex-1)
- Inline notice area: appears between spacer and Evaluate button; fades in/out; replaces the dedicated `aria-live` region
- Evaluate button: primary dark button, right-anchored; spinner during evaluation

### Left Sidebar (210px)

Three stacked sections, no collapse behaviour (always open):

**Ratings section**
- Label: "Ratings"
- Loaded file rows: white card with green left-border accent, checkmark, file name, card count badge
- "Load another set" dashed action button below loaded files
- Preset buttons (pill style) — already-loaded presets show a check and are disabled
- File upload input — below presets, available at all times
- Error/conflict alerts rendered inline within this section

**Scryfall section**
- Label: "Scryfall data"
- When preset loaded: green status row ("Bundled data ready")
- When fetched: green status row with count
- When neither: "Fetch card data" button (disabled if pool empty)
- Fetch progress shown inline ("Fetching… 12/30") with spinner
- Scryfall errors shown inline, limited to 3 lines + overflow count

**Card Analyzer section**
- Label: "Card Analyzer"
- Search input — pressing Enter or clicking "Analyze" opens the modal
- Pool shortcut chips: first 8 matched pool cards rendered as clickable chips
- "+N more in pool" overflow label when pool has more matched cards

### Pool Workspace (flex center)

Two stacked sub-panels within a padded container:

**Quick Add panel** (top, fixed height)
- Search input with combobox role — full width, prominent
- Suggestion list below input (up to 7 items): highlighted item has dark background, keyboard navigable
- `1× queued` badge shown when quantity prefix is parsed
- Empty state: alert if no rating files loaded yet

**Pool List panel** (flex-1, scrollable)
- Header: "Pool · N entries" label + "Live" badge
- Rows: quantity bubble (rounded, muted background) + card name (clickable → sends to Quick Add) + hover-revealed ±controls
- Footer bar: "Load sample" button, "Clear" ghost button, "Raw paste ↓" toggle link (right-aligned)
- Raw textarea: expands below footer via CSS grid row trick when toggle is active; collapses on second click; always synced with pool state

### Results Panel (360px)

Split horizontally into two columns:

**Deck list column (110px)**
- Header: "N Builds" label
- One row per ranked deck: rank label, score (large), color pair, animated score bar
- Selected deck: inverted (dark background, white text/bars)
- Click to select — no other interaction

**Detail column (flex-1)**
- Header (warm gradient background):
  - Rank badge + color badges + card count
  - Score (large, 800 weight)
  - One-line explanation text
  - Copy deck / Copy mana buttons (small, pill style)
- Metrics grid (3×2): Creatures, Interaction, Avg CMC, Cheap plays, Stability, Lands — always visible above tabs
- Tabs: Deck list / Mana base / Why ranked
- Tab content scrolls internally
- Deck list tab: table rows with Qty, Card name (clickable → Analyzer), Type, Rating
- Mana base tab: mana distribution badges + description
- Why ranked tab: Accordion with Quick explanation / Synergy analysis / Detailed notes

---

## Section 2 — Polish & Micro-Interactions

### Animation Tokens

All animations use `tw-animate-css` classes with `motion-safe:` prefix. No animation runs without `prefers-reduced-motion: no-preference`.

| Token | Duration | Easing | Usage |
|---|---|---|---|
| `fade-in` | 120ms | ease-out | Chip appearance, notice, suggestions |
| `slide-in-from-top-1` | 120ms | ease-out | Suggestion list mount |
| `slide-in-from-bottom-2` | 150ms | ease-out | Result deck cards on first render |
| Score bar width | 600ms | ease-out | Animated from 0 on first results render |
| Detail crossfade | 80ms out + 80ms in | ease | Deck switching in results detail |

### Topbar

- Status chips: mount with `fade-in + scale-in` when state first becomes truthy
- Notice: crossfades with existing chip using `transition-opacity`; auto-dismisses after 2400ms (existing behaviour preserved)
- Evaluate button: `LoaderCircleIcon` replaces icon during evaluation; opacity-50 + cursor-not-allowed when disabled

### Sidebar

- Loaded rating file rows: `border-l-2 border-emerald-400` accent + `CheckCircle2Icon` in emerald
- "Load another set" button: `hover:bg-white/60` fill transition (150ms)
- Analyzer chips: `flex-wrap` with `overflow-hidden` + a bottom fade mask (`bg-gradient-to-b from-transparent to-[var(--color-paper-pane)]`) when chips overflow 2 lines

### Pool Workspace

- Suggestion list: `motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1` on mount
- Keyboard highlight transition: `transition-colors duration-100` on suggestion items (not instant)
- Pool row ±controls: `transition-opacity duration-100 opacity-0 group-hover:opacity-100` (requires `group` on row)
- New card flash: when a card is added via Quick Add, the matching pool row gets a one-shot `bg-emerald-50` pulse via a short-lived className that removes itself after 400ms
- Raw textarea: CSS grid row trick — `grid-rows-[0fr]` → `grid-rows-[1fr]` with `transition-[grid-template-rows] duration-200`

### Results Panel

- Score bars: `transition-[width] duration-600 ease-out` with initial width 0, triggered after results mount
- Deck switching: wrap detail column content in a key-based remount or use `transition-opacity` with a brief opacity-0 state between deck changes
- Metrics grid: subtle `animate-in fade-in` (150ms) when detail column first mounts

### Global Focus Rings

Replace default `outline-ring/50` with a semi-transparent outline that targets only the ring, not element opacity:
```css
:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ink) 35%, transparent);
  outline-offset: 2px;
}
```
Applied via `@layer base` in `index.css`.

---

## Section 3 — Component Architecture

### Deleted Components

| Component | Reason |
|---|---|
| `WorkspaceHero` | Replaced by `AppTopbar` |
| `StatTile` | Data moves into topbar chips |
| `RatingsWorkspace` (SectionPanel) | Content moves into `AppSidebar` |
| `AnalyzerWorkspace` (SectionPanel) | Content moves into `AppSidebar` |
| `ResultsExplorer` | Replaced by `ResultsPanel` (master/detail) |
| `SectionPanel` | Layout wrapper no longer needed |
| `DeckResultCard` | Logic absorbed into `ResultsDetail` |

### New Components

| Component | File | Responsibility |
|---|---|---|
| `AppTopbar` | `components/AppTopbar.tsx` | Brand, status chips, inline notice, Evaluate button |
| `AppSidebar` | `components/AppSidebar.tsx` | Ratings section, Scryfall section, Analyzer section |
| `ResultsPanel` | `components/results/ResultsPanel.tsx` | Outer shell; receives `selectedDeckIndex` + `onSelectDeck` from `App` |
| `ResultsList` | `components/results/ResultsList.tsx` | Narrow deck selection column |
| `ResultsDetail` | `components/results/ResultsDetail.tsx` | Selected deck metrics, tabs, deck table |

### Refactored Components

| Component | Change |
|---|---|
| `PoolWorkspace` | Extracted from `App.tsx` to `components/PoolWorkspace.tsx`; stripped of Scryfall and pool-summary header; raw textarea behind toggle |
| `FeedbackNotice` | Unchanged; moved into `AppTopbar` render scope |
| `StatusChip` | Unchanged; used in `AppTopbar` |
| `ResultSkeleton` | Unchanged; used in `ResultsPanel` empty/loading states |
| `MetricLine` | Replaced by inline metric grid cells in `ResultsDetail` |

### State Changes in `App`

**Added:**
- `selectedDeckIndex: number` — default `0`; reset to `0` after each `handleEvaluate` call
- `isRawVisible: boolean` — default `false`; toggled by the "Raw paste" link in pool footer

**Unchanged:** All existing state variables and handler functions remain. Props are re-wired to new component boundaries.

### File Layout After Change

```
src/
  App.tsx                              ← layout shell, state, handlers
  components/
    AppTopbar.tsx                      ← new
    AppSidebar.tsx                     ← new
    PoolWorkspace.tsx                  ← extracted + refactored
    CardAnalyzerModal.tsx              ← unchanged
    results/
      ResultsPanel.tsx                 ← new
      ResultsList.tsx                  ← new
      ResultsDetail.tsx                ← new
    ui/                                ← all unchanged
  lib/                                 ← all unchanged
  index.css                            ← focus ring update only
```

---

## Out of Scope

- Dark mode (CSS vars partially set up but not activated)
- Mobile / responsive layout (desktop-first tool, not a priority)
- MTG mana color accents / visual identity overhaul
- Drag-and-drop pool reordering
- Persistent session state (localStorage)
