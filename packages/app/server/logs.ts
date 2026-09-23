import { Database } from "bun:sqlite"
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Effect } from "effect"

// Each restoration gets fresh runtime databases. Original logs remain immutable.
export class TownLogs {
  readonly directory: string
  constructor(root: string, id: string, metadata: unknown, private readonly generation?: string) {
    this.directory = join(root, "towns", id)
    for (const path of [this.directory, join(this.directory, "actors"), join(this.directory, "runtime")]) {
      mkdirSync(path, { recursive: true, mode: 0o700 })
    }
    if (!generation) writeFileSync(join(this.directory, "town.json"), this.serialize(metadata) + "\n", { mode: 0o600 })
  }

  private serialize(value: unknown): string {
    return JSON.stringify(value, (key, value) =>
      /^(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie|set-cookie)$/i.test(key)
        ? "[redacted]"
        : value
    )
  }

  event(type: string, data: unknown) {
    try {
      appendFileSync(join(this.directory, "events.jsonl"), this.serialize({ at: Date.now(), type, data }) + "\n", { mode: 0o600 })
    } catch {
      console.error(`Could not append town event ${type} in ${this.directory}`)
    }
  }

  host(actor: string) {
    const runtime = this.generation ? join(this.directory, "runtime", this.generation) : join(this.directory, "runtime")
    mkdirSync(runtime, { recursive: true, mode: 0o700 })
    const database = join(runtime, `${actor}.sqlite`)
    const threadDatabase = (thread: string) => join(runtime, `${actor}-${encodeURIComponent(thread)}.sqlite`)
    return {
      storage: runtime,
      storageLayout: { databaseFor: () => database, instanceFromFile: () => undefined },
      threadDatabase,
      commitObserverFor: ({ thread }: { thread: string }) => {
        let cursor = 0
        const filename = actor === "resident" ? encodeURIComponent(thread) : `${actor}-${encodeURIComponent(thread)}`
        return {
          onCommit: ({ head }: { head: number }) => Effect.sync(() => {
            // Read only committed events. A commit notification may cover several appends.
            let db: Database | undefined
            try {
              db = new Database(threadDatabase(thread), { readonly: true })
              const rows = db.query<{ seq: number; event: string }, [number, number]>(
                "SELECT seq, event FROM events WHERE seq > ? AND seq <= ? ORDER BY seq"
              ).all(cursor, head)
              if (!rows.length) return
              appendFileSync(join(this.directory, "actors", `${filename}.jsonl`), rows.map(row =>
                this.serialize({ seq: row.seq, actor, thread, recordedAt: Date.now(), event: JSON.parse(row.event) }) + "\n"
              ).join(""), { mode: 0o600 })
              cursor = rows[rows.length - 1]!.seq
            } catch (error) {
              // The SQLite log remains authoritative if a readable export fails.
              console.error(`Could not export town log for ${actor}/${thread}:`, error instanceof Error ? error.message : "Unknown error")
            } finally { db?.close() }
          })
        }
      }
    }
  }
}
