import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Leaf,
  MessageSquare,
  Minus,
  Pause,
  Play,
  Plus,
  Send,
  Settings2,
  Sprout,
  Users,
  X
} from "lucide-react"
import { World, ResidentAvatar } from "./Island"
import { liveConnection, waitFor } from "./connection"
import {
  DEFAULT_AGENT_COUNT,
  DEFAULT_API_URL,
  DEFAULT_BUBBLE_CHARACTERS,
  DEFAULT_MAX_AGENTS,
  DEFAULT_MESSAGES_PER_AGENT,
  DEFAULT_MESSAGE_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POST_WORDS,
  DEFAULT_TURN_TIMEOUT_MS,
  makeResidents,
  type Post,
  type Resident,
  type WorldConfig
} from "../town/world"

const defaultPremise =
  "Build a cozy little village together. Decide what it needs, share ideas, and find your own place in the community."

function Brand() {
  return (
    <a className="brand" href="./" aria-label="Tardie Town home">
      <span className="brand-icon">
        <Sprout size={21} strokeWidth={1.8} />
      </span>
      Tardie Town<span className="brand-dot">.</span>
    </a>
  )
}

export function App({
  maxAgents = DEFAULT_MAX_AGENTS,
  entryPage: Entry = Setup
}: {
  maxAgents?: number
  entryPage?: typeof Setup
}) {
  const [config, setConfig] = useState<WorldConfig | null>(null)
  return config === null ? (
    <Entry maxAgents={maxAgents} onCreate={setConfig} />
  ) : (
    <Habitat
      config={config}
      maxAgents={maxAgents}
      onLeave={() => setConfig(null)}
    />
  )
}

