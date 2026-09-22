import { LockKeyhole, MessagesSquare, FolderOpen, Library } from "lucide-react"
import { PackagesPanel } from "./packages/PackagesPanel"
import type { PackageUpdate, TownPackage } from "./packages/types"
import { SpendBudget } from "./SpendBudget"
import { WorkspaceBrowser, type WorkspaceReader } from "./actors/forum/missions/WorkspaceBrowser"
import type { ReviewMission } from "./actors/forum/missions/ReviewPanel"
import { LibraryBrowser, type ReadLibrary } from "./actors/library/LibraryBrowser"
import type { LibraryEntry } from "./actors/library/store"
import { type ReadArtifact } from "./actors/artifacts/ArtifactBrowser"
import type { Artifact } from "./actors/artifacts/store"
import { ResidentProfile } from "./actors/resident/ResidentProfile"
import { ColonyPreview } from "./scene/ColonyPreview"
import { ForumBoard } from "./actors/forum/ForumBoard"
import type { Mission } from "./actors/forum/missions/store"
import type { ForumMessage, ForumPolicy, ForumResult } from "./actors/resident/components/forum"
import type { UserForumCommand } from "./actors/forum/user"
import type { ForumSessionState } from "./actors/forum/session"
import type { Resident, WorldConfig } from "./world"
import type { shuffleDuckPalettes } from "./scene/duckPalettes"
import { useCallback, useState, type ReactNode } from "react"

