export interface LibraryEntry {
  readonly id: string
  readonly title: string
  readonly sourceUrl?: string
  readonly author: string
  readonly at: number
  readonly characters: number
}

export interface LibraryDocument extends LibraryEntry {
  readonly content: string
}

export interface LibrarySearchMatch extends LibraryEntry {
  readonly excerpt: string
}

export const DEFAULT_LIBRARY_POLICY = {
  maxEntries: 500,
  maxTitleCharacters: 200,
  maxContentCharacters: 100000,
  maxStoredCharacters: 5000000,
  maxListEntries: 500,
  maxSearchResults: 20,
  maxSearchQueryCharacters: 200,
  searchExcerptCharacters: 240
}

export type LibraryPolicy = typeof DEFAULT_LIBRARY_POLICY

export type AddLibraryInput = {
  readonly title: string
  readonly content: string
  readonly sourceUrl?: string
}

export type AddLibraryResult =
  | { readonly ok: true; readonly entry: LibraryEntry; readonly existing: boolean; readonly policy: LibraryPolicy }
  | { readonly ok: false; readonly error: string; readonly policy: LibraryPolicy }

export class LibraryStore {
  readonly policy: LibraryPolicy
  private documents = new Map<string, LibraryDocument>()
  private sourceIds = new Map<string, string>()
  private operations = new Map<string, { fingerprint: string; result: AddLibraryResult }>()
  private listeners = new Set<() => void>()
  private revision = 0
  private nextId = 1

  restoreHistory(documents: readonly LibraryDocument[]) {
    this.documents = new Map(documents.map(document => [document.id, Object.freeze(document)]))
    this.sourceIds = new Map(documents.filter(document => document.sourceUrl).map(document => [document.sourceUrl!, document.id]))
    this.nextId = Math.max(0, ...documents.map(document => Number(document.id.replace(/^.*-/, "")) || 0)) + 1
  }
  constructor(policy: Partial<LibraryPolicy> = {}, private now: () => number = Date.now) {
    this.policy = Object.freeze({ ...DEFAULT_LIBRARY_POLICY, ...policy })
    if (Object.values(this.policy).some(value => !Number.isSafeInteger(value) || value < 1)) throw Error("Library limits must be positive integers.")
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  version = () => this.revision

  list(limit = this.policy.maxListEntries): readonly LibraryEntry[] {
    const effectiveLimit = this.limit(limit, this.policy.maxListEntries)
    return [...this.documents.values()].slice(-effectiveLimit).reverse().map(({ content, ...entry }) => Object.freeze(entry))
  }

  read(id: string): LibraryDocument | undefined {
    return this.documents.get(id)
  }

  search(query: string, limit = this.policy.maxSearchResults): readonly LibrarySearchMatch[] {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized || normalized.length > this.policy.maxSearchQueryCharacters) return []
    const terms = normalized.split(/\s+/u)
    const effectiveLimit = this.limit(limit, this.policy.maxSearchResults)
    return [...this.documents.values()].flatMap(document => {
      const haystack = `${document.title}\n${document.content}\n${document.sourceUrl ?? ""}`.toLocaleLowerCase()
      if (!terms.every(term => haystack.includes(term))) return []
      const contentLower = document.content.toLocaleLowerCase()
      const contentIndexes = terms.map(term => contentLower.indexOf(term)).filter(index => index >= 0)
      const first = contentIndexes.length ? Math.min(...contentIndexes) : 0
      const start = Math.max(0, first - Math.floor(this.policy.searchExcerptCharacters / 3))
      const excerpt = document.content.slice(start, start + this.policy.searchExcerptCharacters)
      const { content, ...entry } = document
      return [Object.freeze({ ...entry, excerpt })]
    }).slice(0, effectiveLimit)
  }

  add(author: string, operationId: string, input: AddLibraryInput): AddLibraryResult {
    const key = JSON.stringify([author, operationId])
    const fingerprint = JSON.stringify(input)
    const prior = this.operations.get(key)
    if (prior) return prior.fingerprint === fingerprint ? prior.result : this.fail("Operation ID already used with different arguments.")
    const result = this.write(author, input)
    this.operations.set(key, { fingerprint, result })
    return result
  }

  private write(author: string, input: AddLibraryInput): AddLibraryResult {
    const title = input.title.trim()
    if (!author.trim() || !title || !input.content.trim()) return this.fail("Title and content are required.")
    if (title.length > this.policy.maxTitleCharacters) return this.fail("The title exceeds maxTitleCharacters.")
    if (input.content.length > this.policy.maxContentCharacters) return this.fail("The content exceeds maxContentCharacters.")
    let sourceUrl: string | undefined
    if (input.sourceUrl !== undefined) {
      sourceUrl = normalizeSourceUrl(input.sourceUrl)
      if (!sourceUrl) return this.fail("sourceUrl must be an HTTP or HTTPS URL.")
      const existingId = this.sourceIds.get(sourceUrl)
      const existing = existingId ? this.documents.get(existingId) : undefined
      if (existing) {
        const { content, ...entry } = existing
        return { ok: true, entry: Object.freeze(entry), existing: true, policy: this.policy }
      }
    }
    if (this.documents.size >= this.policy.maxEntries) return this.fail("The library has reached its entry limit.")
    const storedCharacters = [...this.documents.values()].reduce((sum, document) => sum + document.title.length + document.content.length + (document.sourceUrl?.length ?? 0), 0)
    if (storedCharacters + title.length + input.content.length + (sourceUrl?.length ?? 0) > this.policy.maxStoredCharacters) return this.fail("The library has reached its storage limit.")
    const document: LibraryDocument = Object.freeze({
      id: `library-${this.nextId++}`,
      title,
      ...(sourceUrl ? { sourceUrl } : {}),
      content: input.content,
      author,
      at: this.now(),
      characters: input.content.length
    })
    this.documents.set(document.id, document)
    if (sourceUrl) this.sourceIds.set(sourceUrl, document.id)
    this.revision++
    this.listeners.forEach(listener => listener())
    const { content, ...entry } = document
    return { ok: true, entry: Object.freeze(entry), existing: false, policy: this.policy }
  }

  private limit(value: number, maximum: number): number {
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : maximum
  }

  private fail(error: string): AddLibraryResult {
    return { ok: false, error, policy: this.policy }
  }
}

export function normalizeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    url.hash = ""
    url.hostname = url.hostname.toLocaleLowerCase()
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = ""
    return url.href
  } catch {
    return undefined
  }
}
