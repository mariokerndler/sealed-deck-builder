import { formatCardName, getCardNameAliases, normalizeCardName } from "@/lib/mtg/normalize"
import type {
  CardRegion,
  OcrTitleResult,
  PoolImportCandidate,
  PoolImportCandidateIndex,
  PoolPhotoImportProgress,
  ResolvedPoolImportEntry,
  ResolvedPoolImportResult,
  RatingMergeResult,
} from "@/lib/mtg/types"
import type { ScryfallDataMap } from "@/lib/mtg/scryfall"

type CanvasSource = ImageBitmap | HTMLImageElement

type OpenCvNamespace = {
  Mat: new () => unknown
  MatVector: new () => {
    size(): number
    get(index: number): unknown
    delete(): void
  }
  imread(canvas: HTMLCanvasElement): unknown
  cvtColor(src: unknown, dst: unknown, code: number): void
  GaussianBlur(src: unknown, dst: unknown, size: { width: number; height: number }, sigmaX: number): void
  Canny(src: unknown, dst: unknown, threshold1: number, threshold2: number): void
  dilate(src: unknown, dst: unknown, kernel: unknown, anchor: { x: number; y: number }, iterations: number): void
  findContours(image: unknown, contours: unknown, hierarchy: unknown, mode: number, method: number): void
  approxPolyDP(curve: unknown, approxCurve: unknown, epsilon: number, closed: boolean): void
  arcLength(curve: unknown, closed: boolean): number
  boundingRect(array: unknown): { x: number; y: number; width: number; height: number }
  contourArea(contour: unknown): number
  Size: new (width: number, height: number) => { width: number; height: number }
  Point: new (x: number, y: number) => { x: number; y: number }
  COLOR_RGBA2GRAY: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
}

type TesseractWorker = {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>
  setParameters(params: Record<string, string>): Promise<unknown>
  terminate(): Promise<unknown>
}

const OCR_CHAR_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-' ,//"
const OPENCV_SCRIPT_URL = "https://docs.opencv.org/4.x/opencv.js"
const MAX_IMAGE_DIMENSION = 1800
const MIN_CARD_RATIO = 0.58
const MAX_CARD_RATIO = 0.78
const MIN_REGION_AREA_RATIO = 0.0035
const MAX_REGION_AREA_RATIO = 0.12
const MIN_DETECTED_CARDS = 4
const AUTO_ACCEPT_THRESHOLD = 0.94
const REVIEW_THRESHOLD = 0.72

let openCvPromise: Promise<OpenCvNamespace> | null = null
let tesseractModulePromise: Promise<typeof import("tesseract.js")> | null = null

function round(value: number) {
  return Math.round(value * 100) / 100
}

