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
                  : "text-[var(--color-ink)] hover:bg-white/50",
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
