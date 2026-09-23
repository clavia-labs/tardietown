import { Context, Data, Effect, Layer, Redacted } from "effect"

export class CredentialStorageError extends Data.TaggedError("CredentialStorageError")<{ operation: string }> {}
export class CredentialStore extends Context.Service<CredentialStore, {
  get: (name: string) => Effect.Effect<Redacted.Redacted<string> | undefined, CredentialStorageError>
  set: (name: string, value: Redacted.Redacted<string>) => Effect.Effect<void, CredentialStorageError>
  remove: (name: string) => Effect.Effect<void, CredentialStorageError>
}>()("town/connections/CredentialStore") {}

// Structural subset of DurableObjectStorage.sql, also implemented by the local
// SQLite adapter. This private table is separate from the actor's public event log.
export interface PrivateSql {
  exec(query: string, ...bindings: (string | number | null)[]): Iterable<Record<string, unknown>>
}
export function credentialStore(sql: PrivateSql): Context.Service.Shape<typeof CredentialStore> {
  sql.exec("CREATE TABLE IF NOT EXISTS connection_credentials (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
  const attempt = <A>(operation: string, body: () => A) => Effect.try({ try: body, catch: () => new CredentialStorageError({ operation }) })
  return {
    get: name => attempt("read", () => {
      const row = [...sql.exec("SELECT value FROM connection_credentials WHERE name = ?", name)][0]
      return typeof row?.value === "string" ? Redacted.make(row.value) : undefined
    }),
    set: (name, value) => attempt("write", () => { sql.exec("INSERT INTO connection_credentials(name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value", name, Redacted.value(value)) }),
    remove: name => attempt("remove", () => { sql.exec("DELETE FROM connection_credentials WHERE name = ?", name) })
  }
}
export const durableObjectCredentialsLayer = (storage: { sql: PrivateSql }) => Layer.effect(CredentialStore,
  Effect.try({ try: () => credentialStore(storage.sql), catch: () => new CredentialStorageError({ operation: "open" }) }))
