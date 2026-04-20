# Card Analyzer — Design Spec

**Date:** 2026-04-20

## Overview

A click-to-inspect card analyzer that explains in detail why a card received its score. Accessible via a standalone search section in the app and by clicking any card name in the Top 5 Decks results. Both entry points open the same centred modal overlay.

---

## Entry Points

### 1. Standalone search section

A "Card Analyzer" section sits between the pool input and the Top 5 Decks results. It contains:

- A text input with placeholder "Search card name…"
- An "Analyze" button
- Quick-pick chips for every card already in the current pool (clicking a chip opens the modal immediately, no button press needed)

The section is always visible once a rating set is loaded. If no rating set is loaded the section is hidden (there is nothing to look up).

### 2. Click-to-inspect from deck results

Every card name in the deck spell list becomes a dotted-underline link. Clicking it opens the modal for that card. The score shown next to the name (already present in the deck list) stays unchanged.

---

## Modal

Centred overlay, dismissable by clicking the backdrop or an ✕ button. Scrollable body for long oracle texts or many synergy tags.

### Sections (top to bottom)

**Header**
- Card display name (large)
- Type line · Rarity · Color pips · CMC (secondary text)
- Rating badge (yellow, top-right)
- ✕ close button

**Oracle text**
- Shown only when `scryfallCard` is available
- Full oracle text in italic, inside a lightly tinted box
- Section hidden entirely when Scryfall data is not loaded

**Synergy tags**
- Shown only when `scryfallCard` is available (tags require oracle text to derive)
- Each fired tag renders as two inline badges: tag name + role (`provider` / `payoff` / `both`)
- Below the badges: `↳ <reason>` — the specific keyword name or oracle text fragment that triggered the tag
- Section shows "No synergy tags detected" when card has none
- Section hidden entirely when Scryfall data is not loaded

**Score breakdown**
- Always shown (derived from rating file data, no Scryfall needed)
- Line items:
  - Base rating
  - +0.15 Cheap creature (CMC ≤ 3 creature)
  - +0.20 Interaction (instant/sorcery/removal)
  - +0.08 Colorless playable
  - −(maxSingleColorPip − 1) × 0.18 Double/triple pip penalty
  - −0.08 Conditional card
- Divider line then **Adjusted score** total
- Only non-zero adjustments are shown

**Role flags**
- Always shown
- Active flags: highlighted badge (blue)
- Inactive flags: struck-through grey badge
- Flags shown: Cheap creature, Expensive finisher, Interaction, Fixing, Colorless playable, Conditional, Instant-like

---

## Data Model

### New types (in `src/lib/mtg/types.ts`)

```typescript
export type RoleFlag = {
  label: string
  active: boolean
  explanation: string
}

export type SynergyTagAnalysis = {
  tag: SynergyTag
  role: SynergyRole
  reason: string   // e.g. "prowess keyword" or "whenever you cast an instant or sorcery"
}

export type ScoreAdjustment = {
  label: string
  delta: number
}

export type CardAnalysis = {
  card: RatingCard
  scryfallCard: ScryfallCard | null
  roleFlags: RoleFlag[]
  synergyTags: SynergyTagAnalysis[]
  scoreBreakdown: {
    baseRating: number
    adjustments: ScoreAdjustment[]
    total: number
  }
}
```

---

## New File: `src/lib/mtg/analyze.ts`

Single exported function:

```typescript
export function analyzeCard(
  cardName: string,
  ratingIndex: Map<string, RatingIndexEntry>,
  scryfallData: ScryfallDataMap,
  poolSubtypes?: Set<string>,
): CardAnalysis | null
```

- Returns `null` if `cardName` is not found in `ratingIndex` (after normalization).
- `poolSubtypes` defaults to an empty `Set` — tribal tags can only fire when the pool context is provided.
- Does **not** modify `synergy.ts`. Synergy trigger reasons are derived by a private `deriveTagsWithReasons()` helper inside `analyze.ts` that mirrors `deriveCardSynergyTags` but records the matched keyword name or oracle text fragment as a `reason` string alongside each tag.
- Score breakdown adjustments mirror the logic in `scorePoolCardForCandidate` but exclude the splash and mono-color context adjustments (those are deck-context-specific, not card-intrinsic).

---

## App.tsx Changes

### New state

```typescript
const [analyzedCard, setAnalyzedCard] = useState<string | null>(null)
```

### Card Analyzer section

- Rendered between pool input section and deck results section
- Hidden when `totalRatedCards === 0`
- Search input is a controlled `<Input>` with an `onKeyDown` Enter handler and an "Analyze" button
- Quick-pick chips: `parsedPool` entries that exist in `mergedRatings.index`, up to 8 shown, rest truncated with a count
- Clicking a chip or submitting the search calls `setAnalyzedCard(name)`

### Deck list card names

- In the spells table, each card name is wrapped in a `<button>` styled as an underline link
- `onClick` calls `setAnalyzedCard(entry.card.displayName)`

### Modal rendering

```tsx
{analyzedCard && (
  <CardAnalyzerModal
    cardName={analyzedCard}
    ratingIndex={mergedRatings.index}
    scryfallData={scryfallData}
    poolSubtypes={poolSubtypes}
    onClose={() => setAnalyzedCard(null)}
  />
)}
```

`poolSubtypes` is derived via `useMemo(() => extractPoolSubtypes(scryfallData), [scryfallData])`.

---

## New Component: `src/components/CardAnalyzerModal.tsx`

Props:

```typescript
type CardAnalyzerModalProps = {
  cardName: string
  ratingIndex: Map<string, RatingIndexEntry>
  scryfallData: ScryfallDataMap
  poolSubtypes: Set<string>
  onClose: () => void
}
```

- Calls `analyzeCard(...)` on render (synchronous, no loading state needed)
- If result is `null`, shows a "Card not found" state inside the modal
- Renders the four sections described above
- Backdrop click calls `onClose`; `Escape` key also calls `onClose`
- Uses existing shadcn-style UI primitives (`Badge`, `Separator`, etc.)

---

## Files Changed / Created

| File | Change |
|---|---|
| `src/lib/mtg/types.ts` | Add `RoleFlag`, `SynergyTagAnalysis`, `ScoreAdjustment`, `CardAnalysis` |
| `src/lib/mtg/analyze.ts` | **New** — `analyzeCard()` function |
| `src/lib/mtg/index.ts` | Re-export from `analyze.ts` |
| `src/components/CardAnalyzerModal.tsx` | **New** — modal component |
| `src/App.tsx` | Add `analyzedCard` state, Card Analyzer section, clickable card names, modal render |

---

## Out of Scope

- Comparing a card across multiple color combinations (deck-context scoring is shown without splash/mono adjustments)
- Editing ratings from within the modal
- Showing card images
