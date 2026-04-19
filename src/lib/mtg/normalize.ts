export function formatCardName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeCardName(name: string): string {
  return formatCardName(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
}
