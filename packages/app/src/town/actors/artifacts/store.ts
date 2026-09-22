export interface Artifact { path: string; revision: number; author: string; summary: string; at: number; characters: number }
export interface ArtifactDocument extends Artifact { content: string }
export const DEFAULT_ARTIFACT_POLICY = { maxFiles: 100, maxCharacters: 100000, maxStoredCharacters: 2000000 }
export type ArtifactPolicy = typeof DEFAULT_ARTIFACT_POLICY
export class ArtifactStore {
  readonly policy: ArtifactPolicy
  private files = new Map<string, ArtifactDocument[]>()
  private operations = new Map<string, { fingerprint: string; result: ReturnType<ArtifactStore["write"]> }>()
  private listeners = new Set<() => void>()
  private revision = 0
  private reads = new Map<string, Set<string>>()
  readFor(author: string, path: string, revision?: number): ArtifactDocument | undefined {
    const file = this.read(path, revision)
    if (file) {
      const seen = this.reads.get(author) ?? new Set<string>()
      seen.add(JSON.stringify([file.path, file.revision]))
      this.reads.set(author, seen)
    }
    return file
  }
  hasRead(author: string, path: string, revision: number): boolean { return this.reads.get(author)?.has(JSON.stringify([path, revision])) ?? false }
  constructor(policy: Partial<ArtifactPolicy> = {}, private persist?: (document: ArtifactDocument) => void) {
    this.policy = { ...DEFAULT_ARTIFACT_POLICY, ...policy }
    if (Object.values(this.policy).some((value) => !Number.isSafeInteger(value) || value < 1)) throw Error("Artifact limits must be positive integers.")
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  version = () => this.revision
  list = (): Artifact[] => [...this.files.values()].map((versions) => {
    const { content, ...file } = versions.at(-1)!
    return file
  }).sort((a,b) => a.path.localeCompare(b.path))
  read(path: string, revision?: number): ArtifactDocument | undefined {
    const versions = this.files.get(path)
    return versions?.find((file) => file.revision === (revision ?? versions.at(-1)?.revision))
  }
  history(path: string): Artifact[] { return (this.files.get(path) ?? []).map(({content, ...file}) => file) }
  publish(author: string, operationId: string, input: { path: string; content: string; summary: string; expectedRevision: number }) {
    const key = JSON.stringify([author, operationId]), fingerprint = JSON.stringify(input)
    const prior = this.operations.get(key)
    if (prior) return prior.fingerprint === fingerprint ? prior.result : { ok: false as const, error: "Operation ID already used with different arguments." }
    const result = this.write(author, input)
    this.operations.set(key, { fingerprint, result })
    return result
  }
  private write(author: string, input: { path: string; content: string; summary: string; expectedRevision: number }) {
    const fail = (error: string) => ({ ok: false as const, error, policy: this.policy })
    if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.md$/.test(input.path)) return fail("Use an absolute Markdown path, for example /news/daily-brief.md. Path segments may contain letters, digits, underscores and hyphens.")
    if (!author || !input.content.trim() || !input.summary.trim() || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) return fail("Content, summary and a nonnegative expectedRevision are required.")
    const versions = this.files.get(input.path) ?? []
    const current = versions.at(-1)?.revision ?? 0
    if (current !== input.expectedRevision) return { ...fail("Revision conflict. Read the current document, reconcile your changes, then publish against that revision."), currentRevision: current }
    if (!versions.length && this.files.size >= this.policy.maxFiles) return fail("The shared workspace has reached its file limit.")
    if (input.content.length > this.policy.maxCharacters) return fail("The document exceeds maxCharacters.")
    const stored = [...this.files.values()].flat().reduce((sum, file) => sum + file.content.length + file.summary.length, 0)
    if (stored + input.content.length + input.summary.length > this.policy.maxStoredCharacters) return fail("The shared workspace has reached its storage limit, including revision history.")
    const file = Object.freeze({ path: input.path, content: input.content, summary: input.summary, revision: current + 1, author, at: Date.now(), characters: input.content.length })
    try { this.persist?.(file) } catch { return fail("The server could not save this artifact. No revision was published.") }
    this.files.set(input.path, [...versions, file])
    this.revision++
    this.listeners.forEach((listener) => listener())
    const { content, ...metadata } = file
    return { ok: true as const, artifact: metadata, policy: this.policy }
  }
}
