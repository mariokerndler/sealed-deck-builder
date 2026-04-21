// src/components/CardAnalyzerModal.tsx
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { analyzeCard } from "@/lib/mtg/analyze"
import type { RatingIndexEntry, SynergyRole, SynergyTag } from "@/lib/mtg/types"
import type { ScryfallDataMap } from "@/lib/mtg/scryfall"

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

const ROLE_BADGE_COLORS: Record<SynergyRole, string> = {
  provider: "bg-sky-100 text-sky-800",
  payoff: "bg-emerald-100 text-emerald-800",
  both: "bg-violet-100 text-violet-800",
}

type Props = {
  cardName: string
  ratingIndex: Map<string, RatingIndexEntry>
  scryfallData: ScryfallDataMap
  poolSubtypes: Set<string>
  onClose: () => void
}

export function CardAnalyzerModal({ cardName, ratingIndex, scryfallData, poolSubtypes, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const analysis = analyzeCard(cardName, ratingIndex, scryfallData, poolSubtypes)

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal — stopPropagation prevents backdrop click from firing when clicking inside */}
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {analysis === null ? (
          // Not found state
          <div className="flex flex-col gap-3 p-6">
            <div className="flex items-start justify-between">
              <p className="font-semibold text-stone-800">Card not found</p>
              <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              "{cardName}" was not found in the loaded rating files. Check the spelling or load the correct rating set.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-stone-900">{analysis.card.displayName}</h2>
                <p className="mt-0.5 text-sm text-stone-500">
                  {analysis.card.type} · {analysis.card.rarity} · CMC {analysis.card.cmc}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-lg bg-amber-100 px-3 py-1 text-base font-bold text-amber-800">
                  {analysis.card.rating.toFixed(1)}
                </span>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-stone-400" onClick={onClose}>
                  ✕
                </Button>
              </div>
            </div>

            {/* Scrollable body */}
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-5 px-6 py-5">

                {/* Oracle text — only when scryfall data loaded */}
                {analysis.scryfallCard && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">Oracle text</p>
                    <p className="whitespace-pre-wrap text-sm italic leading-relaxed text-stone-600">
                      {analysis.scryfallCard.card_faces
                        ? analysis.scryfallCard.card_faces.map((f) => f.oracle_text).join("\n\n")
                        : (analysis.scryfallCard.oracle_text ?? "")}
                    </p>
                  </div>
                )}

                {/* Synergy tags — only when scryfall data loaded */}
                {analysis.scryfallCard && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Synergy tags</p>
                    {analysis.synergyTags.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No synergy tags detected.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {analysis.synergyTags.map((t, i) => (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                {SYNERGY_TAG_LABELS[t.tag]}
                              </span>
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_COLORS[t.role]}`}>
                                {t.role}
                              </span>
                            </div>
                            <p className="pl-1 text-xs text-stone-500">↳ {t.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Separator />

                {/* Score breakdown — always shown */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Score breakdown</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-600">Base rating</span>
                      <span className="font-semibold text-stone-800">{analysis.scoreBreakdown.baseRating.toFixed(2)}</span>
                    </div>
                    {analysis.scoreBreakdown.adjustments.map((adj, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-stone-500">{adj.label}</span>
                        <span className={adj.delta >= 0 ? "text-emerald-600" : "text-red-500"}>
                          {adj.delta >= 0 ? "+" : ""}{adj.delta.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span className="text-stone-800">Adjusted score</span>
                      <span className="text-stone-900">{analysis.scoreBreakdown.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Role flags — always shown */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Role flags</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.roleFlags.map((flag) => (
                      <span
                        key={flag.label}
                        title={flag.explanation}
                        className={
                          flag.active
                            ? "rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800"
                            : "rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-400 line-through"
                        }
                      >
                        {flag.label}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}
