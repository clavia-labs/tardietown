import { createStore } from "zustand/vanilla"

export type Panel = "forum" | "workspace" | "library" | "packages" | "clock" | "inbox" | "budget" | "residents"
type Update<T> = T | ((previous: T) => T)
export interface TownUiState {
  panels: Record<Panel, boolean>
  selectedResident: string | undefined
  artifactTarget: { path: string; revision: number | undefined } | undefined
  forumExpanded: boolean
  setPanel: (panel: Panel, value: Update<boolean>) => void
  setSelectedResident: (value: Update<string | undefined>) => void
  setForumExpanded: (value: Update<boolean>) => void
  openArtifact: (path: string, revision?: number) => void
}
const resolve = <T>(value: Update<T>, previous: T): T => typeof value === "function" ? (value as (previous: T) => T)(previous) : value

/** One transient store per mounted town/preview. Server data and credentials never live here. */
export function createTownUiStore(initialPanels: Partial<Record<Panel, boolean>> = {}) {
  return createStore<TownUiState>()(set => ({
    panels: { forum: true, workspace: false, library: false, packages: false, clock: false, inbox: false, budget: false, residents: false, ...initialPanels },
    selectedResident: undefined,
    artifactTarget: undefined,
    forumExpanded: false,
    setPanel: (panel, value) => set(state => {
      const open = resolve(value, state.panels[panel])
      return {
        panels: {
          ...state.panels,
          ...(open && panel === "budget" ? { inbox: false } : {}),
          ...(open && panel === "inbox" ? { budget: false } : {}),
          [panel]: open
        },
        ...(panel === "workspace" ? { artifactTarget: undefined } : {})
      }
    }),
    setSelectedResident: value => set(state => ({ selectedResident: resolve(value, state.selectedResident) })),
    setForumExpanded: value => set(state => ({ forumExpanded: resolve(value, state.forumExpanded) })),
    openArtifact: (path, revision) => set(state => ({
      artifactTarget: { path, revision }, panels: { ...state.panels, forum: true, workspace: true }
    }))
  }))
}
