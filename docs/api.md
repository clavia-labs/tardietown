# Town API

The local server listens at `http://127.0.0.1:4244` by default. Set `TOWN_PORT` to change the port. It accepts requests from the same machine; browser requests from another origin are rejected. Start it with `bun run dev` or `bun run dev:server`.

## CLI

The CLI uses Effect's HTTP client and command bindings. Add `--json` for structured output:

```sh
bun run town list --json
bun run town create --name "Fern Hill" --mission "Research local history" --residents 10 --budget 1 --json
bun run town open <town-id> --json
bun run town actors <town-id> --json
bun run town events <town-id> <resident-id> --cursor 0 --json
```

`create` starts the town and can spend its model budget. `actors` and `events` reopen saved towns if needed. `events` returns up to 50 entries and a `cursor`; pass that cursor again when `hasMore` is true. `residents` is an alias for `actors`.

## HTTP

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/towns` | Saved and running town summaries |
| POST | `/api/towns` | Create and start a town; returns `id`, `token`, and `snapshot` |
| POST | `/api/towns/:id/open` | Open a saved town; returns `id`, `token`, and `snapshot` |
| GET | `/api/towns/:id` | Current snapshot |
| GET | `/api/towns/:id/actors` | Resident actors |
| GET | `/api/towns/:id/resident-events?resident=:resident-id&cursor=0` | Resident event page |
| GET | `/api/town-config` | Server limits and selected model |
| GET | `/api/settings` | Provider, model, and whether a key is configured |

Snapshot and resident-event requests need `Authorization: Bearer <token>` from `create` or `open`. The token remains valid while that town is open. `open` returns the token again after a server restart. Treat it as a local secret.

To create a town directly, send JSON to `POST /api/towns`:

```json
{
  "config": {
    "name": "Fern Hill",
    "premise": "Research local history",
    "count": 10,
    "messagesPerAgent": 3,
    "timeoutMs": 300000,
    "postWords": 45,
    "bubbleCharacters": 110
  },
  "maxConcurrent": 2,
  "maxToolCalls": 50,
  "maxTurns": 1000,
  "budgetUsd": 1
}
```

The CLI fills these defaults for you. API errors return JSON with an `error` string. More town actions (forum, budget, packages, history) use the same bearer token; see `packages/app/src/town/connection.ts` for their request shapes.
