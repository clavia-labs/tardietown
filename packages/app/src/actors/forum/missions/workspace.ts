export interface MissionFile {
  path: string
  content: string
  revision: number
  author: string
  at: number
}
export type MissionFileInfo = Omit<MissionFile, "content">
export type PersistMissionFile = (missionId: string, file: MissionFile) => void

// Authorization belongs to MissionStore so a handoff changes write access atomically.
export class MissionWorkspace {
  private files = new Map<string, Map<string, MissionFile>>()
  restoreHistory(files: ReadonlyMap<string, ReadonlyMap<string, MissionFile>>) { this.files = new Map([...files].map(([id, values]) => [id, new Map(values)])) }
  constructor(private persist?: PersistMissionFile) {}
  list(missionId: string): MissionFileInfo[] {
    return [...(this.files.get(missionId)?.values() ?? [])].map(({ content, ...file }) => file).sort((a, b) => a.path.localeCompare(b.path))
  }
  read(missionId: string, path: string): MissionFile | undefined { return this.files.get(missionId)?.get(path) }
  write(missionId: string, author: string, path: string, content: string, expectedRevision: number, at: number): { ok: true; file: MissionFile } | { ok: false; error: string } {
    if (path.length > 240 || !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?$/.test(path)) return { ok: false, error: "Use a relative file path such as scratch/notes.md or research-brief.md. No traversal or absolute paths." }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { ok: false, error: "expectedRevision must be a nonnegative integer; use 0 for a new file." }
    const files = this.files.get(missionId) ?? new Map<string, MissionFile>()
    const previous = files.get(path)
    if ((previous?.revision ?? 0) !== expectedRevision) return { ok: false, error: "Revision conflict. Read the file again before updating it." }
    const total = [...this.files.values()].flatMap(entries => [...entries.values()]).reduce((sum, file) => sum + file.content.length, 0)
    if (content.length > 100000 || total - (previous?.content.length ?? 0) + content.length > 2000000 || (!previous && files.size >= 100)) return { ok: false, error: "Workspace limit reached: 100 files per mission, 100,000 characters per file, 2,000,000 characters per town." }
    const file = Object.freeze({ path, content, author, revision: expectedRevision + 1, at })
    try { this.persist?.(missionId, file) } catch { return { ok: false, error: "Could not save the file. No changes were applied." } }
    files.set(path, file)
    this.files.set(missionId, files)
    return { ok: true, file }
  }
}
