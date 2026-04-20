import { afterEach, describe, expect, it, vi } from "vitest"

import { batchFetchCards } from "@/lib/mtg/scryfall"

function makeScryfallResponse(cards: object[], notFound: object[] = []) {
  return {
    object: "list",
    data: cards,
    not_found: notFound,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("batchFetchCards", () => {
  it("fetches cards and indexes them by normalized name", async () => {
    const mockCard = {
      name: "Lightning Bolt",
      oracle_text: "Deal 3 damage to any target.",
      keywords: [],
      type_line: "Instant",
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeScryfallResponse([mockCard])),
    }))

    const result = await batchFetchCards(["Lightning Bolt"])

    expect(result.data.has("lightning bolt")).toBe(true)
    expect(result.data.get("lightning bolt")?.name).toBe("Lightning Bolt")
    expect(result.failedNames).toHaveLength(0)
    expect(result.fetchErrors).toHaveLength(0)
  })

  it("records not_found entries in failedNames", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(makeScryfallResponse([], [{ name: "Fake Card" }])),
    }))

    const result = await batchFetchCards(["Fake Card"])

    expect(result.failedNames).toContain("Fake Card")
    expect(result.data.size).toBe(0)
  })

  it("handles network errors gracefully and continues", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            makeScryfallResponse([{ name: "Real Card", oracle_text: "", keywords: [], type_line: "Creature" }]),
          ),
      }),
    )

    // First batch fails, second succeeds — use >75 names to force 2 batches
    const names = Array.from({ length: 76 }, (_, i) => i < 75 ? `Fake ${i}` : "Real Card")
    const result = await batchFetchCards(names)

    expect(result.fetchErrors).toHaveLength(1)
    expect(result.fetchErrors[0]).toContain("Network down")
    expect(result.data.has("real card")).toBe(true)
  })

  it("handles HTTP error status gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }))

    const result = await batchFetchCards(["Some Card"])
    expect(result.fetchErrors[0]).toContain("503")
    expect(result.data.size).toBe(0)
  })

  it("indexes both faces of a DFC by name", async () => {
    const dfc = {
      name: "Front Face // Back Face",
      oracle_text: undefined,
      keywords: [],
      type_line: "Creature",
      card_faces: [
        { name: "Front Face", oracle_text: "Front oracle.", keywords: [], type_line: "Creature" },
        { name: "Back Face", oracle_text: "Back oracle.", keywords: [], type_line: "Sorcery" },
      ],
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeScryfallResponse([dfc])),
    }))

    const result = await batchFetchCards(["Front Face // Back Face"])

    expect(result.data.has("front face back face")).toBe(true)
    expect(result.data.has("front face")).toBe(true)
  })

  it("deduplicates input names before batching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeScryfallResponse([])),
    })
    vi.stubGlobal("fetch", fetchMock)

    await batchFetchCards(["Card A", "Card A", "Card A"])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.identifiers).toHaveLength(1)
  })

  it("calls onProgress after each successful batch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeScryfallResponse([])),
    }))

    const onProgress = vi.fn()
    const names = Array.from({ length: 80 }, (_, i) => `Card ${i}`)
    await batchFetchCards(names, onProgress)

    expect(onProgress).toHaveBeenCalledTimes(2)
    // First call: 75 cards fetched out of 80
    expect(onProgress.mock.calls[0]).toEqual([75, 80])
    // Second call: 80 fetched out of 80
    expect(onProgress.mock.calls[1]).toEqual([80, 80])
  })
})
