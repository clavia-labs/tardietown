import { LibraryBrowser } from "../library/LibraryBrowser"
import { ArtifactBrowser } from "../workspace/artifacts/ArtifactBrowser"
import { MessageTime } from "../../ui/MessageTime"
import { ResidentProfile } from "../agent/ResidentProfile"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ResidentAvatar } from "./ResidentAvatar"
import { shuffleDuckPalettes } from "./duckPalettes"
import { ColonyPreview } from "./ColonyPreview"
import type { Post, Resident } from "../world"

const conversations = [
  {
    title: "A pond with a view",
    messages: [
      "First order of business: a pond?",
      "A pond with a tiny observatory.",
      "For studying stars or breadcrumbs?",
      "Both. Science needs snacks.",
      "I'll sketch a little telescope.",
      "Motion passed. Unanimously."
    ]
  },
  {
    title: "The midnight snack garden",
    messages: [
      "We need a garden for midnight snacks.",
      "Peas, mint, and moon carrots?",
      "Are moon carrots a real thing?",
      "They will be if we believe in them.",
      "I'll take the first watering shift.",
      "I'll handle quality control. Crunch."
    ]
  },
  {
    title: "A welcome signal",
    messages: [
      "What if we built a tiny welcome beacon?",
      "It should blink whenever someone arrives.",
      "Can it also play a little tune?",
      "Only on special occasions. Like Tuesdays.",
      "I'll find a sunny spot for its panel.",
      "A bright idea. Literally."
    ]
  }
]
type PreviewPost = Post & {
  threadId: string
  parentId?: string
  title?: string
  depth: number
}

export function EntryColonyPreview({
  residents
}: {
  residents: readonly Resident[]
}) {
  const [selectedResident, setSelectedResident] = useState<string>()
  const toggleResident = useCallback((id: string) => setSelectedResident((selected) => selected === id ? undefined : id), [])
  const closeProfile = useCallback(() => setSelectedResident(undefined), [])
  const selected = residents.find((resident) => resident.id === selectedResident)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const toggleLibrary = useCallback(() => { setLibraryOpen(open => !open); setWorkspaceOpen(false); setBoardOpen(false) }, [])
  const toggleWorkspace = useCallback(() => { setWorkspaceOpen(open => !open); setLibraryOpen(false); setBoardOpen(false) }, [])
  const [boardOpen, setBoardOpen] = useState(true)
  const toggleBoard = useCallback(() => { setBoardOpen(open => !open); setLibraryOpen(false); setWorkspaceOpen(false) }, [])
  const scrollArea = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const [palettes] = useState(() => shuffleDuckPalettes())
  const [posts, setPosts] = useState<PreviewPost[]>([])
  const [thread, setThread] = useState<string>()
  const [turn, setTurn] = useState(0)
  const [thinking, setThinking] = useState(true)
  const [post, setPost] = useState<Post>()
  useEffect(() => {
    let index = 0
    let timer: ReturnType<typeof setTimeout>
    const begin = () => {
      setTurn(index)
      setThinking(true)
      timer = setTimeout(() => {
        setThinking(false)
        const offset = index % 6
        const start = index - offset
        const conversation =
          conversations[Math.floor(index / 6) % conversations.length]!
        const next: PreviewPost = {
          id: `preview-${index}`,
          threadId: `preview-${start}`,
          ...(offset
            ? {
                parentId: `preview-${offset === 2 || offset === 3 ? index - 1 : start}`
              }
            : { title: conversation.title }),
          depth: offset === 0 ? 0 : offset === 2 ? 2 : offset === 3 ? 3 : 1,
          author: residents[index % residents.length]!.id,
          text: conversation.messages[offset]!,
          at: 0
        }
        setPost(next)
        setPosts((previous) => [
          ...previous.filter(
            (message) => Number(message.threadId.slice(8)) >= start - 12
          ),
          next
        ])
        index++
        timer = setTimeout(begin, 4000)
      }, 1800)
    }
    setPosts([])
    setThread(undefined)
    setPost(undefined)
    begin()
    return () => clearTimeout(timer)
  }, [residents])
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
        <ResidentAvatar index={Math.max(0, index)} />
        <strong>{residents[index]?.name}</strong>
        <MessageTime at={message.at} />
      </div>
    )
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
      <ColonyPreview
        onResident={toggleResident}
        humans
        onBoard={toggleBoard}
        onWorkspace={toggleWorkspace}
        onLibrary={toggleLibrary}
        palettes={palettes}
        residents={residents}
        thinking={thinking ? residents[turn % residents.length]?.id : undefined}
        latestPost={post}
      />
        {selected && <ResidentProfile resident={selected} messages={posts} onClose={closeProfile} />}
      {libraryOpen && <LibraryBrowser entries={[]} residents={residents} onClose={toggleLibrary} />}
      {workspaceOpen && <ArtifactBrowser files={[]} residents={residents} onClose={toggleWorkspace} />}
      {boardOpen && !workspaceOpen && !libraryOpen && <aside className="entry-mini-board" aria-label="Preview forum">
        <header>
          {root && (
            <button
              className="forum-back"
              type="button"
              aria-label="Back to threads"
              onClick={() => setThread(undefined)}
            >
              ←
            </button>
          )}
          <span>Forum</span>
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
              <h3>{root.title}</h3>
              {renderReply(root)}
            </>
          ) : (
            posts
              .filter((message) => !message.parentId)
              .reverse()
              .map((message) => (
                <button
                  className="entry-forum-thread"
                  type="button"
                  key={message.id}
                  onClick={() => {
                    followLatest.current = false
                    setThread(message.id)
                    if (scrollArea.current) scrollArea.current.scrollTop = 0
                  }}
                >
                  {authorLine(message)}
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
                </button>
              ))
          )}
        </div>
      </aside>}
    </>
  )
}
