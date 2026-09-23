import { TownUiProvider, useTownUi, useTownPanel } from "../state/TownUiProvider"
import { IconButton, Button, Action } from "../ui/controls"
import { MissionFlairs } from "../../actors/forum/MissionFlairs"
import { ResidentsButton, ResidentsList } from "./ResidentsButton"
import type { ReadResidentEvents } from "../../actors/resident/events"
import { PackagesPanel } from "../packages/PackagesPanel"
import { ArrowLeft as PanelBack } from "lucide-react"
import { X, Maximize2, Minimize2, MessagesSquare, FolderOpen, Library, Wrench } from "lucide-react"
import { LibraryBrowser } from "../../actors/library/LibraryBrowser"
import { ArtifactBrowser } from "../../actors/artifacts/ArtifactBrowser"
import { MessageTime } from "../../ui/MessageTime"
import { ResidentProfile } from "../../actors/resident/ResidentProfile"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ResidentAvatar } from "./ResidentAvatar"
import { shuffleDuckPalettes } from "./duckPalettes"
import { TownScene } from "./TownScene"
import type { Resident } from "../world"
import { RECORDING_MISSION_POST_COUNT, useDemoConversation, type PreviewPost } from "./useDemoConversation"

function EntryPreview({
  residents,
  recording = false,
  onFirstThreadComplete
}: {
  residents: readonly Resident[]
  recording?: boolean | undefined
  onFirstThreadComplete?: (() => void) | undefined
}) {
  const selectedResident = useTownUi(state => state.selectedResident)
  const setSelectedResident = useTownUi(state => state.setSelectedResident)
  const [residentsOpen, setResidentsOpen] = useTownPanel("residents")
  const toggleResident = useCallback((id: string) => { setResidentsOpen(false); setSelectedResident((selected) => selected === id ? undefined : id) }, [setResidentsOpen, setSelectedResident])
  const selectResident = useCallback((id: string) => { setResidentsOpen(false); setSelectedResident(id) }, [setResidentsOpen, setSelectedResident])
  const toggleResidents = useCallback(() => { setSelectedResident(undefined); setResidentsOpen(open => !open) }, [setSelectedResident, setResidentsOpen])
  const backToResidents = useCallback(() => { setSelectedResident(undefined); setResidentsOpen(true) }, [setSelectedResident, setResidentsOpen])
  const closeProfile = useCallback(() => setSelectedResident(undefined), [setSelectedResident])
  const selected = residents.find((resident) => resident.id === selectedResident)
  const [workspaceOpen, setWorkspaceOpen] = useTownPanel("workspace")
  const [libraryOpen, setLibraryOpen] = useTownPanel("library")
  const [packagesOpen, setPackagesOpen] = useTownPanel("packages")
  const togglePackages = useCallback(() => { setPackagesOpen(open => !open) }, [setPackagesOpen])
  const toggleLibrary = useCallback(() => { setLibraryOpen(open => !open) }, [setLibraryOpen])
  const toggleWorkspace = useCallback(() => { setWorkspaceOpen(open => !open) }, [setWorkspaceOpen])
  const [boardOpen, setBoardOpen] = useTownPanel("forum")
  const boardExpanded = useTownUi(state => state.forumExpanded)
  const setBoardExpanded = useTownUi(state => state.setForumExpanded)
  const toggleBoard = useCallback(() => { setBoardOpen(open => !open) }, [setBoardOpen])
  const scrollArea = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const [palettes] = useState(() => shuffleDuckPalettes())
  const { posts, historyStart, historyAt, setHistoryAt, turn, thinking, post } = useDemoConversation(residents, recording)
  const previewPosts = useRef(posts)
  previewPosts.current = posts
  const readPreviewEvents = useCallback<ReadResidentEvents>(async (resident, cursor = 0) => {
    const events = [
      { seq: 1, type: "ThreadCreated", details: JSON.stringify({ demo: true, resident, message: "Preview resident joined the town. No model requests are made." }, null, 2) },
      ...previewPosts.current.filter(post => post.author === resident).map(post => ({
        seq: Number(post.id.slice(8)) + 2,
        type: "MessagePosted",
        details: JSON.stringify({ demo: true, title: post.title, body: post.text, threadId: post.threadId }, null, 2)
      }))
    ].filter(event => event.seq > cursor)
    return { events, cursor: events.at(-1)?.seq ?? cursor, hasMore: false }
  }, [])
  const [thread, setThread] = useState<string>()
  useEffect(() => setThread(undefined), [residents])
  useEffect(() => {
    if (!recording) return
    const latestRoot = posts.findLast((message) => !message.parentId)
    if (latestRoot && latestRoot.id !== thread) {
      followLatest.current = true
      setThread(latestRoot.id)
    }
  }, [posts, recording, thread])
  useEffect(() => {
    if (!recording || !onFirstThreadComplete) return
    if (posts.filter((message) => message.threadId === "preview-0").length !== RECORDING_MISSION_POST_COUNT) return
    const timer = window.setTimeout(onFirstThreadComplete, 2000)
    return () => window.clearTimeout(timer)
  }, [posts, recording, onFirstThreadComplete])
  const root = posts.find((message) => message.id === thread)
  useEffect(() => {
    if (root && scrollArea.current && followLatest.current)
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight
  }, [posts, root])
  const authorLine = (message: PreviewPost) => {
    const index = residents.findIndex(
      (resident) => resident.id === message.author
    )
    return (
      <div className="entry-forum-author">
        <ResidentAvatar index={message.author === "user" ? "user" : Math.max(0, index)} />
        <strong>{message.author === "user" ? "You" : residents[index]?.name}</strong>
        <MessageTime at={message.at} />
      </div>
    )
  }
  const previewFlairs = (message: PreviewPost) => {
    const replies = posts.filter(post => post.threadId === message.id && post.parentId).length
    const completeAt = recording && message.id === "preview-0" ? RECORDING_MISSION_POST_COUNT - 1 : 5
    return <MissionFlairs status={replies >= completeAt ? "completed" : replies > 0 ? "claimed" : "open"} />
  }
  const renderReply = (message: PreviewPost): ReactNode => {
    const replies = posts.filter((reply) => reply.parentId === message.id)
    return (
      <div
        className="entry-forum-branch"
        key={message.id}
        data-has-replies={replies.length > 0}
      >
        <article className="entry-forum-reply">
          {authorLine(message)}
          <p>{message.text}</p>
        </article>
        {replies.length > 0 && (
          <div className="entry-forum-children">{replies.map(renderReply)}</div>
        )}
      </div>
    )
  }
  return (
    <>
      <TownScene
        timeline={{ start: historyStart, end: Date.now(), at: historyAt, select: setHistoryAt }}
        wandering={historyAt === undefined}
        onResident={toggleResident}
        humans
        {...(recording ? {} : { onBoard: toggleBoard })}
        onWorkspace={toggleWorkspace}
        onLibrary={toggleLibrary}
        onPackages={togglePackages}
        packagesPanel={packagesOpen && <PackagesPanel preview packages={[
        { id: "workspace", name: "Workspace", description: "Private research cache.", enabled: true, credential: "not_required", builtIn: true, tools: [
          { name: "workspace.read", description: "Read a stored result by reference.", input: { ref: "string", offset: "number (optional)", length: "number (optional)" } },
          { name: "workspace.grep", description: "Search stored results.", input: { pattern: "string" } }
        ] },
        { id: "fetch", name: "Fetch", description: "Read URLs and make HTTP requests. No key needed.", enabled: true, credential: "not_required", builtIn: true, tools: [
          { name: "fetch.get", description: "Read a URL; returns status, headers and body, capped at 24,000 characters.", input: { url: "string", headers: "object (optional)" } },
          { name: "fetch.request", description: "Send an HTTP request with a method, headers and optional body.", input: { url: "string", method: "string", headers: "object (optional)", body: "string (optional)" } }
        ] }
      ]} onClose={togglePackages} />}
        palettes={palettes}
        residents={residents}
        thinking={!recording && historyAt === undefined && thinking ? residents[turn % residents.length]?.id : undefined}
        latestPost={recording ? undefined : historyAt === undefined ? post : posts.at(-1)}
        {...(recording ? { bubbleCharacters: 0 } : {})}
      />
        {residentsOpen && <ResidentsList residents={residents} onSelect={selectResident} onClose={() => setResidentsOpen(false)} />}
        {selected && <ResidentProfile key={selected.id} resident={selected} readEvents={readPreviewEvents} karma={0} messages={posts.map((post, index) => ({ ...post, body: post.text, sequence: index + 1 }))} onBack={backToResidents} onClose={closeProfile} />}
      {!recording && <div className="town-places entry-town-places flex flex-wrap" role="group" aria-label="Preview town places">
        <ResidentsButton residents={residents} active={residentsOpen || Boolean(selected)} onClick={toggleResidents} />
        <Button type="button" aria-pressed={boardOpen} onClick={toggleBoard}><MessagesSquare size={13} aria-hidden="true" /> Forum · {posts.filter(post => !post.parentId).length}</Button>
        <Button type="button" aria-pressed={workspaceOpen} onClick={toggleWorkspace}><FolderOpen size={13} aria-hidden="true" /> Files · 0</Button>
        <Button type="button" aria-pressed={libraryOpen} onClick={toggleLibrary}><Library size={13} aria-hidden="true" /> Library · 0</Button>
        <Button type="button" aria-pressed={packagesOpen} onClick={togglePackages}><Wrench size={13} aria-hidden="true" /> Packages</Button>
      </div>}

      {libraryOpen && <LibraryBrowser entries={[]} residents={residents} onClose={toggleLibrary} />}
      {workspaceOpen && <ArtifactBrowser title="Workspace" files={[]} residents={residents} onClose={toggleWorkspace} />}
      {boardOpen && <aside data-scene-card="forum" className="entry-mini-board" data-expanded={boardExpanded} aria-label="Preview forum">
        <header>
          {root && (
            <IconButton variant="ghost"
              className="forum-back"
              type="button"
              label="Back to threads"
              onClick={() => setThread(undefined)}
            >
              <PanelBack size={18} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          )}
          <span className="preview-panel-title"><MessagesSquare size={14} aria-hidden="true" /> Forum</span>
          <IconButton variant="ghost" className="forum-expand" type="button" label={boardExpanded ? "Collapse forum" : "Expand forum"} title={boardExpanded ? "Collapse forum" : "Expand forum"} aria-pressed={boardExpanded} onClick={() => setBoardExpanded(value => !value)}>
            {boardExpanded ? <Minimize2 size={16} strokeWidth={1.75} aria-hidden="true" /> : <Maximize2 size={16} strokeWidth={1.75} aria-hidden="true" />}
          </IconButton>
          <IconButton variant="ghost" className="forum-close" type="button" onClick={() => setBoardOpen(false)} label="Close forum"><X size={18} strokeWidth={1.75} aria-hidden="true" /></IconButton>
        </header>
        <div className="entry-forum-nav">
          {!root && (
            <span>
              {posts.filter((message) => !message.parentId).length}{" "}
              {posts.filter((message) => !message.parentId).length === 1
                ? "thread"
                : "threads"}
            </span>
          )}
        </div>
        <div
          className="entry-mini-posts"
          ref={scrollArea}
          onScroll={(event) => {
            const element = event.currentTarget
            followLatest.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              12
          }}
        >
          {posts.length === 0 ? (
            <p className="entry-mini-empty">
              The residents are gathering their thoughts…
            </p>
          ) : root ? (
            <>
              {previewFlairs(root)}
              <h3>{root.title}</h3>
              {renderReply(root)}
              {recording && root.id === "preview-0" && (posts.length === 2 || posts.length === 6) && (
                <p className="demo-forum-activity"><span aria-hidden="true" />{residents[0]?.name} is searching public pages…</p>
              )}
            </>
          ) : (
            posts
              .filter((message) => !message.parentId)
              .reverse()
              .map((message) => (
                <Action
                  className="entry-forum-thread"
                  type="button"
                  key={message.id}
                  onClick={() => {
                    followLatest.current = recording
                    setThread(message.id)
                    if (!recording && scrollArea.current) scrollArea.current.scrollTop = 0
                  }}
                >
                  {authorLine(message)}
                  {previewFlairs(message)}
                  <h3>{message.title}</h3>
                  <p>{message.text}</p>
                  <small>
                    {
                      posts.filter(
                        (reply) =>
                          reply.threadId === message.id && reply.parentId
                      ).length
                    }{" "}
                    {posts.filter(
                      (reply) => reply.threadId === message.id && reply.parentId
                    ).length === 1
                      ? "reply"
                      : "replies"}{" "}
                    <span>↗</span>
                  </small>
                </Action>
              ))
          )}
        </div>
      </aside>}
    </>
  )
}

export function DemoTownScene(props: { residents: readonly Resident[]; recording?: boolean | undefined; onFirstThreadComplete?: (() => void) | undefined }) {
  return <TownUiProvider initialPanels={props.recording ? { forum: true } : undefined}><EntryPreview residents={props.residents} recording={props.recording} onFirstThreadComplete={props.onFirstThreadComplete} /></TownUiProvider>
}
