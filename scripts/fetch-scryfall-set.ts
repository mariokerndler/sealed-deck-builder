#!/usr/bin/env node
/**
 * Fetches Scryfall card data for a preset and saves it to src/data/scryfall/{presetId}.json.
 *
 * Reads card names from src/data/ratings/{presetId}.json, batches them through the
 * Scryfall /cards/collection endpoint, strips to only the fields the synergy engine
 * needs, and writes the result.
 *
 * Usage:
 *   node --experimental-strip-types scripts/fetch-scryfall-set.ts <presetId>
 *   node --experimental-strip-types scripts/fetch-scryfall-set.ts sos
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// ---- Types (mirrors src/lib/mtg/scryfall.ts) --------------------------------

type CardFace = {
  name: string
  oracle_text: string
  keywords: string[]
  type_line: string
}

type ScryfallCard = {
  name: string
  oracle_text?: string
  keywords: string[]
  type_line: string
  layout?: string
  cmc?: number
  card_faces?: CardFace[]
}

type RatingEntry = {
  name: string
}

// ---- Helpers ----------------------------------------------------------------

function formatCardName(raw: string): string {
  return raw.replace(/_/g, " ").trim()
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function stripCard(raw: Record<string, unknown>): ScryfallCard {
  const card: ScryfallCard = {
    name: String(raw.name ?? ""),
    keywords: Array.isArray(raw.keywords) ? (raw.keywords as string[]) : [],
    type_line: String(raw.type_line ?? ""),
  }
  if (raw.oracle_text !== undefined) card.oracle_text = String(raw.oracle_text)
  if (raw.layout !== undefined) card.layout = String(raw.layout)
  if (raw.cmc !== undefined) card.cmc = Number(raw.cmc)
  if (Array.isArray(raw.card_faces)) {
    card.card_faces = (raw.card_faces as Record<string, unknown>[]).map((f) => ({
      name: String(f.name ?? ""),
      oracle_text: String(f.oracle_text ?? ""),
      keywords: Array.isArray(f.keywords) ? (f.keywords as string[]) : [],
      type_line: String(f.type_line ?? ""),
    }))
  }
  return card
}

// ---- Scryfall fetch ---------------------------------------------------------

async function fetchByNames(
  names: string[],
): Promise<{ cards: ScryfallCard[]; failed: string[] }> {
  const unique = [...new Set(names)]
  const batches = chunk(unique, 75)
  const cards: ScryfallCard[] = []
  const failed: string[] = []

  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, 100))

    const identifiers = batches[i].map((name) => ({
      name: name.includes("//") ? name.split("//")[0].trim() : name,
    }))

    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers }),
    })

    if (!res.ok) {
      console.error(`  Batch ${i + 1} HTTP ${res.status} — skipping`)
      continue
    }

    const json = (await res.json()) as {
      data: Record<string, unknown>[]
      not_found: { name?: string }[]
    }

    cards.push(...json.data.map(stripCard))
    for (const nf of json.not_found) {
      if (nf.name) failed.push(nf.name)
    }

    const fetched = Math.min((i + 1) * 75, unique.length)
    process.stdout.write(`\r  ${fetched} / ${unique.length} fetched`)
  }

  process.stdout.write("\n")
  return { cards, failed }
}

// ---- Main -------------------------------------------------------------------

async function main() {
  const presetId = process.argv[2]

  if (!presetId) {
    console.error("Usage: node --experimental-strip-types scripts/fetch-scryfall-set.ts <presetId>")
    process.exit(1)
  }

  const ratingsPath = path.join(ROOT, "src/data/ratings", `${presetId}.json`)
  if (!fs.existsSync(ratingsPath)) {
    console.error(`Rating file not found: ${ratingsPath}`)
    process.exit(1)
  }

  const ratings = JSON.parse(fs.readFileSync(ratingsPath, "utf8")) as RatingEntry[]
  const names = ratings.map((c) => formatCardName(c.name)).filter(Boolean)

  console.log(`Fetching Scryfall data for ${names.length} cards (preset: ${presetId})…`)

  const { cards, failed } = await fetchByNames(names)

  if (failed.length > 0) {
    console.warn(`  Not found on Scryfall (${failed.length}): ${failed.slice(0, 8).join(", ")}${failed.length > 8 ? "…" : ""}`)
  }

  const outDir = path.join(ROOT, "src/data/scryfall")
  fs.mkdirSync(outDir, { recursive: true })

  const outPath = path.join(outDir, `${presetId}.json`)
  fs.writeFileSync(outPath, JSON.stringify(cards))

  const kb = (fs.statSync(outPath).size / 1024).toFixed(1)
  console.log(`  Saved ${cards.length} cards → src/data/scryfall/${presetId}.json (${kb} KB)`)
}

main().catch((err: unknown) => {
  console.error("Fatal:", err)
  process.exit(1)
})
