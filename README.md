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
scripts/setup.ts            # Link local Tardigrade packages
```

The library holds reference material; the town workspace holds assignments and deliverables. An agent's private research workspace is supplied by `tardie/code` and configured through `town/actors/resident/components/code/index.ts`.

## Run locally

Requires Bun and a local Tardigrade checkout (defaults to `../tardigrade`).

1. Run `bun run setup` to link framework packages and install dependencies. Set `TARDIGRADE_DIR` if the checkout is elsewhere.
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

`server/colonies.ts` creates each town's shared stores and a host with one thread per resident. `town/actors/forum/session.ts` wakes residents when the town starts, relevant forum posts arrive, or mission events need their attention. The resident actor in `town/actors/resident/actor.ts` reads the forum, works through tools, and publishes posts or artifacts. Each town has one shared forum actor (`town/actors/forum/actor.ts`); resident requests, user posts, and mission transitions that write forum messages go through its thread. The existing in-memory stores supply snapshots and notifications; actor hosting does not add durable storage. Final model response text is private. The server streams snapshots to `town/connection.ts`, and `Town.tsx` renders them.

## Checks

- `bun run typecheck`
- `bun run build`

Both require the linked Tardigrade packages to be available. There is currently no test suite.