function stripOcrNoise(input: string): string {
  return formatCardName(
    input
      .replace(/[\r\n]+/g, " ")
      .replace(/[|_[\]{}<>~`"]/g, " ")
      .replace(/\s{2,}/g, " "),
  )
}

function getLikelyTitleText(input: string): string {
  const cleaned = stripOcrNoise(input)
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const best = lines.sort((a, b) => b.length - a.length)[0] ?? cleaned
  return best.replace(/^\d+\s+/, "").trim()
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1).fill(0)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      )
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[b.length] ?? Math.max(a.length, b.length)
}

function scoreAliasMatch(query: string, alias: string): number {
  if (query === alias) return 1
  if (alias.startsWith(query) || query.startsWith(alias)) {
    return Math.max(0.88, Math.min(query.length, alias.length) / Math.max(query.length, alias.length))
  }

  const distance = levenshteinDistance(query, alias)
  const ratio = 1 - distance / Math.max(query.length, alias.length, 1)
  if (alias.includes(query) || query.includes(alias)) {
    return Math.max(ratio, 0.84)
  }

  return ratio
}

function dedupeCandidates(candidates: PoolImportCandidate[]): PoolImportCandidate[] {
  const seen = new Set<string>()
  const result: PoolImportCandidate[] = []

  for (const candidate of candidates) {
    if (seen.has(candidate.normalizedName)) {
      continue
    }

    seen.add(candidate.normalizedName)
    result.push(candidate)
  }

  return result
}

function buildRatingCandidates(ratings: RatingMergeResult): PoolImportCandidate[] {
  const byName = new Map<string, PoolImportCandidate>()

  for (const entry of ratings.index.values()) {
    const card = entry.card
    if (byName.has(card.normalizedName)) {
      continue
    }

    byName.set(card.normalizedName, {
      name: card.displayName,
      normalizedName: card.normalizedName,
      aliases: card.aliases,
      normalizedAliases: card.normalizedAliases,
      source: "rating",
    })
  }

  return [...byName.values()]
}

function buildScryfallCandidates(scryfallData: ScryfallDataMap): PoolImportCandidate[] {
  const byName = new Map<string, PoolImportCandidate>()

  for (const card of new Map([...scryfallData.entries()]).values()) {
    const name = formatCardName(card.name)
    const aliases = getCardNameAliases(name)
    const normalizedName = normalizeCardName(name)

    if (byName.has(normalizedName)) {
      continue
    }

    byName.set(normalizedName, {
      name,
      normalizedName,
      aliases,
      normalizedAliases: aliases.map((alias) => normalizeCardName(alias)),
      source: "scryfall",
    })
  }

  return [...byName.values()]
}

function addCandidatesToAliasMap(
  aliasMap: Map<string, PoolImportCandidate>,
  candidates: PoolImportCandidate[],
): void {
  for (const candidate of candidates) {
    for (const alias of candidate.normalizedAliases) {
      if (!aliasMap.has(alias)) {
        aliasMap.set(alias, candidate)
      }
    }
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return canvas
}

function drawToCanvas(source: CanvasSource, maxDimension = MAX_IMAGE_DIMENSION) {
  const sourceWidth = "width" in source ? source.width : 0
  const sourceHeight = "height" in source ? source.height : 0
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight, 1))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Could not create a canvas context for OCR.")
  }

  context.drawImage(source, 0, 0, width, height)
  return { canvas, scale, width, height }
}

function getIntersectionOverUnion(a: CardRegion, b: CardRegion): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const width = Math.max(0, x2 - x1)
  const height = Math.max(0, y2 - y1)
  const intersection = width * height

  if (intersection === 0) {
    return 0
  }

  const union = a.width * a.height + b.width * b.height - intersection
  return union <= 0 ? 0 : intersection / union
}

async function loadOpenCv(): Promise<OpenCvNamespace> {
  if (typeof window === "undefined") {
    throw new Error("OCR is only available in the browser.")
  }

  const existing = (window as Window & { cv?: OpenCvNamespace }).cv
  if (existing?.Mat) {
    return existing
  }

  if (!openCvPromise) {
    openCvPromise = new Promise<OpenCvNamespace>((resolve, reject) => {
      const activeWindow = window as Window & { cv?: OpenCvNamespace & { onRuntimeInitialized?: () => void } }
      const priorScript = document.querySelector<HTMLScriptElement>('script[data-opencv-loader="true"]')

      const handleReady = () => {
        if (activeWindow.cv?.Mat) {
          resolve(activeWindow.cv)
        }
      }

      if (priorScript) {
        priorScript.addEventListener("load", handleReady, { once: true })
        priorScript.addEventListener("error", () => reject(new Error("Could not load OpenCV.")), { once: true })
        if (activeWindow.cv) {
          activeWindow.cv.onRuntimeInitialized = handleReady
        }
        return
      }

      const script = document.createElement("script")
      script.async = true
      script.src = OPENCV_SCRIPT_URL
      script.dataset.opencvLoader = "true"
      script.onerror = () => reject(new Error("Could not load OpenCV."))
      script.onload = () => {
        if (activeWindow.cv?.Mat) {
          resolve(activeWindow.cv)
          return
        }

        if (!activeWindow.cv) {
          reject(new Error("OpenCV did not initialize correctly."))
          return
        }

        activeWindow.cv.onRuntimeInitialized = () => resolve(activeWindow.cv as OpenCvNamespace)
      }

      document.head.appendChild(script)
    })
  }

  return openCvPromise
}

async function loadTesseractWorker(
  logger?: (progress: number, status: string) => void,
): Promise<TesseractWorker> {
  tesseractModulePromise ??= import("tesseract.js")
  const { createWorker, PSM } = await tesseractModulePromise
  const worker = await createWorker("eng", 1, {
    logger(message) {
      logger?.(message.progress ?? 0, message.status ?? "recognizing")
    },
  })

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: OCR_CHAR_WHITELIST,
    preserve_interword_spaces: "1",
  })

  return worker as TesseractWorker
}

function preprocessTitleCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(Math.max(1, source.width * 2), Math.max(1, source.height * 2))
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Could not preprocess the OCR crop.")
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let index = 0; index < data.length; index += 4) {
    const grayscale = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const contrasted = grayscale > 135 ? 255 : 0
    data[index] = contrasted
    data[index + 1] = contrasted
    data[index + 2] = contrasted
    data[index + 3] = 255
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

function cropTitleRegion(source: CanvasSource, region: CardRegion): HTMLCanvasElement {
  const paddingX = Math.round(region.width * 0.05)
  const topInset = Math.round(region.height * 0.035)
  const titleHeight = Math.max(28, Math.round(region.height * 0.14))
  const canvas = createCanvas(
    Math.max(1, region.width - paddingX * 2),
    Math.max(1, titleHeight),
  )
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Could not crop the card title.")
  }

  context.drawImage(
    source,
    region.x + paddingX,
    region.y + topInset,
    Math.max(1, region.width - paddingX * 2),
    Math.max(1, titleHeight),
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return preprocessTitleCanvas(canvas)
}

export async function detectCardRegions(image: CanvasSource): Promise<CardRegion[]> {
  const cv = await loadOpenCv()
  const { canvas, scale, width, height } = drawToCanvas(image)
  const imageArea = width * height

  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const approximated = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 75, 190)
    cv.dilate(edges, edges, new cv.Mat(), new cv.Point(-1, -1), 1)
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const regions: CardRegion[] = []

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const perimeter = cv.arcLength(contour, true)
      cv.approxPolyDP(contour, approximated, 0.03 * perimeter, true)
      const rect = cv.boundingRect(approximated)
      const area = rect.width * rect.height
      const ratio = rect.width / Math.max(rect.height, 1)
      const areaRatio = area / Math.max(imageArea, 1)

      if (ratio < MIN_CARD_RATIO || ratio > MAX_CARD_RATIO) {
        continue
      }

      if (areaRatio < MIN_REGION_AREA_RATIO || areaRatio > MAX_REGION_AREA_RATIO) {
        continue
      }

      const region: CardRegion = {
        id: `region-${index + 1}`,
        x: Math.round(rect.x / scale),
        y: Math.round(rect.y / scale),
        width: Math.round(rect.width / scale),
        height: Math.round(rect.height / scale),
      }

      const overlaps = regions.some((existing) => getIntersectionOverUnion(existing, region) > 0.35)
      if (!overlaps) {
        regions.push(region)
      }
    }

    const sorted = regions.sort((a, b) => {
      const rowDelta = Math.abs(a.y - b.y)
      if (rowDelta > Math.min(a.height, b.height) * 0.4) {
        return a.y - b.y
      }

      return a.x - b.x
    })

    if (sorted.length < MIN_DETECTED_CARDS) {
      throw new Error("I could not confidently detect enough card rectangles. Try a top-down photo with all cards upright, separated, and on a plain dark background.")
    }

    return sorted
  } finally {
    ;[src, gray, blurred, edges, contours, hierarchy, approximated].forEach((value) => {
      if (value && typeof (value as { delete?: () => void }).delete === "function") {
        ;(value as { delete: () => void }).delete()
      }
    })
  }
}

export async function ocrCardTitle(
  regionCanvas: HTMLCanvasElement,
  worker?: TesseractWorker,
): Promise<OcrTitleResult> {
  const activeWorker = worker ?? await loadTesseractWorker()

  try {
    const result = await activeWorker.recognize(regionCanvas)
    return {
      regionId: regionCanvas.dataset.regionId ?? "unknown-region",
      text: getLikelyTitleText(result.data.text ?? ""),
      confidence: round((result.data.confidence ?? 0) / 100),
    }
  } finally {
    if (!worker) {
      await activeWorker.terminate()
    }
  }
}

export function buildPoolImportCandidateIndex(
  ratings: RatingMergeResult,
  scryfallData?: ScryfallDataMap,
): PoolImportCandidateIndex {
  const ratingCandidates = buildRatingCandidates(ratings)
  const scryfallCandidates = scryfallData ? buildScryfallCandidates(scryfallData) : []
  const candidates = dedupeCandidates([...ratingCandidates, ...scryfallCandidates])
  const aliasMap = new Map<string, PoolImportCandidate>()

  addCandidatesToAliasMap(aliasMap, ratingCandidates)
  addCandidatesToAliasMap(aliasMap, scryfallCandidates)

  return { aliasMap, candidates }
}

function createResolvedEntry(
  title: OcrTitleResult,
  candidateIndex: PoolImportCandidateIndex,
): ResolvedPoolImportEntry {
  const cleanedText = getLikelyTitleText(title.text)
  const normalizedText = normalizeCardName(cleanedText)

  if (!normalizedText) {
    return {
      id: title.regionId,
      regionId: title.regionId,
      ocrText: cleanedText,
      ocrConfidence: title.confidence,
      resolvedName: null,
      normalizedResolvedName: null,
      matchedAlias: null,
      matchConfidence: 0,
      source: null,
      needsReview: true,
      reviewStatus: "review",
      provisional: true,
    }
  }

  const exact = candidateIndex.aliasMap.get(normalizedText)
  if (exact) {
    const matchConfidence = round(Math.max(0.96, title.confidence * 0.9 + 0.1))
    return {
      id: title.regionId,
      regionId: title.regionId,
      ocrText: cleanedText,
      ocrConfidence: title.confidence,
      resolvedName: exact.name,
      normalizedResolvedName: exact.normalizedName,
      matchedAlias: normalizedText,
      matchConfidence,
      source: exact.source,
      needsReview: title.confidence < 0.72,
      reviewStatus: title.confidence < 0.72 ? "review" : "accepted",
      provisional: false,
    }
  }

  let bestCandidate: PoolImportCandidate | null = null
  let bestAlias: string | null = null
  let bestScore = 0

  for (const candidate of candidateIndex.candidates) {
    for (const alias of candidate.normalizedAliases) {
      const score = scoreAliasMatch(normalizedText, alias)
      if (score > bestScore) {
        bestCandidate = candidate
        bestAlias = alias
        bestScore = score
      }
    }
  }

  if (bestCandidate && bestScore >= REVIEW_THRESHOLD) {
    const combinedConfidence = round(bestScore * 0.65 + title.confidence * 0.35)
    const autoAccepted = combinedConfidence >= AUTO_ACCEPT_THRESHOLD
    return {
      id: title.regionId,
      regionId: title.regionId,
      ocrText: cleanedText,
      ocrConfidence: title.confidence,
      resolvedName: bestCandidate.name,
      normalizedResolvedName: bestCandidate.normalizedName,
      matchedAlias: bestAlias,
      matchConfidence: combinedConfidence,
      source: bestCandidate.source,
      needsReview: !autoAccepted,
      reviewStatus: autoAccepted ? "accepted" : "review",
      provisional: false,
    }
  }

  return {
    id: title.regionId,
    regionId: title.regionId,
    ocrText: cleanedText,
    ocrConfidence: title.confidence,
    resolvedName: cleanedText ? formatCardName(cleanedText) : null,
    normalizedResolvedName: cleanedText ? normalizeCardName(cleanedText) : null,
    matchedAlias: null,
    matchConfidence: round(title.confidence * 0.45),
    source: cleanedText ? "ocr" : null,
    needsReview: true,
    reviewStatus: "review",
    provisional: true,
  }
}

export function resolveOcrTitles(
  titles: OcrTitleResult[],
  candidateIndex: PoolImportCandidateIndex,
): ResolvedPoolImportResult {
  const entries = titles.map((title) => createResolvedEntry(title, candidateIndex))
  const acceptedCount = entries.filter((entry) => entry.reviewStatus === "accepted").length
  const reviewCount = entries.filter((entry) => entry.reviewStatus === "review").length
  const rejectedCount = entries.filter((entry) => entry.reviewStatus === "rejected").length
  const warning = candidateIndex.candidates.length === 0
    ? "OCR imported provisional card names, but there were no loaded ratings or Scryfall names to match against yet."
    : undefined

  return {
    entries,
    detectedCards: entries.length,
    acceptedCount,
    reviewCount,
    rejectedCount,
    usedFallbackDetection: false,
    warning,
  }
}

export function formatResolvedPool(result: ResolvedPoolImportResult): string {
  const counts = new Map<string, { name: string; normalizedName: string }>()

  for (const entry of result.entries) {
    if (entry.reviewStatus === "rejected" || !entry.resolvedName || !entry.normalizedResolvedName) {
      continue
    }

    const existing = counts.get(entry.normalizedResolvedName)
    if (existing) {
      counts.set(entry.normalizedResolvedName, existing)
      continue
    }

    counts.set(entry.normalizedResolvedName, {
      name: formatCardName(entry.resolvedName),
      normalizedName: entry.normalizedResolvedName,
    })
  }

  const quantityByName = new Map<string, number>()
  for (const entry of result.entries) {
    if (entry.reviewStatus === "rejected" || !entry.normalizedResolvedName) {
      continue
    }

    quantityByName.set(
      entry.normalizedResolvedName,
      (quantityByName.get(entry.normalizedResolvedName) ?? 0) + 1,
    )
  }

  return [...counts.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${quantityByName.get(entry.normalizedName) ?? 1} ${entry.name}`)
    .join("\n")
}

export async function importPoolFromImage(
  file: File,
  candidateIndex: PoolImportCandidateIndex,
  onProgress?: (progress: PoolPhotoImportProgress) => void,
): Promise<ResolvedPoolImportResult> {
  if (typeof window === "undefined") {
    throw new Error("OCR import is only available in the browser.")
  }

  onProgress?.({
    stage: "detecting",
    processed: 0,
    total: 1,
    message: "Detecting card rectangles in the photo...",
  })

  const image = await createImageBitmap(file)
  const regions = await detectCardRegions(image)
  const worker = await loadTesseractWorker((progress, status) => {
    onProgress?.({
      stage: "ocr",
      processed: Math.round(progress * 100),
      total: 100,
      message: `OCR engine ${status}...`,
    })
  })

  try {
    const titles: OcrTitleResult[] = []

    for (let index = 0; index < regions.length; index += 1) {
      const region = regions[index]
      onProgress?.({
        stage: "ocr",
        processed: index,
        total: regions.length,
        message: `Reading card title ${index + 1} of ${regions.length}...`,
      })

      const titleCanvas = cropTitleRegion(image, region)
      titleCanvas.dataset.regionId = region.id
      const title = await ocrCardTitle(titleCanvas, worker)
      titles.push(title)
    }

    onProgress?.({
      stage: "matching",
      processed: titles.length,
      total: titles.length,
      message: "Matching OCR text to known card names...",
    })

    return resolveOcrTitles(titles, candidateIndex)
  } finally {
    image.close()
    await worker.terminate()
  }
}
