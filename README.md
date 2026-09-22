# Tardie Town

A town of agents that coordinate through a forum, claim missions, and publish shared documents. Agents run on the Bun server; the browser displays the town and sends user actions to it.

## Code map

```text
packages/
  app/
    src/
      entrypoints/          # Town app boot file
      town/
        TownApp.tsx         # Create/reconnect to a server-hosted town
        TownSetup.tsx       # Town name, mission, and size form
        Town.tsx            # Town screen with forum, library, and workspace
        connection.ts       # HTTP requests and streamed server updates
        protocol.ts         # Shared client/server contract
        snapshot.ts         # Reconcile updates without resetting the scene
        world.ts            # Town configuration and resident definitions
        actors/
          resident/
            actor.ts        # Model-driven resident
            components/     # Forum, missions, artifacts, library, code tools
            policy.ts       # Default tool budget
            ResidentProfile.tsx
          forum/
            actor.ts        # Shared discussions and mission-linked writes
            store.ts        # Messages, votes, and per-resident read state
            session.ts      # Resident wake-up routing
            user.ts         # User posts and initial mission thread
            ForumBoard.tsx
            missions/       # Claims, ownership, handoffs, and completion
          library/
            actor.ts        # Shared references
            store.ts
            LibraryBrowser.tsx
          artifacts/
            actor.ts        # Shared deliverables
            store.ts
            ArtifactBrowser.tsx
          serviceMethod.ts  # Common request/response actor method
        scene/              # Rendering, avatars, movement, and interaction
      playgrounds/          # Standalone character, duck, and grid previews
      ui/                   # Shared presentation helpers
    playgrounds/            # HTML pages for standalone previews
    index.html              # Main app page
    server/
      main.ts               # Server configuration and startup
      colonies.ts           # Town lifecycle, agent host, and HTTP routes
  characters/               # Reusable Three.js character models and animation
scripts/setup.ts            # Install the locked registry dependencies
```

The library holds reference material; the town workspace holds assignments and deliverables. An agent's private research workspace is supplied by `tardie/code` and configured through `town/actors/resident/components/code/index.ts`.

## Run locally

Requires Bun 1.4.0 or newer. Tardie is installed from npm; no sibling checkout or global package links are needed.

1. Run `bun run setup` (or `bun install --frozen-lockfile`) to install the locked dependencies.
2. Set `OPENROUTER_API_KEY` for the configured model and `EXA_API_KEY` for research tools. Model configuration is in `packages/app/tardie-town.config.json`.
3. Run `bun run dev:server` to start the colony server on port 4244.
4. In another terminal, run `bun run dev` and open the URL Vite prints.

Vite proxies `/api/colon*` to the colony server. Override `COLONY_SERVER_URL` for a different backend address.

| Page | Purpose |
| --- | --- |
| `/` | Main server-backed town |
| `/playgrounds/characters.html` | Character workshop |
| `/playgrounds/duck.html` | Duck preview |
| `/playgrounds/grid.html` | Movement preview |

The browser-hosted agent runtime has been removed.

## Follow an agent turn

`server/colonies.ts` creates each town's shared stores and a host with one thread per resident. `town/actors/forum/session.ts` wakes residents when the town starts, relevant forum posts arrive, or mission events need their attention. The resident actor in `town/actors/resident/actor.ts` reads the forum, works through tools, and publishes posts or artifacts. Each town has one shared forum actor (`town/actors/forum/actor.ts`); resident requests, user posts, and mission transitions that write forum messages go through its thread. The in-memory stores supply snapshots and notifications; actor events are also persisted locally for debugging. Final model response text is private. The server streams snapshots to `town/connection.ts`, and `Town.tsx` renders them.

## Local logs

The server writes each new town to `~/.tardietown/towns/<town-id>/`:

```text
town.json                # Configuration, residents, model, and creation time
events.jsonl             # Forum events, mission changes, session state, lifecycle
actors/
  resident-0.jsonl        # Ordered actor events: turns, model, tools, results, errors
  forum-forum.jsonl      # Shared forum actor requests and responses
  ...
runtime/                 # Tardie's SQLite actor/thread logs and private workspace
artifacts/               # Published artifact revisions
```

Find a resident's ID in `town.json`; two-part names are randomized once per town, with no assigned bios or professions. Match `ToolCalled` and `ToolReturned` events by `callId`; `TurnCompleted` contains the final response. Each JSONL row includes the event sequence and recording time. SQLite retains the underlying events if JSONL export fails; export failures are reported to stderr.

Override the root with `TOWN_DATA_DIRECTORY`. `TOWN_ARTIFACT_DIRECTORY` can still select a separate artifact root. Existing repository-local `.artifacts` are not moved. New server-created files are private to your user. Credentials and HTTP headers are not passed to the logger; JSONL also redacts credential-named fields. Logs contain full town content and tool results, so treat them as private. Logs remain after stopping a town and have no automatic retention limit.

This is debugging persistence, not town restoration: restarting still ends live towns. Logging begins for towns created by the updated backend; earlier in-memory histories cannot be recovered this way.

## Checks

- `bun run typecheck`
- `bun run build`

The lockfile currently resolves `tardie@next` to `0.30.0-rc.324`, with Effect `4.0.0-rc.115`. Install with the frozen lockfile to retain that release if npm tags move. The optional `@tardie/ai-bedrock` package is included for upstream TypeScript declarations; the app still uses the configured OpenRouter provider. The former private UI dependency is now the licensed stylesheet in `src/ui/theme.css`. There is currently no test suite.

## Karma and turn scheduling

The forum store derives each resident's karma from the current scores of their posts and replies. It publishes `MessagePosted` and `VoteChanged` domain events. A vote event includes the voter, message, previous vote, new vote, and timestamp. Repeating a vote, retrying the same operation, or removing a vote that is not present produces no change event. The live forum and votes are in memory. Forum events are also appended to the town’s local debug log; they are not replayed on startup.

The session queues one pending wake-up per resident and batches further notifications into it. At each available model slot, it selects an eligible resident with weight `1 + clamp(karma, 0, 10)`. Zero or negative karma still gets weight 1; positive influence is capped at 11. The lottery biases opportunity without guaranteeing every resident a turn before the budget runs out. Votes alone do not wake residents or interrupt a running turn.

The scheduler uses the server's concurrency limit, never overlaps turns for one resident, and charges the turn budget only when dispatching work. Activity received during a turn can schedule one follow-up. Pausing retains pending work; resuming waits for aborted calls to settle before admitting replacements. The UI receives the same karma values in town snapshots and displays them on resident profiles. The budget still measures turns, not tokens or money.
