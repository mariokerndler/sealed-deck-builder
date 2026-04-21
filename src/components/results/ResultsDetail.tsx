import { CopyIcon } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { COLOR_NAMES, type RankedDeckResult, type SynergyTag } from "@/lib/mtg"

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

type BasicLands = { W: number; U: number; B: number; R: number; G: number }

function describeManaBase(basicLands: BasicLands): string[] {
  return (Object.entries(basicLands) as [keyof BasicLands, number][])
    .filter(([, count]) => count > 0)
    .map(([color, count]) => `${count} ${COLOR_NAMES[color]}`)
}

function formatColors(deck: RankedDeckResult): string[] {
  const names = deck.colors.base.map((c) => COLOR_NAMES[c])
  const splash = deck.colors.splash
  const hasSplash = splash ? deck.basicLands[splash] > 0 : false
  return splash && hasSplash ? [...names, `${COLOR_NAMES[splash]} splash`] : names
}

type ResultsDetailProps = {
  deck: RankedDeckResult
  index: number
  copiedDeckId: string | null
  onCopyDeck: (deck: RankedDeckResult) => void
  onCopyMana: (deck: RankedDeckResult) => void
  onAnalyzeCard: (cardName: string) => void
  scryfallLoaded: boolean
}

export function ResultsDetail({
  deck,
  index,
  copiedDeckId,
  onCopyDeck,
  onCopyMana,
  onAnalyzeCard,
  scryfallLoaded,
}: ResultsDetailProps) {
  const colors = formatColors(deck)

  return (
    <div
      className="flex min-w-0 flex-1 flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
    >
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--color-paper-line)] bg-[linear-gradient(180deg,#fffbf0,#fdf6e5)] px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge className="bg-[var(--color-ink)] text-white">#{index + 1}</Badge>
          {colors.map((c) => (
            <Badge key={c} variant="outline" className="border-[var(--color-paper-line-strong)] bg-white/70 text-[10px]">
              {c}
            </Badge>
          ))}
          <Badge variant="outline" className="border-[var(--color-paper-line-strong)] bg-white/70 text-[10px]">
            {deck.totalCardCount} cards
          </Badge>
          {deck.scoreBreakdown.fixingBonus > 0 ? (
            <Badge className="bg-stone-200 text-stone-800 text-[9px]">
              +{deck.scoreBreakdown.fixingBonus.toFixed(1)} fixing
            </Badge>
          ) : null}
          {deck.scoreBreakdown.synergyBonus > 0 ? (
            <Badge className="bg-stone-300 text-stone-900 text-[9px]">
              +{deck.scoreBreakdown.synergyBonus.toFixed(1)} synergy
            </Badge>
          ) : null}
        </div>
        <p className="text-[22px] font-extrabold leading-none text-[var(--color-ink)]">
          {deck.totalScore.toFixed(1)}
        </p>
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--color-ink-soft)]">
          {deck.explanation}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-[10px]"
            onClick={() => onCopyDeck(deck)}
          >
            <CopyIcon className="size-3" data-icon="inline-start" />
            {copiedDeckId === `${deck.id}-deck` ? "Copied deck" : "Copy deck"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-[10px]"
            onClick={() => onCopyMana(deck)}
          >
            <CopyIcon className="size-3" data-icon="inline-start" />
            {copiedDeckId === `${deck.id}-mana` ? "Copied mana" : "Copy mana"}
          </Button>
        </div>
      </div>

      {/* Metrics grid — always visible */}
      <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-[var(--color-paper-line)] bg-[#faf9f7] px-4 py-3">
        {[
          { label: "Creatures", value: deck.metrics.creatureCount },
          { label: "Interaction", value: deck.metrics.interactionCount },
          { label: "Avg CMC", value: deck.metrics.averageCmc.toFixed(1) },
          { label: "Cheap plays", value: deck.metrics.cheapPlays },
          { label: "Stability", value: deck.metrics.manaStability.toFixed(1) },
          { label: "Lands", value: deck.landCount },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--color-paper-line)] bg-white p-2 shadow-[var(--shadow-soft)]"
          >
            <p className="text-[8px] uppercase tracking-[0.1em] text-[var(--color-muted-ink)]">
              {label}
            </p>
            <p className="mt-0.5 text-[13px] font-bold text-[var(--color-ink)]">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="deck" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList
          variant="line"
          className="shrink-0 rounded-none border-b border-[var(--color-paper-line)] px-4 pb-0"
        >
          <TabsTrigger value="deck" className="text-[10px]">Deck list</TabsTrigger>
          <TabsTrigger value="mana" className="text-[10px]">Mana base</TabsTrigger>
          <TabsTrigger value="notes" className="text-[10px]">Why ranked</TabsTrigger>
        </TabsList>

        <TabsContent value="deck" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-[var(--color-paper-line)] bg-[#fafaf8]">
                  <th className="px-4 py-2 text-left font-medium text-[var(--color-muted-ink)]">Qty</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--color-muted-ink)]">Card</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--color-muted-ink)]">Type</th>
                  <th className="px-4 py-2 text-right font-medium text-[var(--color-muted-ink)]">Rating</th>
                </tr>
              </thead>
              <tbody>
                {deck.fullDeck.map((entry) => (
                  <tr
                    key={`${deck.id}-${entry.card.normalizedName}`}
                    className="border-b border-[var(--color-paper-line)] last:border-0"
                  >
                    <td className="px-4 py-2 text-[var(--color-muted-ink)]">{entry.quantity}</td>
                    <td className="px-4 py-2 font-medium">
                      <button
                        type="button"
                        aria-label={entry.card.displayName}
                        className="text-left underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                        onClick={() => onAnalyzeCard(entry.card.displayName)}
                      >
                        {entry.card.displayName}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-ink-soft)]">{entry.card.type}</td>
                    <td className="px-4 py-2 text-right text-[var(--color-muted-ink)]">
                      {entry.card.rating.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="mana" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {describeManaBase(deck.basicLands).map((line) => (
                <Badge key={line} variant="secondary">
                  {line}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
              This deck uses {deck.landCount} basic lands to support {colors.join(", ")}.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <div className="p-4">
            <Accordion type="single" collapsible defaultValue="summary">
              <AccordionItem value="summary">
                <AccordionTrigger className="text-[11px]">Quick explanation</AccordionTrigger>
                <AccordionContent className="text-[11px]">{deck.explanation}</AccordionContent>
              </AccordionItem>
              <AccordionItem value="synergy">
                <AccordionTrigger className="text-[11px]">Synergy analysis</AccordionTrigger>
                <AccordionContent>
                  {Object.keys(deck.synergyBreakdown).length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {(Object.entries(deck.synergyBreakdown) as [SynergyTag, number][])
                        .sort(([, a], [, b]) => b - a)
                        .map(([tag, score]) => {
                          const detail = deck.synergyDetail[tag]
                          const providers =
                            detail?.contributors.filter(
                              (e) => e.role === "provider" || e.role === "both",
                            ) ?? []
                          const payoffs =
                            detail?.contributors.filter(
                              (e) => e.role === "payoff" || e.role === "both",
                            ) ?? []
                          return (
                            <div
                              key={tag}
                              className="rounded-xl border border-[var(--color-paper-line)] bg-white/65 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-medium text-[var(--color-ink)]">
                                  {SYNERGY_TAG_LABELS[tag]}
                                </span>
                                <Badge className="bg-stone-300 text-stone-900 text-[9px]">
                                  +{score.toFixed(1)}
                                </Badge>
                              </div>
                              {providers.length > 0 ? (
                                <p className="mt-1 text-[9px] leading-relaxed text-[var(--color-ink-soft)]">
                                  <span className="font-medium text-[var(--color-muted-ink)]">
                                    Provides:{" "}
                                  </span>
                                  {providers
                                    .map((e) =>
                                      e.quantity > 1
                                        ? `${e.displayName} ×${e.quantity}`
                                        : e.displayName,
                                    )
                                    .join(", ")}
                                </p>
                              ) : null}
                              {payoffs.length > 0 ? (
                                <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--color-ink-soft)]">
                                  <span className="font-medium text-[var(--color-muted-ink)]">
                                    Payoffs:{" "}
                                  </span>
                                  {payoffs
                                    .map((e) =>
                                      e.quantity > 1
                                        ? `${e.displayName} ×${e.quantity}`
                                        : e.displayName,
                                    )
                                    .join(", ")}
                                </p>
                              ) : null}
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {scryfallLoaded
                        ? "No meaningful synergies detected."
                        : "Fetch card data to see synergy analysis."}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="diagnostics">
                <AccordionTrigger className="text-[11px]">Detailed notes</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-1.5">
                  {deck.diagnostics.map((line, i) => (
                    <p key={`${deck.id}-diag-${i}`} className="text-[11px] text-[var(--color-ink-soft)]">
                      {line}
                    </p>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
