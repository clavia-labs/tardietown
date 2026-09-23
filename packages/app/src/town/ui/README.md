# Town UI

Base UI owns interaction behavior; our small theme supplies appearance. Native textareas
and file inputs retain browser editing/upload behavior.

- `setup.css`: Tailwind v4 entry point and town design tokens. Put ordinary page layout,
  spacing, and responsive styling in utility classes on the component.
- `foundation.css`: native element defaults and shared control variables.
- `controls.tsx` / `controls.css`: Button, IconButton, Input, Textarea and Modal/ModalActions.
  Use `variant="primary"`, `"ghost"` or `"danger"` instead of page-level button colors.
  `Action` is intentionally unstyled for document rows, scene bubbles and structured content.
- `SelectField`, `Disclosure`: Base UI Select and Collapsible. Tabs, Switch, Slider and
  Popover use their Base UI primitives with shared state styles.
- `town.css`: the few remaining town-shell rules. Nested content and state selectors
  live beside their feature in `scene/details.css`, `scene/residents.css`,
  `actors/forum/forum.css`, `actors/artifacts/workspace.css`, and
  `town/packages/packages.css`.
- `scene/cards.css`: floating card surface and dimensions, selected by `data-scene-card`.

Cascade order is `theme`, `base`, `screens`, `controls`, `components`, `utilities`.
Tailwind utilities should own page layout; use a feature CSS file only for nested
content, pseudo-elements, or state selectors. Adjust shared controls through their
variants or supported variables:
`--control-size`, `--field-padding`, `--field-font`, `--dialog-width`.

Scene cards declare a kind (`forum`, `residents`, `resident`, `workspace`, `library`, `packages`,
`clock`). Placement is measured before paint and uses viewport coordinates throughout.
Only opening and explicit expansion pick an anchor. Resizing/content growth clamp the
current position; moving residents and camera animation do not move open cards.
Dragging uses the same bounds and preserves the user's position through expansion.
The Residents button opens a list card; selecting someone opens their profile card,
whose back button returns to the list. Only one resident card is shown at a time.

Run placement regressions with:
`bun test packages/app/src/town/scene/cardPlacement.test.ts`

`useSceneCards` owns card observers and drag cleanup. Layout runs on card mount,
expansion and resize, not the scene animation loop. Mutation observation ignores
streaming text and speech bubbles. Reserved forms/navigation win over other cards
when there is not enough room to avoid every overlap.

Shared UI state lives in the scoped Zustand store in `state/townUi.ts`. Each live town
(keyed by its server ID) and preview owns a `TownUiProvider`; there is no global singleton
or browser persistence. Subscribe with `useTownUi(selector)` or `useTownPanel(name)`.
The store owns card visibility, the one selected resident, forum expansion, artifact
navigation and Inbox/budget visibility. Server snapshots, credentials, form drafts and
high-frequency scene animation values stay outside this store.
