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
