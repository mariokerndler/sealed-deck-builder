import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { analyzeCard } from "@/lib/mtg/analyze"
import type { ScryfallDataMap } from "@/lib/mtg/scryfall"
import type { RatingIndexEntry, SynergyRole, SynergyTag } from "@/lib/mtg/types"

const SYNERGY_TAG_LABELS: Record<SynergyTag, string> = {
  tribal: "Tribal",
  prepare: "Prepare",
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
  provider: "bg-stone-200 text-stone-800",
  payoff: "bg-stone-300 text-stone-900",
  both: "bg-stone-800 text-stone-100",
}

type Props = {
  cardName: string
  ratingIndex: Map<string, RatingIndexEntry>
  scryfallData: ScryfallDataMap
  poolSubtypes: Set<string>
  onClose: () => void
}

export function CardAnalyzerModal({
  cardName,
  ratingIndex,
  scryfallData,
  poolSubtypes,
  onClose,
}: Props) {
  const analysis = analyzeCard(cardName, ratingIndex, scryfallData, poolSubtypes)

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="overflow-hidden p-0" showCloseButton>
        {analysis === null ? (
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader>
              <DialogTitle>Card not found</DialogTitle>
              <DialogDescription>
                {cardName} was not found in the loaded rating files. Check the spelling or load the
                correct rating set.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(255,249,235,0.9),rgba(250,245,234,0.96))] px-6 py-5">
              <div className="flex items-start justify-between gap-4 pr-8">
                <DialogHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-black/6 text-[var(--color-ink)]">
                      Analyzer
                    </Badge>
                    <Badge variant="outline">{analysis.card.rarity}</Badge>
                  </div>
                  <DialogTitle className="text-2xl">{analysis.card.displayName}</DialogTitle>
                  <DialogDescription>
                    {analysis.card.type} · CMC {analysis.card.cmc}
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-2xl border border-black/10 bg-black/4 px-3 py-2 text-right">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--color-muted-ink)]">
                    Rating
                  </p>
                  <p className="text-2xl font-semibold text-[var(--color-ink)]">
                    {analysis.card.rating.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>

            <ScrollArea className="max-h-[min(70vh,44rem)]">
              <div className="flex flex-col gap-6 px-6 py-5">
                {analysis.scryfallCard ? (
                  <section className="rounded-[var(--radius-xl)] border border-border/70 bg-white/70 px-4 py-3 shadow-[var(--shadow-soft)]">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-ink)]">
                      Oracle text
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink-soft)]">
                      {analysis.scryfallCard.card_faces
                        ? analysis.scryfallCard.card_faces
                            .map((face) => face.oracle_text)
                            .filter(Boolean)
                            .join("\n\n")
                        : (analysis.scryfallCard.oracle_text ?? "")}
                    </p>
                  </section>
                ) : null}

                <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[var(--radius-xl)] border border-border/70 bg-white/70 p-4 shadow-[var(--shadow-soft)]">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-ink)]">
                      Score breakdown
                    </p>
                    <div className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--color-ink-soft)]">Base rating</span>
                        <span className="font-semibold text-[var(--color-ink)]">
                          {analysis.scoreBreakdown.baseRating.toFixed(2)}
                        </span>
                      </div>
                      {analysis.scoreBreakdown.adjustments.map((adjustment) => (
                        <div
                          key={`${adjustment.label}-${adjustment.delta}`}
                          className="flex items-center justify-between"
                        >
                          <span className="text-[var(--color-ink-soft)]">{adjustment.label}</span>
                          <span
                            className={
                              adjustment.delta >= 0
                                ? "font-medium text-emerald-700"
                                : "font-medium text-rose-600"
                            }
                          >
                            {adjustment.delta >= 0 ? "+" : ""}
                            {adjustment.delta.toFixed(2)}
                          </span>
                        </div>
                      ))}
                      <Separator className="my-1" />
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-[var(--color-ink)]">Adjusted score</span>
                        <span className="text-[var(--color-ink)]">
                          {analysis.scoreBreakdown.total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-border/70 bg-white/70 p-4 shadow-[var(--shadow-soft)]">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-ink)]">
                      Role flags
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.roleFlags.map((flag) => (
                        <span
                          key={flag.label}
                          title={flag.explanation}
                          className={
                            flag.active
                              ? "rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-stone-800"
                              : "rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-400 line-through"
                          }
                        >
                          {flag.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="rounded-[var(--radius-xl)] border border-border/70 bg-white/70 p-4 shadow-[var(--shadow-soft)]">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-ink)]">
                    Synergy tags
                  </p>
                  {!analysis.scryfallCard ? (
                    <p className="text-sm text-muted-foreground">
                      Fetch card data to unlock synergy explanations for this card.
                    </p>
                  ) : analysis.synergyTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No synergy tags detected.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {analysis.synergyTags.map((tag) => (
                        <div
                          key={`${tag.tag}-${tag.role}-${tag.reason}`}
                          className="rounded-2xl border border-border/60 bg-[var(--color-paper-pane)] px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-black/6 px-2.5 py-1 text-xs font-medium text-[var(--color-ink)]">
                              {SYNERGY_TAG_LABELS[tag.tag]}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE_COLORS[tag.role]}`}
                            >
                              {tag.role}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
                            {tag.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
