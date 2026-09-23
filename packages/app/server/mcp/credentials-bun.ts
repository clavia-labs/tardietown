import { Database } from "bun:sqlite"
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Effect, Layer } from "effect"
import { CredentialStore, CredentialStorageError, credentialStore } from "./credentials"

export const sqliteCredentialsLayer = (path: string) => Layer.effect(CredentialStore, Effect.gen(function* () {
  const database = yield* Effect.acquireRelease(Effect.try({
    try: () => {
      if (path !== ":memory:") {
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
        if (!existsSync(path)) writeFileSync(path, "", { flag: "wx", mode: 0o600 })
        chmodSync(path, 0o600)
      }
      const db = new Database(path)
      db.exec("PRAGMA secure_delete = ON")
      return db
    },
    catch: () => new CredentialStorageError({ operation: "open" })
  }), database => Effect.sync(() => database.close()))
  return credentialStore({ exec: (query, ...bindings) => database.query(query).all(...bindings) as Record<string, unknown>[] })
}))
