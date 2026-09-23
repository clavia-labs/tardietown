import { TownUiProvider, useTownUi, useTownPanel } from "./state/TownUiProvider"
import { Button, Action, IconButton } from "./ui/controls"
import { toast } from "sonner"
import { inboxIssues } from "../actors/human/issues"
import { ModelSettings } from "./ModelSettings"
import { HumanInboxButton, type InboxAction } from "../actors/human/HumanInboxButton"
import type { HumanRequest } from "../actors/human/actor"
import { ResidentsButton, ResidentsList } from "./scene/ResidentsButton"
import type { McpCommand, McpConnectionInfo, McpUpdateResult } from "./packages/mcp-types"
import type { ReadResidentEvents } from "../actors/resident/events"
import { ArrowLeft, Wrench, MessagesSquare, FolderOpen, Library, Pause, Play } from "lucide-react"
import { PackagesPanel } from "./packages/PackagesPanel"
import type { PackageUpdate, TownPackage } from "./packages/types"
import { SpendBudget } from "./SpendBudget"
import { WorkspaceBrowser, type WorkspaceReader } from "../actors/forum/missions/WorkspaceBrowser"
import type { ReviewMission } from "../actors/forum/missions/ReviewPanel"
import { LibraryBrowser, type ReadLibrary } from "../actors/library/LibraryBrowser"
import type { LibraryEntry } from "../actors/library/store"
import { type ReadArtifact } from "../actors/artifacts/ArtifactBrowser"
import type { Artifact } from "../actors/artifacts/store"
import { ResidentProfile } from "../actors/resident/ResidentProfile"
import { TownScene } from "./scene/TownScene"
import { ForumBoard } from "../actors/forum/ForumBoard"
import type { Mission } from "../actors/forum/missions/store"
import type { ForumMessage, ForumPolicy, ForumResult } from "../actors/resident/components/forum"
import type { UserForumCommand } from "../actors/forum/user"
import type { ForumSessionState } from "../actors/forum/session"
import type { Resident, WorldConfig } from "./world"
import type { shuffleDuckPalettes } from "./scene/duckPalettes"
import { useCallback, useEffect, type ComponentProps, type ReactNode } from "react"

