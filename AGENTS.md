# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start the Vite dev server
pnpm build        # Type-check and build for production (tsc -b && vite build)
pnpm lint         # Run ESLint
pnpm test         # Run all tests once with Vitest
```

Run a single test file:
```bash
pnpm vitest run src/test/parser-engine.test.ts
```

## Architecture

This is a single-page React app (Vite + TypeScript + Tailwind v4) that helps MTG players build a Sealed deck from their card pool by scoring and ranking the five strongest deck configurations.

### Data flow

1. **Rating files** — Users upload `.js` files in `SOS.js` format (a JS array assigned to a variable). `parseRatingFileContent` (`src/lib/mtg/parser.ts`) extracts the JSON array payload using string slicing (never `eval`), then maps each raw card object to a `RatingCard` with derived `CardRole` flags. Multiple files are merged via `mergeRatingFiles`, which builds a `Map<normalizedAlias, RatingIndexEntry>` used for all subsequent lookups.

2. **Pool input** — A textarea accepts one card per line (`2 Lightning Bolt` or just `Lightning Bolt`). `parsePoolText` produces `PoolEntry[]` with pre-computed normalized names and aliases.

3. **Deck evaluation** — `evaluateSealedPool` (`src/lib/mtg/engine.ts`) is the core engine:
   - Generates all candidate color identities (mono, 2-color, and splashes if allowed)
   - Ranks candidates by pool strength (top 12 card quality + depth + creature/interaction counts)
   - For each top candidate, builds three variant profiles: `balanced`, `aggressive` (lean), `greedy` (top-end)
   - Runs a local swap optimization loop to refine each deck
   - Scores each deck across 8 dimensions (card quality, mana consistency, early game, creature structure, interaction, top-end burden, color depth, deck coherence)
   - Deduplicates near-identical decks (≥84% card overlap + same role profile) and returns the top 5

4. **Name normalization** (`src/lib/mtg/normalize.ts`) — Cards are matched by normalized name (lowercase, NFKD, strip accents/punctuation). Double-faced and split cards (e.g. `Kirol // Pack a Punch`) generate multiple aliases so either face name matches.

### Key types (`src/lib/mtg/types.ts`)

- `RatingCard` — parsed card with pre-computed `CardRole` flags (`isCheapCreature`, `isInteraction`, `isFixing`, etc.)
- `RankedDeckResult` — complete deck output including `mainDeck`, `fullDeck` (with basic lands), `metrics`, `scoreBreakdown`, `explanation`, and `diagnostics`
- `SearchConfig` — controls deck size (default 40), spell slots (23), land count (17), splash rules, and result limits

### UI (`src/App.tsx`)

Single component with all state. Uses `startTransition` to keep the UI responsive during evaluation. Rating files accumulate; the pool textarea has a live-parsed entry count. UI components are in `src/components/ui/` (shadcn-style, Radix-based).

### Rating file format

Files must contain a JS-style array literal anywhere in the text. Each entry uses these fields:
```
name, type, rarity, myrating, cmc, colors (WUBRG array of pip counts),
castingcost1 (primary cost string), castingcost2 (alternate cost or "none"), image
```

`isFixing` is derived from `castingcost2` matching `/[WUBRG]{2,}/` on lands with no colored pips.
