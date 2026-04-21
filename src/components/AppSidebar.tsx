import { type ChangeEvent, type KeyboardEvent } from "react"
import {
  CheckCircle2Icon,
  DatabaseIcon,
  InfoIcon,
  LoaderCircleIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { RATING_PRESETS, type RatingPreset } from "@/lib/ratings/presets"
import { type RatingFileParseResult } from "@/lib/mtg"

const suggestionListId = "sidebar-analyzer-suggestions"

type AppSidebarProps = {
  ratingFiles: RatingFileParseResult[]
  fileErrors: string[]
  conflicts: string[]
  onLoadPreset: (preset: RatingPreset) => void
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onReset: () => void
  scryfallSource: "preset" | "fetched" | null
  scryfallDataSize: number
  isFetchingScryfall: boolean
  scryfallProgress: { fetched: number; total: number } | null
  onFetchCardData: () => void
  scryfallErrors: string[]
  parsedPoolCount: number
  analyzerSearch: string
  setAnalyzerSearch: (value: string) => void
  analyzerSuggestions: Array<{ name: string; normalizedName: string; type?: string; source: string }>
  highlightedAnalyzerSuggestionIndex: number
  setHighlightedAnalyzerSuggestionIndex: (index: number) => void
  onAnalyzerKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  analyzerChips: string[]
  matchedPoolCount: number
  onAnalyze: (cardName?: string) => void
}

export function AppSidebar({
  ratingFiles,
  fileErrors,
  conflicts,
  onLoadPreset,
  onFileUpload,
  onReset,
  scryfallSource,
  scryfallDataSize,
  isFetchingScryfall,
  scryfallProgress,
  onFetchCardData,
  scryfallErrors,
  parsedPoolCount,
  analyzerSearch,
  setAnalyzerSearch,
  analyzerSuggestions,
  highlightedAnalyzerSuggestionIndex,
  setHighlightedAnalyzerSuggestionIndex,
  onAnalyzerKeyDown,
  analyzerChips,
  matchedPoolCount,
  onAnalyze,
}: AppSidebarProps) {
  const activeDescendant = analyzerSuggestions[highlightedAnalyzerSuggestionIndex]
    ? `sidebar-analyzer-option-${highlightedAnalyzerSuggestionIndex}`
    : undefined

  return (
    <aside className="flex w-[210px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-paper-line)] bg-[linear-gradient(180deg,#f2efe9,#e8e4dd)]">
      <div className="border-b border-[var(--color-paper-line)]/60 px-3 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
            Ratings
          </p>
          {ratingFiles.length > 0 ? (
            <button
              type="button"
              className="text-[9px] text-[var(--color-muted-ink)] underline underline-offset-2 hover:text-[var(--color-ink-soft)]"
              onClick={onReset}
            >
              Clear
            </button>
          ) : null}
        </div>

        {ratingFiles.length > 0 ? (
          <div className="mb-2 flex flex-col gap-1.5">
            {ratingFiles.map((file) => (
              <div
                key={file.fileName}
                className="flex items-center gap-2 rounded-lg border-l-2 border-emerald-400 bg-white py-2 pl-2 pr-3 shadow-[var(--shadow-soft)]"
              >
                <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium text-[var(--color-ink)]">
                    {file.fileName}
                  </p>
                  <p className="text-[9px] text-[var(--color-muted-ink)]">
                    {file.cards.length} cards
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {RATING_PRESETS.map((preset) => {
            const alreadyLoaded = ratingFiles.some((f) => f.fileName === preset.name)
            return (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className="h-7 rounded-full bg-[var(--color-paper-pane)] text-[10px]"
                disabled={alreadyLoaded}
                onClick={() => onLoadPreset(preset)}
                title={preset.description}
              >
                {alreadyLoaded ? (
                  <CheckCircle2Icon className="size-3 text-emerald-600" data-icon="inline-start" />
                ) : null}
                {preset.name}
              </Button>
            )
          })}
        </div>

        <Separator className="my-3" />

        <label className="block">
          <span className="mb-1 block text-[9px] font-medium text-[var(--color-muted-ink)]">
            Upload custom file
          </span>
          <input
            type="file"
            accept=".js,.txt"
            multiple
            onChange={onFileUpload}
            aria-label="Upload your own"
            className="block w-full cursor-pointer rounded-lg border border-[var(--color-paper-line-strong)] bg-white/70 px-2 py-1.5 text-[10px] text-[var(--color-ink-soft)] file:mr-2 file:cursor-pointer file:rounded-full file:border-0 file:bg-[var(--color-paper-pane)] file:px-2 file:py-0.5 file:text-[9px] file:font-medium file:text-[var(--color-ink)]"
          />
        </label>

        {fileErrors.length > 0 ? (
          <Alert variant="destructive" className="mt-2 py-2">
            <TriangleAlertIcon className="size-3.5" />
            <AlertTitle className="text-[10px]">File error</AlertTitle>
            <AlertDescription className="flex flex-col gap-0.5 text-[9px]">
              {fileErrors.slice(0, 2).map((e) => (
                <span key={e}>{e}</span>
              ))}
              {fileErrors.length > 2 ? <span>â€¦+{fileErrors.length - 2} more</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {conflicts.length > 0 ? (
          <Alert className="mt-2 border-[var(--color-paper-line)] bg-[var(--color-paper-pane)] py-2">
            <InfoIcon className="size-3.5" />
            <AlertTitle className="text-[10px]">Duplicate names</AlertTitle>
            <AlertDescription className="text-[9px]">{conflicts[0]}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="border-b border-[var(--color-paper-line)]/60 px-3 py-4">
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
          Scryfall data
        </p>

        {scryfallSource === "preset" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-800">
            Bundled data ready
          </div>
        ) : scryfallSource === "fetched" && scryfallDataSize > 0 && !isFetchingScryfall ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-800">
            {scryfallDataSize} cards enriched
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl bg-[var(--color-paper-pane)] text-[10px]"
            onClick={onFetchCardData}
            disabled={parsedPoolCount === 0 || isFetchingScryfall}
          >
            {isFetchingScryfall ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <DatabaseIcon data-icon="inline-start" />
            )}
            {isFetchingScryfall
              ? `Fetchingâ€¦ ${scryfallProgress?.fetched ?? 0}/${scryfallProgress?.total ?? parsedPoolCount}`
              : "Fetch card data"}
          </Button>
        )}

        {scryfallErrors.length > 0 ? (
          <Alert variant="destructive" className="mt-2 py-2">
            <TriangleAlertIcon className="size-3.5" />
            <AlertTitle className="text-[10px]">Fetch errors</AlertTitle>
            <AlertDescription className="flex flex-col gap-0.5 text-[9px]">
              {scryfallErrors.slice(0, 3).map((e) => (
                <span key={e}>{e}</span>
              ))}
              {scryfallErrors.length > 3 ? <span>â€¦+{scryfallErrors.length - 3} more</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-3 py-4">
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
          Card Analyzer
        </p>
        <div className="flex gap-1.5">
          <Input
            role="combobox"
            aria-expanded={analyzerSuggestions.length > 0}
            aria-controls={suggestionListId}
            aria-activedescendant={activeDescendant}
            aria-autocomplete="list"
            placeholder="Search any cardâ€¦"
            value={analyzerSearch}
            onChange={(e) => setAnalyzerSearch(e.target.value)}
            onKeyDown={onAnalyzerKeyDown}
            className="h-8 flex-1 rounded-xl border-[var(--color-paper-line-strong)] bg-white/80 px-3 text-[10px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-xl px-2"
            disabled={!analyzerSearch.trim() && analyzerSuggestions.length === 0}
            onClick={() => onAnalyze()}
            aria-label="Analyze card"
          >
            <SearchIcon className="size-3.5" />
          </Button>
        </div>

        {analyzerSuggestions.length > 0 ? (
          <div className="mt-2 rounded-xl border border-[var(--color-paper-line)] bg-white/85">
            <div className="border-b border-[var(--color-paper-line)] px-3 py-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
              Matches for {analyzerSearch.trim() || "rated cards"}
            </div>
            <ul id={suggestionListId} role="listbox" className="p-1.5">
              {analyzerSuggestions.map((candidate, index) => {
                const isActive = index === highlightedAnalyzerSuggestionIndex
                return (
                  <li key={candidate.normalizedName} role="presentation">
                    <button
                      id={`sidebar-analyzer-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] transition-colors duration-100 focus-visible:outline-none",
                        isActive
                          ? "bg-[var(--color-ink)] text-[var(--color-paper-pane)]"
                          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-pane)]",
                      )}
                      onMouseEnter={() => setHighlightedAnalyzerSuggestionIndex(index)}
                      onClick={() => onAnalyze(candidate.name)}
                    >
                      <span className="font-medium">{candidate.name}</span>
                      <span
                        className={cn(
                          "ml-2 text-[8px]",
                          isActive ? "text-stone-400" : "text-[var(--color-muted-ink)]",
                        )}
                      >
                        {candidate.type ?? candidate.source}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {analyzerChips.length > 0 ? (
          <div className="relative mt-3">
            <div className="flex max-h-[7rem] flex-wrap gap-1.5 overflow-hidden">
              {analyzerChips.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="rounded-full border border-[var(--color-paper-line)] bg-[var(--color-paper-pane)] px-2.5 py-1 text-[9px] font-medium text-[var(--color-ink-soft)] transition-colors hover:bg-white"
                  onClick={() => onAnalyze(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            {matchedPoolCount > analyzerChips.length ? (
              <p className="mt-1.5 text-[9px] text-[var(--color-muted-ink)]">
                +{matchedPoolCount - analyzerChips.length} more in pool
              </p>
            ) : null}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-[var(--color-paper-pane)]" />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
