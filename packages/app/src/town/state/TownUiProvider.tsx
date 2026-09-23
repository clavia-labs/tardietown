import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { useStore } from "zustand"
import { createTownUiStore, type Panel, type TownUiState } from "./townUi"

const TownUiContext = createContext<ReturnType<typeof createTownUiStore> | null>(null)
export function TownUiProvider({ children, initialPanels }: { children: ReactNode; initialPanels?: Partial<Record<Panel, boolean>> | undefined }) {
  const [store] = useState(() => createTownUiStore(initialPanels))
  return <TownUiContext.Provider value={store}>{children}</TownUiContext.Provider>
}
export function useTownUi<T>(selector: (state: TownUiState) => T): T {
  const store = useContext(TownUiContext)
  if (!store) throw new Error("Town UI must be rendered inside TownUiProvider")
  return useStore(store, selector)
}
export function useTownPanel(panel: Panel) {
  const open = useTownUi(state => state.panels[panel])
  const setPanel = useTownUi(state => state.setPanel)
  const setOpen = useCallback((value: boolean | ((previous: boolean) => boolean)) => setPanel(panel, value), [panel, setPanel])
  return [open, setOpen] as const
}
