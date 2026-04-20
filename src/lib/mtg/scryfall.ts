import { normalizeCardName } from "@/lib/mtg/normalize"

export type ScryfallCard = {
  name: string
  oracle_text?: string
  keywords: string[]
  type_line: string
  layout?: string
  cmc?: number
  card_faces?: {
    name: string
    oracle_text: string
    keywords: string[]
    type_line: string
  }[]
}

export type ScryfallDataMap = Map<string, ScryfallCard>

export type ScryfallFetchResult = {
  data: ScryfallDataMap
  failedNames: string[]
  fetchErrors: string[]
}

type ScryfallCollectionResponse = {
  data: ScryfallCard[]
  not_found: { name?: string }[]
}

const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection"
const BATCH_SIZE = 75
const BATCH_DELAY_MS = 100

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function indexCard(card: ScryfallCard, data: ScryfallDataMap): void {
  data.set(normalizeCardName(card.name), card)
  if (card.card_faces && card.card_faces.length > 0) {
    data.set(normalizeCardName(card.card_faces[0].name), card)
    if (card.card_faces.length > 1) {
      data.set(normalizeCardName(card.card_faces[1].name), card)
    }
  }
}

export async function batchFetchCards(
  names: string[],
  onProgress?: (fetched: number, total: number) => void,
): Promise<ScryfallFetchResult> {
  const unique = [...new Set(names)]
  const batches = chunk(unique, BATCH_SIZE)
  const data: ScryfallDataMap = new Map()
  const failedNames: string[] = []
  const fetchErrors: string[] = []
  let fetched = 0

  for (let i = 0; i < batches.length; i++) {
    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }

    const batch = batches[i]

    try {
      const response = await fetch(SCRYFALL_COLLECTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifiers: batch.map((name) => ({ name: name.includes("//") ? name.split("//")[0].trim() : name })),
        }),
      })

      if (!response.ok) {
        fetchErrors.push(`Batch ${i + 1}: HTTP ${response.status}`)
        continue
      }

      const json = (await response.json()) as ScryfallCollectionResponse

      for (const card of json.data) {
        indexCard(card, data)
      }

      for (const notFound of json.not_found) {
        if (notFound.name) {
          failedNames.push(notFound.name)
        }
      }
    } catch (error) {
      fetchErrors.push(
        `Batch ${i + 1}: ${error instanceof Error ? error.message : "Network error"}`,
      )
    }

    fetched += batch.length
    onProgress?.(Math.min(fetched, unique.length), unique.length)
  }

  return { data, failedNames, fetchErrors }
}
