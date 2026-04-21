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
          aria-autocomplete="list"
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
                      <li key={candidate.normalizedName} role="presentation">
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
          <div className="flex items-center gap-2 border-b border-[var(--color-paper-line)] bg-[#fafaf8] px-3 py-2">
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
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-paper-line-strong)] bg-[var(--color-paper-pane)] p-6 text-center">
                <Layers3Icon className="size-8 text-[var(--color-muted-ink)]" />
                <p className="text-[11px] font-medium text-[var(--color-ink)]">No pool entries yet</p>
                <p className="text-[10px] text-[var(--color-muted-ink)]">
                  Use quick add, paste a list below, or load the sample pool.
                </p>
              </div>
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
