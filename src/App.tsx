import { startTransition, useEffect, useMemo, useState, type ChangeEvent } from "react"
import {
  CheckCircle2Icon,
  CopyIcon,
  DatabaseIcon,
  FileCode2Icon,
  InfoIcon,
  LayersIcon,
  Layers3Icon,
  LoaderCircleIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { COLOR_NAMES, batchFetchCards, describeManaBase, evaluateSealedPool, mergeRatingFiles, parsePoolText, parseRatingFileContent, type RankedDeckResult, type RatingFileParseResult, type ScryfallDataMap, type SynergyTag } from "@/lib/mtg"
import { RATING_PRESETS, type RatingPreset } from "@/lib/ratings/presets"

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

function formatColors(deck: RankedDeckResult) {
  const names = deck.colors.base.map((color) => COLOR_NAMES[color])
  return deck.colors.splash ? [...names, `${COLOR_NAMES[deck.colors.splash]} splash`] : names
}

function formatDeckListForCopy(deck: RankedDeckResult) {
  const lines = [
    `#${deck.id} - ${formatColors(deck).join(", ")}`,
    `Score: ${deck.totalScore.toFixed(2)}`,
    `Cards: ${deck.totalCardCount}`,
    "",
    "Main Deck",
    ...deck.fullDeck.map((entry) => `${entry.quantity} ${entry.card.displayName}`),
  ]

  return lines.join("\n")
}

function formatManaBaseForCopy(deck: RankedDeckResult) {
  return [
    `${formatColors(deck).join(", ")} mana base`,
    ...describeManaBase(deck.basicLands),
  ].join("\n")
}

function App() {
  const [poolText, setPoolText] = useState(SAMPLE_POOL)
  const [ratingFiles, setRatingFiles] = useState<RatingFileParseResult[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [results, setResults] = useState<RankedDeckResult[]>([])
  const [missingCards, setMissingCards] = useState<string[]>([])
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [copiedDeckId, setCopiedDeckId] = useState<string | null>(null)
  const [scryfallData, setScryfallData] = useState<ScryfallDataMap>(new Map())
  const [isFetchingScryfall, setIsFetchingScryfall] = useState(false)
  const [scryfallErrors, setScryfallErrors] = useState<string[]>([])
  const [scryfallProgress, setScryfallProgress] = useState<{ fetched: number; total: number } | null>(null)

  const mergedRatings = useMemo(() => mergeRatingFiles(ratingFiles), [ratingFiles])
  const parsedPool = useMemo(() => parsePoolText(poolText), [poolText])
  const totalRatedCards = useMemo(
    () => ratingFiles.reduce((sum, file) => sum + file.cards.length, 0),
    [ratingFiles],
  )

  useEffect(() => {
    setScryfallData(new Map())
    setScryfallErrors([])
    setScryfallProgress(null)
  }, [poolText])

  async function handleFetchCardData() {
    if (parsedPool.length === 0) return
    setIsFetchingScryfall(true)
    setScryfallErrors([])
    const names = parsedPool.map((entry) => entry.inputName)
    const result = await batchFetchCards(names, (fetched, total) => {
      setScryfallProgress({ fetched, total })
    })
    setScryfallData(result.data)
    setScryfallErrors([
      ...result.fetchErrors,
      ...result.failedNames.map((n) => `Not found in Scryfall: ${n}`),
    ])
    setIsFetchingScryfall(false)
    setScryfallProgress(null)
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
        errors.push(
          `${file.name}: ${error instanceof Error ? error.message : "Could not parse file."}`,
        )
      }
    }

    setFileErrors(errors)
    setRatingFiles((current) => [...current, ...parsedFiles])
    event.target.value = ""
  }

  function handleLoadPreset(preset: RatingPreset) {
    try {
      const parsed = parseRatingFileContent(preset.content, preset.name)
      setRatingFiles((current) => [...current, parsed])
      setFileErrors([])
    } catch (error) {
      setFileErrors([`${preset.name}: ${error instanceof Error ? error.message : "Could not parse preset."}`])
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
      setMissingCards(
        evaluation.missingCards.map(
          (entry) => `${entry.quantity} ${entry.inputName}`,
        ),
      )
      setIsEvaluating(false)
    })
  }

  function handleResetFiles() {
    setRatingFiles([])
    setFileErrors([])
    setResults([])
    setMissingCards([])
    setScryfallData(new Map())
    setScryfallErrors([])
  }

  async function copyText(text: string, deckId: string) {
    await navigator.clipboard.writeText(text)
    setCopiedDeckId(deckId)
    window.setTimeout(() => {
      setCopiedDeckId((current) => (current === deckId ? null : current))
    }, 1800)
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f4efe4_0%,#f8f5ee_36%,#f5f3ec_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6 lg:px-8">
        <Card className="overflow-hidden border-none bg-stone-950 text-stone-50 shadow-2xl shadow-stone-900/20">
          <CardHeader className="gap-5 border-b border-stone-800/70 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(28,25,23,0.92)_44%,rgba(68,64,60,0.94))] px-6 py-8 md:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-stone-100 text-stone-900">
                Heuristic sealed helper
              </Badge>
              <Badge variant="outline" className="border-stone-600 bg-stone-900/40 text-stone-100">
                Top 5 decks
              </Badge>
              <Badge variant="outline" className="border-amber-400/40 bg-amber-300/10 text-amber-100">
                40-card output
              </Badge>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <CardTitle className="text-4xl tracking-tight text-stone-50 md:text-5xl">
                  Build the best Sealed deck from your pool, with explanations a new player can actually use.
                </CardTitle>
                <CardDescription className="max-w-2xl text-base leading-relaxed text-stone-300">
                  Upload one or more rating files, paste your Sealed pool, and compare the five strongest
                  realistic builds. Scores come from card ratings plus Limited heuristics for curve,
                  creatures, interaction, and mana consistency.
                </CardDescription>
              </div>
              <div className="grid min-w-[18rem] gap-3 rounded-2xl border border-stone-700/70 bg-stone-900/45 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-300">Rating files loaded</span>
                  <span className="text-lg font-semibold text-stone-50">{ratingFiles.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-300">Rated cards available</span>
                  <span className="text-lg font-semibold text-stone-50">{totalRatedCards}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-300">Pool entries</span>
                  <span className="text-lg font-semibold text-stone-50">{parsedPool.length}</span>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="grid gap-6">
            <Card className="border-stone-200/80 bg-white/90 shadow-lg shadow-stone-400/10 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers3Icon />
                  Pool Input
                </CardTitle>
                <CardDescription>
                  Paste one card per line. You can include counts like <code>2 Lightning Bolt</code>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="sealed-pool">Sealed card pool</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="sealed-pool"
                        className="min-h-72 resize-y bg-stone-50"
                        value={poolText}
                        onChange={(event) => setPoolText(event.target.value)}
                      />
                      <FieldDescription>
                        Matching is name-based and tolerant of punctuation, apostrophes, and underscores.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </CardContent>
              {scryfallErrors.length > 0 && (
                <div className="px-6 pb-2">
                  <Alert variant="destructive">
                    <TriangleAlertIcon />
                    <AlertTitle>Some cards could not be fetched from Scryfall</AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      {scryfallErrors.slice(0, 5).map((error) => (
                        <span key={error}>{error}</span>
                      ))}
                      {scryfallErrors.length > 5 && <span>…and {scryfallErrors.length - 5} more</span>}
                    </AlertDescription>
                  </Alert>
                </div>
              )}
              <CardFooter className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="secondary">{parsedPool.length} entries parsed</Badge>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setPoolText(SAMPLE_POOL)}>
                    <SparklesIcon data-icon="inline-start" />
                    Load sample pool
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleFetchCardData}
                    disabled={parsedPool.length === 0 || isFetchingScryfall}
                  >
                    {isFetchingScryfall
                      ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                      : <DatabaseIcon data-icon="inline-start" />}
                    {isFetchingScryfall
                      ? `Fetching… (${scryfallProgress?.fetched ?? 0}/${scryfallProgress?.total ?? parsedPool.length})`
                      : scryfallData.size > 0
                        ? "Synergy data ready"
                        : "Fetch card data"}
                  </Button>
                  {scryfallData.size > 0 && !isFetchingScryfall && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2Icon className="h-3 w-3" />
                      {scryfallData.size} cards enriched
                    </Badge>
                  )}
                </div>
              </CardFooter>
            </Card>

            <Card className="border-stone-200/80 bg-white/90 shadow-lg shadow-stone-400/10 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode2Icon />
                  Ratings Input
                </CardTitle>
                <CardDescription>
                  Upload one or more <code>SOS.js</code>-style rating files. Main set and bonus sheet files are merged into one card index.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
                    <LayersIcon className="h-4 w-4" />
                    Prebuilt rating sets
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {RATING_PRESETS.map((preset) => {
                      const alreadyLoaded = ratingFiles.some((f) => f.fileName === preset.name)
                      return (
                        <Button
                          key={preset.id}
                          variant="outline"
                          size="sm"
                          disabled={alreadyLoaded}
                          onClick={() => handleLoadPreset(preset)}
                          title={preset.description}
                        >
                          {alreadyLoaded && <CheckCircle2Icon className="h-3.5 w-3.5 text-emerald-600" data-icon="inline-start" />}
                          {preset.name}
                        </Button>
                      )
                    })}
                  </div>
                </div>

                <Separator />

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="rating-files">Upload your own</FieldLabel>
                    <FieldContent>
                      <Input
                        id="rating-files"
                        type="file"
                        accept=".js,.txt"
                        multiple
                        onChange={handleFileUpload}
                      />
                      <FieldDescription>
                        Files are parsed safely from their array payload instead of being executed.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldGroup>

                {fileErrors.length > 0 && (
                  <Alert variant="destructive">
                    <TriangleAlertIcon />
                    <AlertTitle>Some rating files could not be loaded</AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      {fileErrors.map((error) => (
                        <span key={error}>{error}</span>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  {ratingFiles.map((file) => (
                    <Card key={file.fileName} size="sm" className="bg-stone-50/90">
                      <CardHeader>
                        <CardTitle className="text-base">{file.fileName}</CardTitle>
                        <CardDescription>{file.cards.length} cards parsed</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}

                  {ratingFiles.length === 0 && (
                    <Empty className="border border-dashed border-stone-300 bg-stone-50/90">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FileCode2Icon />
                        </EmptyMedia>
                        <EmptyTitle>No rating files yet</EmptyTitle>
                        <EmptyDescription>
                          Upload at least one set rating file so the deckbuilder has card scores to work with.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>

                {mergedRatings.conflicts.length > 0 && (
                  <Alert>
                    <InfoIcon />
                    <AlertTitle>Duplicate card names were found</AlertTitle>
                    <AlertDescription>{mergedRatings.conflicts[0]}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="secondary">{mergedRatings.index.size} unique rated cards</Badge>
                <Button variant="ghost" onClick={handleResetFiles}>
                  Clear rating files
                </Button>
              </CardFooter>
            </Card>
          </div>

          <Card className="border-stone-200/80 bg-white/90 shadow-lg shadow-stone-400/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WandSparklesIcon />
                Top 5 Decks
              </CardTitle>
              <CardDescription>
                Scores blend raw ratings with Limited heuristics for mana, curve, creatures, and interaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleEvaluate} disabled={isEvaluating}>
                  {isEvaluating ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
                  Evaluate pool
                </Button>
                <Badge variant="outline">{results.length} decks ready</Badge>
                <Badge variant="outline">{missingCards.length} missing pool entries</Badge>
              </div>

              {missingCards.length > 0 && (
                <Alert>
                  <InfoIcon />
                  <AlertTitle>Some pool cards are missing from the combined rating files</AlertTitle>
                  <AlertDescription>
                    {missingCards.slice(0, 8).join(", ")}
                    {missingCards.length > 8 ? "..." : ""}
                  </AlertDescription>
                </Alert>
              )}

              {isEvaluating && (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-28 w-full rounded-xl" />
                  <Skeleton className="h-28 w-full rounded-xl" />
                  <Skeleton className="h-28 w-full rounded-xl" />
                </div>
              )}

              {!isEvaluating && results.length === 0 && (
                <Empty className="border border-dashed border-stone-300 bg-stone-50/70">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <WandSparklesIcon />
                    </EmptyMedia>
                    <EmptyTitle>No ranked decks yet</EmptyTitle>
                    <EmptyDescription>
                      Upload ratings, paste your pool, then run the evaluator to generate the five strongest deck options.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    The app focuses on realistic Sealed builds: mono-color where viable, two-color decks, and careful light splashes.
                  </EmptyContent>
                </Empty>
              )}

              {!isEvaluating && results.length > 0 && (
                <ScrollArea className="h-[70vh] pr-3">
                  <div className="flex flex-col gap-4">
                    {results.map((deck, index) => (
                      <Card key={deck.id} className="overflow-hidden border-stone-200">
                        <CardHeader className="gap-4 bg-stone-50/80">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge>#{index + 1}</Badge>
                                {formatColors(deck).map((color) => (
                                  <Badge key={`${deck.id}-${color}`} variant="outline">
                                    {color}
                                  </Badge>
                                ))}
                              </div>
                              <CardTitle className="flex flex-wrap items-baseline gap-2 text-2xl">
                                Score {deck.totalScore.toFixed(2)}
                                {deck.scoreBreakdown.synergyBonus > 0 && (
                                  <span className="text-base font-normal text-emerald-600">
                                    +{deck.scoreBreakdown.synergyBonus.toFixed(1)} synergy
                                  </span>
                                )}
                              </CardTitle>
                              <CardDescription className="max-w-2xl text-sm leading-relaxed text-stone-700">
                                {deck.explanation}
                              </CardDescription>
                            </div>
                            <div className="flex min-w-[15rem] flex-col gap-3">
                              <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-stone-500">Creatures</span>
                                  <span className="font-medium">{deck.metrics.creatureCount}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-stone-500">Interaction</span>
                                  <span className="font-medium">{deck.metrics.interactionCount}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-stone-500">Cheap plays</span>
                                  <span className="font-medium">{deck.metrics.cheapPlays}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-stone-500">Avg. mana value</span>
                                  <span className="font-medium">{deck.metrics.averageCmc.toFixed(1)}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => copyText(formatDeckListForCopy(deck), `${deck.id}-full`)}
                                >
                                  <CopyIcon data-icon="inline-start" />
                                  {copiedDeckId === `${deck.id}-full` ? "Copied deck" : "Copy deck"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => copyText(formatManaBaseForCopy(deck), `${deck.id}-mana`)}
                                >
                                  <CopyIcon data-icon="inline-start" />
                                  {copiedDeckId === `${deck.id}-mana` ? "Copied mana" : "Copy mana"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-5">
                          <Tabs defaultValue="deck">
                            <TabsList>
                              <TabsTrigger value="deck">Deck list</TabsTrigger>
                              <TabsTrigger value="mana">Mana base</TabsTrigger>
                              <TabsTrigger value="notes">Why it ranked here</TabsTrigger>
                            </TabsList>
                            <TabsContent value="deck" className="pt-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Card</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Rating</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {deck.fullDeck.map((entry) => (
                                    <TableRow key={`${deck.id}-${entry.card.normalizedName}`}>
                                      <TableCell>{entry.quantity}</TableCell>
                                      <TableCell className="font-medium">
                                        {entry.card.displayName}
                                      </TableCell>
                                      <TableCell>{entry.card.type}</TableCell>
                                      <TableCell className="text-right">
                                        {entry.card.rating.toFixed(1)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TabsContent>
                            <TabsContent value="mana" className="pt-4">
                              <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap gap-2">
                                  {describeManaBase(deck.basicLands).map((line) => (
                                    <Badge key={`${deck.id}-${line}`} variant="secondary">
                                      {line}
                                    </Badge>
                                  ))}
                                </div>
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                  This deck uses {deck.landCount} basic lands to support {formatColors(deck).join(", ")}.
                                </p>
                              </div>
                            </TabsContent>
                            <TabsContent value="notes" className="pt-4">
                              <Accordion type="single" collapsible defaultValue="summary">
                                <AccordionItem value="summary">
                                  <AccordionTrigger>Quick explanation</AccordionTrigger>
                                  <AccordionContent>{deck.explanation}</AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="synergy">
                                  <AccordionTrigger>Synergy analysis</AccordionTrigger>
                                  <AccordionContent>
                                    {Object.keys(deck.synergyBreakdown).length > 0 ? (
                                      <div className="flex flex-col gap-2">
                                        {(Object.entries(deck.synergyBreakdown) as [SynergyTag, number][])
                                          .sort(([, a], [, b]) => b - a)
                                          .map(([tag, score]) => (
                                            <div key={tag} className="flex items-center justify-between text-sm">
                                              <span className="text-stone-700">{SYNERGY_TAG_LABELS[tag]}</span>
                                              <Badge variant="secondary" className="text-emerald-700">
                                                +{score.toFixed(1)}
                                              </Badge>
                                            </div>
                                          ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        {scryfallData.size > 0
                                          ? "No meaningful synergies detected for this deck."
                                          : "Fetch card data to see synergy analysis."}
                                      </p>
                                    )}
                                  </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="diagnostics">
                                  <AccordionTrigger>Detailed deck notes</AccordionTrigger>
                                  <AccordionContent className="flex flex-col gap-2">
                                    {deck.diagnostics.map((line) => (
                                      <p key={`${deck.id}-${line}`} className="text-sm text-muted-foreground">
                                        {line}
                                      </p>
                                    ))}
                                  </AccordionContent>
                                </AccordionItem>
                              </Accordion>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                        <CardFooter className="bg-stone-50/60">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                            <span>Deck: {deck.totalCardCount} cards</span>
                            <Separator orientation="vertical" className="h-4" />
                            <span>Spells: {deck.spellCount}</span>
                            <Separator orientation="vertical" className="h-4" />
                            <span>Lands: {deck.landCount}</span>
                            <Separator orientation="vertical" className="h-4" />
                            <span>Mana stability: {deck.metrics.manaStability.toFixed(1)}</span>
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

export default App
