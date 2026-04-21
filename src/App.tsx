import { startTransition, useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { AppTopbar, type Notice } from "@/components/AppTopbar"
import { AppSidebar } from "@/components/AppSidebar"
import { PoolWorkspace } from "@/components/PoolWorkspace"
import { ResultsPanel } from "@/components/results/ResultsPanel"
import { CardAnalyzerModal } from "@/components/CardAnalyzerModal"
import { type RatingPreset } from "@/lib/ratings/presets"
import {
  COLOR_NAMES,
  batchFetchCards,
  buildQuickAddCandidates,
  describeManaBase,
  evaluateSealedPool,
  extractPoolSubtypes,
  mergeRatingFiles,
  parsePoolText,
  parseQuickAddInput,
  parseRatingFileContent,
  searchQuickAddCandidates,
  upsertPoolEntry,
  type RankedDeckResult,
  type RatingFileParseResult,
  type ScryfallDataMap,
} from "@/lib/mtg"

const SAMPLE_POOL = `1 Harsh Annotation
1 Shattered Acolyte
1 Rapier Wit
1 Eager Glyphmage
1 Ennis, Debate Moderator
1 Daydream
1 Stand Up for Yourself
1 Erode
1 Fractal Anomaly
1 Deluge Virtuoso
1 Banishing Betrayal
1 Procrastinate
1 Tester of the Tangential
1 Brush Off
1 Last Gasp
1 Moseo, Vein's New Dean
1 Wander Off
1 Rabid Attack
1 Expressive Firedancer
1 Thunderdrum Soloist
1 Seize the Spoils
1 Tome Blast
1 Unsubtle Mockery
1 Topiary Lecturer
1 Noxious Newt
1 Pestbrood Sloth
1 Burrog Barrage
1 Follow the Lumarets
1 Shopkeeper's Bane
1 Root Manipulation`

function formatColors(deck: RankedDeckResult) {
  const names = deck.colors.base.map((color) => COLOR_NAMES[color])
  const splash = deck.colors.splash
  const hasSplash = splash ? deck.basicLands[splash] > 0 : false
  return splash && hasSplash ? [...names, `${COLOR_NAMES[splash]} splash`] : names
}

function formatDeckListForCopy(deck: RankedDeckResult) {
  return [
    `#${deck.id} - ${formatColors(deck).join(", ")}`,
    `Score: ${deck.totalScore.toFixed(2)}`,
    `Cards: ${deck.totalCardCount}`,
    "",
    "Main Deck",
    ...deck.fullDeck.map((entry) => `${entry.quantity} ${entry.card.displayName}`),
  ].join("\n")
}

function formatManaBaseForCopy(deck: RankedDeckResult) {
  return [`${formatColors(deck).join(", ")} mana base`, ...describeManaBase(deck.basicLands)].join("\n")
}

type NoticeTone = "success" | "info" | "error"

function App() {
  const [poolText, setPoolText] = useState("")
  const [ratingFiles, setRatingFiles] = useState<RatingFileParseResult[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [results, setResults] = useState<RankedDeckResult[]>([])
  const [missingCards, setMissingCards] = useState<string[]>([])
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [copiedDeckId, setCopiedDeckId] = useState<string | null>(null)
  const [scryfallData, setScryfallData] = useState<ScryfallDataMap>(new Map())
  const [scryfallSource, setScryfallSource] = useState<"preset" | "fetched" | null>(null)
  const [isFetchingScryfall, setIsFetchingScryfall] = useState(false)
  const [scryfallErrors, setScryfallErrors] = useState<string[]>([])
  const [scryfallProgress, setScryfallProgress] = useState<{ fetched: number; total: number } | null>(null)
  const [quickAddInput, setQuickAddInput] = useState("")
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0)
  const [analyzedCard, setAnalyzedCard] = useState<string | null>(null)
  const [analyzerSearch, setAnalyzerSearch] = useState("")
  const [notice, setNotice] = useState<Notice | null>(null)
  const [selectedDeckIndex, setSelectedDeckIndex] = useState(0)
  const [lastAddedCard, setLastAddedCard] = useState<string | null>(null)

  const mergedRatings = useMemo(() => mergeRatingFiles(ratingFiles), [ratingFiles])
  const parsedPool = useMemo(() => parsePoolText(poolText), [poolText])
  const totalRatedCards = useMemo(
    () => ratingFiles.reduce((sum, file) => sum + file.cards.length, 0),
    [ratingFiles],
  )
  const quickAddCandidates = useMemo(
    () => buildQuickAddCandidates(mergedRatings, scryfallData.size > 0 ? scryfallData : undefined),
    [mergedRatings, scryfallData],
  )
  const parsedQuickAdd = useMemo(() => parseQuickAddInput(quickAddInput), [quickAddInput])
  const quickAddSuggestions = useMemo(
    () => searchQuickAddCandidates(quickAddInput, quickAddCandidates).slice(0, 7),
    [quickAddInput, quickAddCandidates],
  )
  const resolvedPoolCards = useMemo(
    () =>
      parsedPool.flatMap((entry) => {
        const match = entry.normalizedAliases.map((alias) => mergedRatings.index.get(alias)).find(Boolean)

        return match ? [{ quantity: entry.quantity, ratingCard: match.card }] : []
      }),
    [parsedPool, mergedRatings],
  )
  const poolSubtypes = useMemo(
    () => extractPoolSubtypes(resolvedPoolCards, scryfallData),
    [resolvedPoolCards, scryfallData],
  )
  const analyzerChips = useMemo(() => {
    const chips: string[] = []
    for (const entry of parsedPool) {
      const found = entry.normalizedAliases.some((alias) => mergedRatings.index.has(alias))
      if (found) {
        chips.push(entry.inputName)
      }
      if (chips.length >= 8) {
        break
      }
    }
    return chips
  }, [parsedPool, mergedRatings.index])
  const matchedPoolCount = useMemo(
    () => parsedPool.filter((entry) => entry.normalizedAliases.some((alias) => mergedRatings.index.has(alias))).length,
    [parsedPool, mergedRatings.index],
  )

  useEffect(() => {
    if (!notice) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current))
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [notice])

  function pushNotice(message: string, tone: NoticeTone = "success") {
    setNotice({ id: Date.now(), tone, message })
  }

  async function handleFetchCardData() {
    if (parsedPool.length === 0) {
      return
    }

    setIsFetchingScryfall(true)
    setScryfallErrors([])

    const names = parsedPool.map((entry) => entry.inputName)
    const result = await batchFetchCards(names, (fetched, total) => {
      setScryfallProgress({ fetched, total })
    })

    setScryfallData(result.data)
    setScryfallSource("fetched")
    setScryfallErrors([
      ...result.fetchErrors,
      ...result.failedNames.map((name) => `Not found in Scryfall: ${name}`),
    ])
    setIsFetchingScryfall(false)
    setScryfallProgress(null)
    pushNotice(
      result.data.size > 0
        ? `Fetched card data for ${result.data.size} pool cards.`
        : "Card fetch finished, but nothing could be enriched.",
      result.data.size > 0 ? "success" : "info",
    )
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(event.target.files ?? [])

    if (fileList.length === 0) {
      return
    }

    const parsedFiles: RatingFileParseResult[] = []
    const errors: string[] = []

    for (const file of fileList) {
      try {
        const text = await file.text()
        parsedFiles.push(parseRatingFileContent(text, file.name))
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not parse file."}`)
      }
    }

    setFileErrors(errors)
    setRatingFiles((current) => [...current, ...parsedFiles])
    event.target.value = ""

    if (parsedFiles.length > 0) {
      pushNotice(`Loaded ${parsedFiles.length} rating ${parsedFiles.length === 1 ? "file" : "files"}.`)
    }
  }

  function handleLoadPreset(preset: RatingPreset) {
    try {
      const parsed = parseRatingFileContent(preset.content, preset.name)
      setRatingFiles((current) => [...current, parsed])
      setScryfallData(preset.scryfallData)
      setScryfallSource("preset")
      setScryfallErrors([])
      setFileErrors([])
      pushNotice(`${preset.name} is ready for quick entry and analysis.`)
    } catch (error) {
      setFileErrors([`${preset.name}: ${error instanceof Error ? error.message : "Could not parse preset."}`])
      pushNotice(`Could not load ${preset.name}.`, "error")
    }
  }

  function handleEvaluate() {
    if (ratingFiles.length === 0) {
      setFileErrors(["Upload at least one rating file before evaluating a sealed pool."])
      return
    }

    setIsEvaluating(true)

    startTransition(() => {
      const evaluation = evaluateSealedPool(
        parsedPool,
        mergedRatings,
        {},
        scryfallData.size > 0 ? scryfallData : undefined,
      )

      setResults(evaluation.decks)
      setMissingCards(evaluation.missingCards.map((entry) => `${entry.quantity} ${entry.inputName}`))
      setIsEvaluating(false)
      setSelectedDeckIndex(0)
    })
  }

  function handleResetFiles() {
    setRatingFiles([])
    setFileErrors([])
    setResults([])
    setMissingCards([])
    setScryfallData(new Map())
    setScryfallSource(null)
    setScryfallErrors([])
  }

  function handleAdjustPoolEntry(cardName: string, quantityDelta: number) {
    setPoolText((current) => upsertPoolEntry(current, cardName, quantityDelta))
  }

  function handleQuickAdd(candidateName?: string) {
    const targetName = candidateName ?? quickAddSuggestions[highlightedSuggestionIndex]?.name
    if (!targetName) {
      return
    }

    setPoolText((current) => upsertPoolEntry(current, targetName, parsedQuickAdd.quantity))
    setQuickAddInput("")
    setHighlightedSuggestionIndex(0)
    setLastAddedCard(targetName)
    window.setTimeout(() => {
      setLastAddedCard((c) => (c === targetName ? null : c))
    }, 400)
  }

  function handleQuickAddKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlightedSuggestionIndex((current) =>
        quickAddSuggestions.length === 0 ? 0 : Math.min(current + 1, quickAddSuggestions.length - 1),
      )
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlightedSuggestionIndex((current) =>
        quickAddSuggestions.length === 0 ? 0 : Math.max(current - 1, 0),
      )
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      handleQuickAdd()
    }
  }

  function handleQuickAddFromPool(entryName: string) {
    setQuickAddInput(entryName)
  }

  function handleClearPool() {
    setPoolText("")
    setResults([])
    setMissingCards([])
  }

  async function copyText(text: string, deckId: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedDeckId(deckId)
      pushNotice(`${label} copied to the clipboard.`)
      window.setTimeout(() => {
        setCopiedDeckId((current) => (current === deckId ? null : current))
      }, 1800)
    } catch {
      pushNotice(`Could not copy ${label.toLowerCase()}.`, "error")
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-paper-background)]">
      <AppTopbar
        totalRatedCards={totalRatedCards}
        parsedPoolCount={parsedPool.length}
        scryfallLoaded={scryfallData.size > 0}
        notice={notice}
        isEvaluating={isEvaluating}
        hasRatings={ratingFiles.length > 0}
        hasPool={parsedPool.length > 0}
        onEvaluate={handleEvaluate}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar
          ratingFiles={ratingFiles}
          mergedRatingsSize={mergedRatings.index.size}
          fileErrors={fileErrors}
          conflicts={mergedRatings.conflicts}
          onLoadPreset={handleLoadPreset}
          onFileUpload={handleFileUpload}
          onReset={handleResetFiles}
          scryfallSource={scryfallSource}
          scryfallDataSize={scryfallData.size}
          isFetchingScryfall={isFetchingScryfall}
          scryfallProgress={scryfallProgress}
          onFetchCardData={handleFetchCardData}
          scryfallErrors={scryfallErrors}
          parsedPoolCount={parsedPool.length}
          analyzerSearch={analyzerSearch}
          setAnalyzerSearch={setAnalyzerSearch}
          analyzerChips={analyzerChips}
          matchedPoolCount={matchedPoolCount}
          onAnalyze={(cardName) => {
            setAnalyzedCard(cardName)
            setAnalyzerSearch("")
          }}
        />
        <PoolWorkspace
          parsedPoolCount={parsedPool.length}
          poolText={poolText}
          setPoolText={setPoolText}
          quickAddInput={quickAddInput}
          setQuickAddInput={setQuickAddInput}
          quickAddCandidatesCount={quickAddCandidates.length}
          parsedQuickAddQuantity={parsedQuickAdd.quantity}
          parsedQuickAddQuery={parsedQuickAdd.query}
          quickAddSuggestions={quickAddSuggestions}
          highlightedSuggestionIndex={highlightedSuggestionIndex}
          setHighlightedSuggestionIndex={setHighlightedSuggestionIndex}
          onQuickAdd={handleQuickAdd}
          onQuickAddKeyDown={handleQuickAddKeyDown}
          parsedPool={parsedPool}
          onAdjustPoolEntry={handleAdjustPoolEntry}
          onQuickAddFromPool={handleQuickAddFromPool}
          onLoadSample={() => setPoolText(SAMPLE_POOL)}
          onClearPool={handleClearPool}
          lastAddedCard={lastAddedCard}
        />
        <ResultsPanel
          isEvaluating={isEvaluating}
          results={results}
          missingCards={missingCards}
          selectedDeckIndex={selectedDeckIndex}
          onSelectDeck={setSelectedDeckIndex}
          copiedDeckId={copiedDeckId}
          onCopyDeck={(deck) => copyText(formatDeckListForCopy(deck), `${deck.id}-deck`, "Deck list")}
          onCopyMana={(deck) => copyText(formatManaBaseForCopy(deck), `${deck.id}-mana`, "Mana base")}
          onAnalyzeCard={setAnalyzedCard}
          scryfallLoaded={scryfallData.size > 0}
        />
      </div>
      {analyzedCard ? (
        <CardAnalyzerModal
          cardName={analyzedCard}
          ratingIndex={mergedRatings.index}
          scryfallData={scryfallData}
          poolSubtypes={poolSubtypes}
          onClose={() => setAnalyzedCard(null)}
        />
      ) : null}
    </div>
  )
}

export default App
