# Resizable Results Panel — Design Spec

**Date:** 2026-04-21
**Status:** Approved

## Summary

Allow the user to drag-resize the Results Panel (the right-hand column showing ranked decks). The panel's width is persisted to `localStorage` so it survives page reloads.

## Scope

- **In scope:** Results Panel (`src/components/results/ResultsPanel.tsx`) becomes drag-resizable via a custom handle on its left border. Width is clamped and persisted.
- **Out of scope:** Sidebar resize, deck-list-column-only resize, any third-party drag library.

## Architecture

### New file: `src/hooks/useResizablePanel.ts`

A focused custom hook with a single responsibility: manage resizable panel width with localStorage persistence.

**Signature:**
```ts
function useResizablePanel(
  key: string,
  defaultWidth: number,
  min: number,
  max: number
): { width: number; handleMouseDown: React.MouseEventHandler }
```

**Behavior:**
- Initializes `width` from `localStorage.getItem(key)` parsed as a number, falling back to `defaultWidth` if absent or non-numeric.
- On `mousedown`: records `startX = e.clientX` and `startWidth = width`, attaches `mousemove` and `mouseup` listeners to `window`.
- On `mousemove`: computes `newWidth = startWidth + (startX - e.clientX)` (dragging left increases width, dragging right decreases it), clamps to `[min, max]`, updates state.
- On `mouseup`: writes the final width to `localStorage.setItem(key, String(width))`, removes window listeners.
- Cleans up window listeners on unmount via `useEffect` return.

### Modified file: `src/components/results/ResultsPanel.tsx`

**Changes:**
1. Import and call `useResizablePanel("resultsPanelWidth", 360, 280, 600)`.
2. Root `<div>`: remove `w-[360px]` Tailwind class, add `relative` class, add `style={{ width }}` inline style.
3. Add drag handle as first child of the root div:
   ```tsx
   <div
     onMouseDown={handleMouseDown}
     className="absolute left-0 top-0 bottom-0 w-1 z-10 cursor-col-resize hover:bg-black/10 active:bg-black/20"
   />
   ```

### Constants

| Name | Value |
|------|-------|
| localStorage key | `"resultsPanelWidth"` |
| Default width | `360` px |
| Minimum width | `280` px |
| Maximum width | `600` px |
| Handle width | `4` px (Tailwind `w-1`) |

## Testing

**New test in `src/test/results/ResultsPanel.test.tsx`:**

Mock `localStorage` (via `vi.spyOn`). Render `ResultsPanel` with results present. Query the drag handle by `data-testid="resize-handle"`. Fire `mousedown`, then dispatch `mousemove` on `window` with a leftward delta, then dispatch `mouseup` on `window`. Assert that `localStorage.setItem` was called with `"resultsPanelWidth"` and a string representation of the expected clamped width.

The drag handle element gets `data-testid="resize-handle"` to make it queryable in tests.

Existing `ResultsPanel` tests require no changes.

## Files Touched

| File | Action |
|------|--------|
| `src/hooks/useResizablePanel.ts` | Create |
| `src/components/results/ResultsPanel.tsx` | Modify |
| `src/test/results/ResultsPanel.test.tsx` | Modify (add one test) |

## Non-Goals

- No changes to `ResultsList`, `ResultsDetail`, `App.tsx`, or any other component.
- No animation on resize (real-time drag feedback is sufficient).
- No touch/pointer event support (mouse only).