function TownView({
  inbox = [],
  onInbox,
  onRetry,
  mcp,
  onMcp,
  readResidentEvents,
  packages = [],
  onUpdatePackage,
  timeline,
  historical = false,
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
  uploadLibrary,
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
  inbox?: readonly HumanRequest[] | undefined
  onInbox?: InboxAction | undefined
  onRetry?: (() => Promise<void>) | undefined
  mcp?: readonly McpConnectionInfo[] | undefined
  onMcp?: ((command: McpCommand) => Promise<McpUpdateResult>) | undefined
  readResidentEvents?: ReadResidentEvents | undefined
  packages?: readonly TownPackage[] | undefined
  onUpdatePackage?: ((update: PackageUpdate) => Promise<void>) | undefined
  timeline?: import("./protocol").TownTimeline | undefined
  historical?: boolean
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
  uploadLibrary?: ((title: string, content: string, operationId: string) => Promise<unknown>) | undefined
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
  const [packagesOpen, setPackagesOpen] = useTownPanel("packages")
  const togglePackages = useCallback(() => { setPackagesOpen(value => !value) }, [setPackagesOpen])
  const selectedResident = useTownUi(state => state.selectedResident)
  const setSelectedResident = useTownUi(state => state.setSelectedResident)
  const [residentsOpen, setResidentsOpen] = useTownPanel("residents")
  const toggleResident = useCallback((id: string) => { setResidentsOpen(false); setSelectedResident((selected) => selected === id ? undefined : id) }, [setResidentsOpen, setSelectedResident])
  const selectResident = useCallback((id: string) => { setResidentsOpen(false); setSelectedResident(id) }, [setResidentsOpen, setSelectedResident])
  const toggleResidents = useCallback(() => { setSelectedResident(undefined); setResidentsOpen(open => !open) }, [setSelectedResident, setResidentsOpen])
  const backToResidents = useCallback(() => { setSelectedResident(undefined); setResidentsOpen(true) }, [setSelectedResident, setResidentsOpen])
  const setPanel = useTownUi(state => state.setPanel)
  const issues = inboxIssues({ ...state, ...(error ? { error } : {}) }, mcp ?? [])
  useEffect(() => {
    if (!error || historical) return
    toast.error("Your town needs attention", {
      id: `town-error:${config.name}:${state.errorId ?? error}`,
      description: "Open Inbox for details and recovery options.",
      action: { label: "View inbox", onClick: () => setPanel("inbox", true) }
    })
  }, [error, state.errorId, historical, config.name, setPanel])
  const closeProfile = useCallback(() => setSelectedResident(undefined), [setSelectedResident])
  const selected = residents.find((resident) => resident.id === selectedResident)
  const [workspaceOpen, setWorkspaceOpen] = useTownPanel("workspace")
  const artifactTarget = useTownUi(state => state.artifactTarget)
  const [libraryOpen, setLibraryOpen] = useTownPanel("library")
  const closeLibrary = useCallback(() => setLibraryOpen(false), [setLibraryOpen])
  const toggleLibrary = useCallback(() => { setLibraryOpen(open => !open) }, [setLibraryOpen])
  const toggleWorkspace = useCallback(() => { setWorkspaceOpen(open => !open) }, [setWorkspaceOpen])
  const closeWorkspace = useCallback(() => { setWorkspaceOpen(false) }, [setWorkspaceOpen])
  const openMissionArtifact = useTownUi(state => state.openArtifact)
  const [boardOpen, setBoardOpen] = useTownPanel("forum")
  const openBoard = useCallback(() => { setBoardOpen(open => !open) }, [setBoardOpen])
  const latest = messages.findLast((message) => message.author !== "user")
  return (
    <main className="browser-town-view mx-auto flex h-dvh min-h-0 w-full max-w-[1200px] flex-col overflow-hidden p-6 max-[760px]:px-3 max-[760px]:py-[18px]">
      <header className="flex max-h-[22%] shrink-0 items-center gap-2.5 overflow-y-auto max-[600px]:flex-wrap">
        <IconButton label="Back to towns" className="mt-2 self-start" onClick={onLeave}>
          <ArrowLeft size={18} aria-hidden="true" />
        </IconButton>
        <div className="min-w-0">
          <h1 className="m-0 break-words font-[Georgia,serif] text-[32px] italic max-[760px]:text-[23px]">{config.name}</h1>
          <p className="mt-1 mb-0 max-w-[620px] font-town-mono text-xs leading-[1.6] text-town-muted">{config.premise}</p>
        </div>
        <div className="town-header-actions ml-auto flex shrink-0 items-center gap-[18px]">
        {!historical && <SpendBudget spend={state.spend} onAdd={onAddBudget} />}
        <div className="town-header-utilities flex items-center gap-2">
        {!historical && onInbox && <HumanInboxButton items={inbox} action={onInbox} issues={issues} onIssue={async issue => {
          if (issue.action === "budget") { setPanel("budget", true); return }
          if (issue.action === "connect" && issue.connectionId && onMcp) return onMcp({ action: "connect", id: issue.connectionId })
          if (issue.action === "retry") await onRetry?.()
        }} />}
        <ModelSettings />
        <IconButton label={state.running ? "Pause town" : "Continue town"} disabled={historical} onClick={onToggle} aria-label={state.running ? "Pause town" : "Continue town"} title={state.running ? "Pause town" : "Continue town"}>
          {state.running ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </IconButton>
        </div>
        </div>
      </header>
      {historical && <p className="history-banner">Viewing the past · Read only · Live town continues <Action type="button" onClick={() => timeline?.select(undefined)}>Back to live</Action></p>}
      <div className="browser-town-view-content relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-5" data-board-open={boardOpen} data-workspace-open={workspaceOpen || libraryOpen || packagesOpen}>
        <section className="browser-town flex min-h-0 min-w-0 flex-col items-center text-center">
          <TownScene
            timeline={timeline}
            onResident={toggleResident}
        humans
            wandering={state.running}
            palettes={palettes}
            residents={residents}
            onBoard={openBoard}
            onWorkspace={toggleWorkspace}
            onLibrary={toggleLibrary}
            onPackages={togglePackages}
            packagesPanel={packagesOpen && <PackagesPanel mcp={mcp} onMcp={onMcp} packages={packages} onUpdate={onUpdatePackage} onClose={() => setPackagesOpen(false)} />}
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
          <div className="town-places flex w-full shrink-0 flex-wrap justify-end gap-2" role="group" aria-label="Town places">
          <ResidentsButton residents={residents} active={residentsOpen || Boolean(selected)} onClick={toggleResidents} />
          <Button
            type="button"
            className="browser-open-board"
            onClick={openBoard}
          >
            <MessagesSquare size={13} aria-hidden="true" /> Forum · {messages.length}
          </Button>
          <Button type="button" className="workspace-open ml-0" onClick={toggleWorkspace}><FolderOpen size={13} aria-hidden="true" /> Files · {artifacts.length}</Button>
          <Button type="button" className="workspace-open ml-0" onClick={toggleLibrary}><Library size={13} aria-hidden="true" /> Library · {library.length}</Button>
          <Button type="button" className="workspace-open ml-0" onClick={togglePackages}><Wrench size={13} aria-hidden="true" /> Packages</Button>
          </div>
          <p className="browser-town-status my-3 w-full shrink-0 text-right font-town-mono text-xs leading-normal text-town-muted">
            {state.thinking.length
              ? `${state.thinking.map((id) => residents.find((resident) => resident.id === id)?.name).join(", ")} thinking…`
              : !state.running
                ? "The town is resting."
                : state.pending
                  ? "The residents are reading the forum."
                  : "Waiting for new conversation."}
          </p>
        </section>

        {residentsOpen && <ResidentsList residents={residents} onSelect={selectResident} onClose={() => setResidentsOpen(false)} />}
        {selected && <ResidentProfile key={selected.id} resident={selected} readEvents={readResidentEvents} karma={karma[selected.id] ?? 0} messages={messages} onBack={backToResidents} onClose={closeProfile} />}
        {libraryOpen && <LibraryBrowser upload={uploadLibrary} entries={library} read={readLibrary} residents={residents} onClose={closeLibrary} />}
        {workspaceOpen && <WorkspaceBrowser missions={missions} reader={workspaceReader} artifacts={artifacts} readArtifact={readArtifact} residents={residents} onClose={closeWorkspace} initialPath={artifactTarget?.path} initialRevision={artifactTarget?.revision} />}
        {boardOpen && (
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
      <footer className="flex shrink-0 justify-between gap-3.5 pt-2.5 font-town-mono text-[10px] text-town-faint max-[760px]:flex-wrap">
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

export function Town(props: ComponentProps<typeof TownView>) {
  return <TownUiProvider><TownView {...props} /></TownUiProvider>
}