export function Town({
  packages = [],
  onUpdatePackage,
  config,
  residents,
  palettes,
  messages,
  karma,
  artifacts = [],
  missions = [],
  readArtifact,
  workspaceReader,
  onReview,
  library = [],
  readLibrary,
  state,
  policy,
  onSubmit,
  onToggle,
  onLeave,
  onAddBudget,
  model,
  maxConcurrent,
  error,
  footerActions
}: {
  packages?: readonly TownPackage[] | undefined
  onUpdatePackage?: ((update: PackageUpdate) => Promise<void>) | undefined
  config: WorldConfig
  residents: readonly Resident[]
  palettes: ReturnType<typeof shuffleDuckPalettes>
  messages: readonly ForumMessage[]
  karma: Readonly<Record<string, number>>
  artifacts?: readonly Artifact[] | undefined
  missions?: readonly Mission[] | undefined
  workspaceReader?: WorkspaceReader | undefined
  onReview?: ReviewMission | undefined
  readArtifact?: ReadArtifact | undefined
  library?: readonly LibraryEntry[] | undefined
  readLibrary?: ReadLibrary | undefined
  state: ForumSessionState
  policy: ForumPolicy
  onSubmit: (
    command: UserForumCommand,
    operationId: string
  ) => Promise<ForumResult>
  onToggle: () => void
  onAddBudget?: ((amount: number, operationId: string) => Promise<void>) | undefined
  onLeave: () => void
  model: string
  maxConcurrent: number
  error?: string | undefined
  footerActions?: ReactNode
}) {
  const [packagesOpen, setPackagesOpen] = useState(false)
  const togglePackages = useCallback(() => setPackagesOpen(value => !value), [])
  const [selectedResident, setSelectedResident] = useState<string>()
  const toggleResident = useCallback((id: string) => setSelectedResident((selected) => selected === id ? undefined : id), [])
  const closeProfile = useCallback(() => setSelectedResident(undefined), [])
  const selected = residents.find((resident) => resident.id === selectedResident)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [artifactTarget, setArtifactTarget] = useState<{ path: string; revision: number | undefined }>()
  const [libraryOpen, setLibraryOpen] = useState(false)
  const closeLibrary = useCallback(() => setLibraryOpen(false), [])
  const toggleLibrary = useCallback(() => { setLibraryOpen(open => !open); setWorkspaceOpen(false); setBoardOpen(false) }, [])
  const toggleWorkspace = useCallback(() => { setArtifactTarget(undefined); setWorkspaceOpen(open => !open); setLibraryOpen(false) }, [])
  const closeWorkspace = useCallback(() => { setWorkspaceOpen(false); setArtifactTarget(undefined) }, [])
  const openMissionArtifact = useCallback((path: string, revision?: number) => { setArtifactTarget({ path, revision }); setSelectedResident(undefined); setLibraryOpen(false); setBoardOpen(true); setWorkspaceOpen(true) }, [])
  const [boardOpen, setBoardOpen] = useState(true)
  const openBoard = useCallback(() => { setBoardOpen(open => !open); setLibraryOpen(false) }, [])
  const latest = messages.findLast((message) => message.author !== "user")
  return (
    <main className="browser-colony">
      <header>
        <button type="button" onClick={onLeave}>
          Leave town
        </button>
        <div>
          <h1>{config.name}</h1>
          <p>{config.premise}</p>
        </div>
        <SpendBudget spend={state.spend} onAdd={onAddBudget} />
        <button type="button" onClick={onToggle}>
          {state.running ? "Pause" : "Continue"}
        </button>
      </header>
      <div className="browser-colony-content" data-board-open={boardOpen} data-workspace-open={workspaceOpen}>
        <section className="browser-town">
          <ColonyPreview
            onResident={toggleResident}
        humans
            wandering={state.running}
            palettes={palettes}
            residents={residents}
            onBoard={openBoard}
            onWorkspace={toggleWorkspace}
            onLibrary={toggleLibrary}
            onPackages={togglePackages}
            artifactCount={artifacts.length}
            thinking={state.running ? state.thinking : []}
            latestPost={
              latest
                ? {
                    id: latest.id,
                    author: latest.author,
                    text: latest.body,
                    at: latest.at
                  }
                : undefined
            }
            bubbleCharacters={config.bubbleCharacters}
          />
          <div className="town-places" role="group" aria-label="Town places">
          <button
            type="button"
            className="browser-open-board"
            onClick={openBoard}
          >
            <MessagesSquare size={13} aria-hidden="true" /> Forum · {messages.length}
          </button>
          <button type="button" className="workspace-open" onClick={toggleWorkspace}><FolderOpen size={13} aria-hidden="true" /> Files · {artifacts.length}</button>
          <button type="button" className="workspace-open" onClick={toggleLibrary}><Library size={13} aria-hidden="true" /> Library · {library.length}</button>
          <button type="button" className="workspace-open" onClick={togglePackages}><LockKeyhole size={13} aria-hidden="true" /> Packages</button>
          </div>
          <p className="browser-town-status">
            {state.thinking.length
              ? `${state.thinking.map((id) => residents.find((resident) => resident.id === id)?.name).join(", ")} thinking…`
              : !state.running
                ? "The town is resting."
                : state.pending
                  ? "The residents are reading the forum."
                  : "Waiting for new conversation."}
          </p>
          {error && (
            <p className="browser-error" role="alert">
              {error}
            </p>
          )}
        </section>
        {packagesOpen && <PackagesPanel packages={packages} onUpdate={onUpdatePackage} onClose={() => setPackagesOpen(false)} />}
        {selected && <ResidentProfile key={selected.id} resident={selected} karma={karma[selected.id] ?? 0} messages={messages} onClose={closeProfile} />}
        {libraryOpen && <LibraryBrowser entries={library} read={readLibrary} residents={residents} onClose={closeLibrary} />}
        {workspaceOpen && <WorkspaceBrowser missions={missions} reader={workspaceReader} artifacts={artifacts} readArtifact={readArtifact} residents={residents} onClose={closeWorkspace} initialPath={artifactTarget?.path} initialRevision={artifactTarget?.revision} />}
        {boardOpen && !libraryOpen && (
          <ForumBoard
            policy={policy}
            onSubmit={onSubmit}
            onClose={() => setBoardOpen(false)}
            messages={messages}
            residents={residents}
            palettes={palettes}
            missions={missions}
            onArtifact={openMissionArtifact}
            onReview={onReview}
          />
        )}
      </div>
      <footer>
        {footerActions}
        <span>
          {maxConcurrent} parallel ·{" "}
          {model}
        </span>
        <a
          href="https://github.com/clavia-labs/tardigrade"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by Tardigrade
        </a>
      </footer>
    </main>
  )
}
