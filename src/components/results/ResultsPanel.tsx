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