function Setup({
  maxAgents,
  onCreate
}: {
  maxAgents: number
  onCreate: (config: WorldConfig) => void
}) {
  const [name, setName] = useState("")
  const [count, setCount] = useState(Math.min(DEFAULT_AGENT_COUNT, maxAgents))
  const [premise, setPremise] = useState(defaultPremise)
  const [advanced, setAdvanced] = useState(false)
  const [messagesPerAgent, setMessagesPerAgent] = useState(
    DEFAULT_MESSAGES_PER_AGENT
  )
  const [intervalMs, setIntervalMs] = useState(DEFAULT_MESSAGE_INTERVAL_MS)
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TURN_TIMEOUT_MS)
  const [pollIntervalMs, setPollIntervalMs] = useState(DEFAULT_POLL_INTERVAL_MS)
  const [postWords, setPostWords] = useState(DEFAULT_POST_WORDS)
  const [bubbleCharacters, setBubbleCharacters] = useState(
    DEFAULT_BUBBLE_CHARACTERS
  )
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL)
  const [token, setToken] = useState("")
  const residents = useMemo(
    () => makeResidents(count, maxAgents),
    [count, maxAgents]
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !premise.trim()) return
    onCreate({
      name: name.trim(),
      count,
      premise: premise.trim(),
      messagesPerAgent,
      intervalMs,
      timeoutMs,
      pollIntervalMs,
      postWords,
      bubbleCharacters,
      apiUrl: apiUrl.replace(/\/$/, ""),
      token
    })
  }
  return (
    <div className="app setup-app">
      <header className="topbar">
        <Brand />
        <span className="powered">
          A playground built with <strong>Tardi</strong>
          <span className="tiny-leaf">
            <Leaf size={14} />
          </span>
        </span>
      </header>
      <main className="setup-layout">
        <section className="setup-copy">
          <span className="eyebrow">
            <span className="status-dot" /> SMALL WORLD. BIG PERSONALITIES.
          </span>
          <h1>
            A little world.
            <br />A mind of <em>its own.</em>
          </h1>
          <p className="intro">
            Bring a few agents together. Give them a place to talk.
            <br className="desktop-break" /> See what grows from there.
          </p>
          <form className="create-form" onSubmit={submit}>
            <label htmlFor="swarm-name">Name your swarm</label>
            <input
              id="swarm-name"
              placeholder="The Pocket Universe"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="off"
            />
            <div className="count-label">
              <label htmlFor="agent-count">How many little minds?</label>
              <span>
                {count === 1
                  ? "A solo explorer"
                  : count <= 6
                    ? "A close-knit crew"
                    : count <= 12
                      ? "A lively neighborhood"
                      : "A bustling village"}
              </span>
            </div>
            <div className="count-control">
              <button
                type="button"
                aria-label="Remove one agent"
                disabled={count <= 1}
                onClick={() => setCount(count - 1)}
              >
                <Minus size={17} />
              </button>
              <input
                id="agent-count"
                type="number"
                min="1"
                max={maxAgents}
                value={count}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (
                    Number.isInteger(value) &&
                    value >= 1 &&
                    value <= maxAgents
                  )
                    setCount(value)
                }}
              />
              <span>agents</span>
              <button
                type="button"
                aria-label="Add one agent"
                disabled={count >= maxAgents}
                onClick={() => setCount(count + 1)}
              >
                <Plus size={17} />
              </button>
            </div>
            <input
              className="count-slider"
              aria-label="Number of agents"
              type="range"
              min="1"
              max={maxAgents}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
            <div className="range-labels">
              <span>1 agent</span>
              <span>{maxAgents} agents</span>
            </div>
            <div className="connection-fields">
              <label htmlFor="premise">Give them a starting point</label>
              <textarea
                id="premise"
                value={premise}
                onChange={(event) => setPremise(event.target.value)}
                required
                rows={3}
              />
            </div>
            <button
              className="settings-toggle"
              type="button"
              aria-expanded={advanced}
              aria-controls="world-settings"
              onClick={() => setAdvanced(!advanced)}
            >
              <Settings2 size={14} /> World settings{" "}
              <ChevronDown size={14} className={advanced ? "rotated" : ""} />
            </button>
            {advanced ? (
              <div className="settings-grid" id="world-settings">
                <label>
                  Messages per agent
                  <input
                    type="number"
                    min="1"
                    required
                    value={messagesPerAgent}
                    onChange={(event) =>
                      setMessagesPerAgent(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Pause between posts (s)
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={intervalMs / 1000}
                    onChange={(event) =>
                      setIntervalMs(Number(event.target.value) * 1000)
                    }
                  />
                </label>
                <label>
                  Bubble preview (characters)
                  <input
                    type="number"
                    min="1"
                    required
                    value={bubbleCharacters}
                    onChange={(event) =>
                      setBubbleCharacters(Number(event.target.value))
                    }
                  />
                </label>

                <label>
                  Post length target (words)
                  <input
                    type="number"
                    min="1"
                    required
                    value={postWords}
                    onChange={(event) =>
                      setPostWords(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Turn timeout (s)
                  <input
                    type="number"
                    min="1"
                    required
                    value={timeoutMs / 1000}
                    onChange={(event) =>
                      setTimeoutMs(Number(event.target.value) * 1000)
                    }
                  />
                </label>
                <label>
                  Status polling (s)
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={pollIntervalMs / 1000}
                    onChange={(event) =>
                      setPollIntervalMs(Number(event.target.value) * 1000)
                    }
                  />
                </label>
                <label>
                  Tardi host URL
                  <input
                    id="api-url"
                    type="url"
                    required
                    value={apiUrl}
                    onChange={(event) => setApiUrl(event.target.value)}
                  />
                </label>
                <label>
                  Host token <span className="optional">optional</span>
                  <input
                    id="host-token"
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
            ) : null}
            <button
              type="submit"
              className="primary create-button"
              disabled={!name.trim()}
            >
              <Sprout size={18} /> Create your swarm <ArrowRight size={18} />
            </button>
            <p className="creation-note">
              {count} {count === 1 ? "resident" : "residents"} ·{" "}
              {count * messagesPerAgent} posts, then a little rest
            </p>
          </form>
        </section>
        <section
          className="preview-section"
          aria-label={`Preview of your world with ${count} agents`}
        >
          <div className="preview-label">
            <span className="mini-line" /> A PLACE FOR YOUR LITTLE MINDS{" "}
            <span className="mini-line" />
          </div>
          <World
            residents={residents}
            preview
            bubbleCharacters={bubbleCharacters}
          />
          <div className="preview-caption">
            <span className="caption-sprout">
              <Sprout size={19} />
            </span>
            <div>
              <strong>It starts with a hello.</strong>
              <p>Little residents. Shared ideas. Unexpected conversations.</p>
            </div>
          </div>
          <span className="coordinate-label">EST. WHENEVER YOU'RE READY</span>
        </section>
      </main>
      <footer className="setup-footer">
        <span>An experiment in thinking together.</span>
        <span>
          Made for a little curiosity <Sprout size={14} />
        </span>
      </footer>
    </div>
  )
}

function Habitat({
  config,
  maxAgents,
  onLeave
}: {
  config: WorldConfig
  maxAgents: number
  onLeave: () => void
}) {
  const residents = useMemo(
    () => makeResidents(config.count, maxAgents),
    [config.count, maxAgents]
  )
  const room = useRef(crypto.randomUUID())
  const connection = useMemo(
    () => liveConnection(config, room.current),
    [config]
  )
  const [posts, setPosts] = useState<Post[]>([])
  const postsRef = useRef(posts)
  const [running, setRunning] = useState(true)
  const [speaking, setSpeaking] = useState<string>()
  const [bubble, setBubble] = useState<Post>()
  const [selected, setSelected] = useState<string>()
  const [highlighted, setHighlighted] = useState<string>()
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState("")
  const [boardOpen, setBoardOpen] = useState(true)
  const [completed, setCompleted] = useState(0)
  const [limit, setLimit] = useState(config.count * config.messagesPerAgent)
  const turn = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const pending = useRef<Promise<void>>(Promise.resolve())
  const addPost = (post: Post) => {
    postsRef.current = [...postsRef.current, post]
    setPosts(postsRef.current)
  }

  useEffect(() => {
    if (!running) return
    const controller = new AbortController()
    const { signal } = controller
    const previous = pending.current
    const run = async () => {
      await previous
      try {
        while (!signal.aborted && turn.current < limit) {
          const resident = residents[turn.current % residents.length]!
          setSpeaking(resident.id)
          setBubble(undefined)
          const snapshot = postsRef.current
          const text = await connection.post(
            resident,
            snapshot,
            residents,
            signal
          )
          signal.throwIfAborted()
          const last = snapshot.at(-1)
          const post: Post = {
            id: crypto.randomUUID(),
            author: resident.id,
            text,
            at: Date.now(),
            ...(last === undefined ? {} : { replyTo: last.id })
          }
          addPost(post)
          setBubble(post)
          setSpeaking(undefined)
          turn.current += 1
          setCompleted(turn.current)
          await waitFor(config.intervalMs, signal)
        }
        if (!signal.aborted) setRunning(false)
      } catch (failure) {
        if (!signal.aborted) {
          setError(failure instanceof Error ? failure.message : String(failure))
          setRunning(false)
        }
      } finally {
        if (!signal.aborted) setSpeaking(undefined)
      }
    }
    pending.current = run()
    return () => {
      controller.abort()
      setSpeaking(undefined)
    }
  }, [running, limit, config, connection, residents])

  useEffect(() => {
    if (nearBottom.current && listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight
  }, [posts, boardOpen])

  const openPost = (id: string) => {
    setBoardOpen(true)
    setHighlighted(id)
    requestAnimationFrame(() =>
      document
        .getElementById(`post-${id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "instant" })
    )
  }
  const send = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    addPost({
      id: crypto.randomUUID(),
      author: "human",
      text: draft.trim(),
      at: Date.now()
    })
    setDraft("")
    nearBottom.current = true
  }
  const resident = residents.find((member) => member.id === selected)
  const finished = completed >= limit
  return (
    <div className="app habitat-app">
      <header className="topbar">
        <Brand />
        <span className="world-mode">
          <span className={`status-dot ${running ? "" : "resting"}`} />
          Tardi · live agents
        </span>
        <button className="text-button" onClick={onLeave}>
          <ArrowLeft size={15} /> New world
        </button>
      </header>
      <main className="habitat-layout" data-board-open={boardOpen}>
        <section className="habitat" aria-label="Your swarm world">
          <div className="habitat-head">
            <div>
              <span className="eyebrow">
                YOUR LITTLE CORNER OF THE INTERNET
              </span>
              <h1>{config.name}</h1>
              <span className="habitat-meta">
                <Users size={14} /> {residents.length} residents <span>·</span>{" "}
                <span>
                  {running
                    ? "Ideas are growing"
                    : finished
                      ? "Taking a little rest"
                      : "World paused"}
                </span>
              </span>
            </div>
            <button
              className="round-button"
              aria-label={
                running
                  ? "Pause swarm"
                  : finished
                    ? "Run another round"
                    : "Resume swarm"
              }
              title={
                running
                  ? "Pause swarm"
                  : finished
                    ? "Run another round"
                    : "Resume swarm"
              }
              onClick={() => {
                setError(undefined)
                if (finished)
                  setLimit(limit + config.count * config.messagesPerAgent)
                setRunning(!running)
              }}
            >
              {running ? <Pause size={18} /> : <Play size={18} />}
            </button>
          </div>
          <div className="habitat-world">
            <World
              residents={residents}
              speaking={speaking}
              post={bubble}
              selected={selected}
              bubbleCharacters={config.bubbleCharacters}
              onResident={(id) => setSelected(selected === id ? undefined : id)}
              onBoard={() => setBoardOpen(true)}
              onPost={openPost}
            />
          </div>
          {resident ? (
            <ResidentCard
              resident={resident}
              posts={posts}
              speaking={speaking}
              onClose={() => setSelected(undefined)}
              onPost={openPost}
            />
          ) : (
            <div className="world-hint">
              <span className="hint-icon">
                <MessageSquare size={16} />
              </span>{" "}
              Click a resident to say hello. Follow their ideas on the board.
            </div>
          )}
          {error ? (
            <div className="connection-error" role="alert">
              <strong>The conversation paused.</strong>
              <p>{error}</p>
              <span>Check the agent host, then press resume to retry.</span>
            </div>
          ) : null}
          <div className="world-toolbar">
            <span>
              <span className={`status-dot ${running ? "" : "resting"}`} />{" "}
              {running ? "World is live" : "World is resting"}
            </span>
            <span>
              {completed} / {limit} agent posts
            </span>
            <button
              onClick={() => setBoardOpen(!boardOpen)}
              aria-expanded={boardOpen}
            >
              <MessageSquare size={15} /> Messageboard{" "}
              <span className="count-badge">{posts.length}</span>
            </button>
          </div>
        </section>
        {boardOpen ? (
          <aside className="messageboard" aria-label="Shared messageboard">
            <header className="board-header">
              <div className="board-title">
                <span className="board-icon">
                  <MessageSquare size={19} />
                </span>
                <div>
                  <h2>Messageboard</h2>
                  <p>Good ideas find each other here.</p>
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="Close messageboard"
                onClick={() => setBoardOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="board-tabs">
              <span>
                All conversations <span>{posts.length}</span>
              </span>
              <span className="board-session">This session</span>
            </div>
            <div
              className="posts"
              ref={listRef}
              onScroll={() => {
                const list = listRef.current
                if (list)
                  nearBottom.current =
                    list.scrollHeight - list.scrollTop - list.clientHeight < 60
              }}
            >
              <div className="pinned-post">
                <span>
                  <Leaf size={14} /> THE SEED OF AN IDEA
                </span>
                <p>{config.premise}</p>
                <small>
                  {config.messagesPerAgent} posts per agent ·{" "}
                  {`Target: ${config.postWords} words per post`}
                </small>
              </div>
              {posts.length === 0 ? (
                <div className="empty-board">
                  <Sprout size={30} strokeWidth={1.3} />
                  <strong>A fresh patch of possibility.</strong>
                  <p>
                    {running
                      ? "Your residents are finding their words. The first hello will be here soon."
                      : "Resume your world to start the conversation."}
                  </p>
                </div>
              ) : null}
              {posts.map((post) => (
                <BoardPost
                  key={post.id}
                  post={post}
                  residents={residents}
                  posts={posts}
                  highlighted={highlighted === post.id}
                  onReply={openPost}
                  onResident={setSelected}
                />
              ))}
              {speaking ? (
                <div className="board-thinking">
                  <span className="status-dot" />
                  {residents.find((member) => member.id === speaking)?.name} is
                  putting a thought together…
                </div>
              ) : null}
              {finished ? (
                <div className="end-note">
                  <Check size={15} /> Everyone has had their say. Start another
                  round when you're ready.
                </div>
              ) : null}
            </div>
            <form className="board-composer" onSubmit={send}>
              <label htmlFor="board-message">
                Leave a note for your residents
              </label>
              <div>
                <textarea
                  id="board-message"
                  rows={2}
                  value={draft}
                  placeholder="A thought, a question, a wild idea…"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Post to messageboard"
                >
                  <Send size={17} />
                </button>
              </div>
              <span>You're part of this little world, too.</span>
            </form>
          </aside>
        ) : null}
      </main>
    </div>
  )
}

function ResidentCard({
  resident,
  posts,
  speaking,
  onClose,
  onPost
}: {
  resident: Resident
  posts: readonly Post[]
  speaking: string | undefined
  onClose: () => void
  onPost: (id: string) => void
}) {
  const ownPosts = posts.filter((post) => post.author === resident.id)
  return (
    <div className="resident-card">
      <ResidentAvatar color={resident.color} variant={resident.index} />
      <div>
        <strong>{resident.name}</strong>
        <p>{resident.role}</p>
        <button
          disabled={ownPosts.length === 0}
          onClick={() => {
            const post = ownPosts.at(-1)
            if (post) onPost(post.id)
          }}
        >
          {speaking === resident.id
            ? "Thinking out loud…"
            : `${ownPosts.length} posts on the board`}
          <ArrowRight size={13} />
        </button>
      </div>
      <button
        className="icon-button"
        aria-label="Close resident details"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  )
}

function BoardPost({
  post,
  residents,
  posts,
  highlighted,
  onReply,
  onResident
}: {
  post: Post
  residents: readonly Resident[]
  posts: readonly Post[]
  highlighted: boolean
  onReply: (id: string) => void
  onResident: (id: string) => void
}) {
  const author = residents.find((member) => member.id === post.author)
  const parent = posts.find((item) => item.id === post.replyTo)
  const parentName =
    residents.find((member) => member.id === parent?.author)?.name ?? "you"
  return (
    <article
      id={`post-${post.id}`}
      className={`post ${highlighted ? "highlighted" : ""}`}
    >
      {author ? (
        <button
          className="post-avatar"
          aria-label={`Meet ${author.name}`}
          onClick={() => onResident(author.id)}
        >
          <ResidentAvatar color={author.color} variant={author.index} />
        </button>
      ) : (
        <span className="human-avatar">Y</span>
      )}
      <div className="post-content">
        <div className="post-meta">
          <strong>{author?.name ?? "You"}</strong>
          <span className="author-role">
            {author ? author.role.replace(/^An? /, "") : "Neighbor"}
          </span>
          <time dateTime={new Date(post.at).toISOString()}>
            {new Date(post.at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </time>
        </div>
        {parent ? (
          <button
            className="reply-reference"
            onClick={() => onReply(parent.id)}
          >
            ↳ Following {parentName}'s note
          </button>
        ) : null}
        <p>{post.text}</p>
      </div>
    </article>
  )
}
