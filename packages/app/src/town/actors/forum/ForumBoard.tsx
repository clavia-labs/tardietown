import { MessageTime } from "../../../ui/MessageTime"
import { useState, type FormEvent } from "react"
import { ResidentAvatar } from "../../scene/ResidentAvatar"
import type { Resident } from "../../world"
import type { shuffleDuckPalettes } from "../../scene/duckPalettes"
import type { ForumMessage } from "../resident/components/forum"
import type { ForumPolicy, ForumResult } from "../resident/components/forum"
import type { UserForumCommand } from "./user"
import type { Mission } from "./missions/store"

export function ForumBoard({
  policy,
  onSubmit,
  messages,
  residents,
  palettes,
  missions = [],
  onArtifact
}: {
  policy: ForumPolicy
  onSubmit: (
    command: UserForumCommand,
    operationId: string
  ) => Promise<ForumResult>
  messages: readonly ForumMessage[]
  residents: readonly Resident[]
  palettes: ReturnType<typeof shuffleDuckPalettes>
  missions?: readonly Mission[]
  onArtifact?: (path: string, revision?: number) => void
}) {
  const [thread, setThread] = useState<string>()
  const [parent, setParent] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState<"all" | "missions">("all")
  const root = messages.find((message) => message.id === thread)
  const missionById = new Map(missions.map(mission => [mission.id, mission]))
  const author = (id: string) =>
    residents.find((resident) => resident.id === id)?.name ?? "You"
  const authorLine = (message: ForumMessage) => (
    <div className="board-author">
      {message.author === "user" ? (
        <span className="board-user-avatar" aria-hidden="true">
          Y
        </span>
      ) : (
        <ResidentAvatar index={Math.max(0, residents.findIndex((resident) => resident.id === message.author))} />
      )}
      <strong>{author(message.author)}</strong>
      <MessageTime at={message.at} />
    </div>
  )
  const openThread = (id: string) => {
    setThread(id)
    setParent(id)
    setBody("")
  }
  const missionDetails = (mission: Mission, detail = false) => {
    const parentMission = mission.parentMissionId ? missionById.get(mission.parentMissionId) : undefined
    const children = missions.filter(entry => entry.parentMissionId === mission.id)
    return <div className="forum-mission-details">
      <div className="forum-mission-line">
        <span className={`forum-mission-status forum-mission-status-${mission.status}`}>Mission · {mission.status}</span>
        <span>{mission.owner ? `Owned by ${author(mission.owner)}` : "Unclaimed"}</span>
      </div>
      {mission.claimExpiresAt && <small>Claim expires {new Date(mission.claimExpiresAt).toLocaleString()}</small>}
      {detail && parentMission && <button type="button" onClick={() => openThread(parentMission.id)}>Parent mission: {parentMission.description}</button>}
      {detail && children.length > 0 && <div className="forum-mission-children"><small>Child missions</small>{children.map(child => <button type="button" key={child.id} onClick={() => openThread(child.id)}>{child.description}</button>)}</div>}
      {detail && mission.requests.length > 0 && <div className="forum-handoff-requests"><small>Handoff requests</small>{mission.requests.map((request, index) => <p key={`${request.residentId}-${request.at}-${index}`}><strong>{author(request.residentId)}</strong> · {request.reason}</p>)}</div>}
      {detail && mission.artifactPath && onArtifact && <button type="button" className="forum-mission-artifact" onClick={() => onArtifact(mission.artifactPath!, mission.artifactRevision)}>Open final artifact{mission.artifactRevision ? ` · v${mission.artifactRevision}` : ""}</button>}
    </div>
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending || !body.trim()) return
    setSending(true)
    setError(undefined)
    try {
      const target = messages.find(
        (message) => message.id === (parent ?? thread)
      )
      const result = await onSubmit(
        creating || !target
          ? { kind: "create_post", title: title.trim(), body: body.trim() }
          : { kind: "reply", parentId: target.id, body: body.trim() },
        crypto.randomUUID()
      )
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.kind === "create_post" || result.kind === "reply") {
        setThread(result.message.threadId)
        setParent(result.message.threadId)
      }
      setCreating(false)
      setTitle("")
      setBody("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSending(false)
    }
  }
  const renderMessage = (
    message: ForumMessage,
    depth: number
  ): React.ReactNode => (
    <div
      key={message.id}
      className="forum-branch"
      data-has-replies={messages.some((reply) => reply.parentId === message.id)}
      data-deep={depth >= 3}
    >
      <article>
        {authorLine(message)}
        <div className="forum-message-body">
          {depth > 3 && (
            <small>
              Reply to{" "}
              {author(
                messages.find((entry) => entry.id === message.parentId)
                  ?.author ?? "user"
              )}
            </small>
          )}
          <p>{message.body}</p>
        </div>
        <button
          type="button"
          className="forum-reply"
          aria-label={`Reply to ${author(message.author)}: ${message.body.slice(0, 40)}`}
          onClick={() => {
            setParent(message.id)
            setCreating(false)
          }}
        >
          Reply
        </button>
      </article>
      {messages.some((reply) => reply.parentId === message.id) && (
        <div className="forum-children">
          {messages
            .filter((reply) => reply.parentId === message.id)
            .map((reply) => renderMessage(reply, depth + 1))}
        </div>
      )}
    </div>
  )
  const threads = messages
    .filter((message) => !message.parentId)
    .sort((a, b) => {
      const latest = (id: string) =>
        messages.findLast((message) => message.threadId === id)?.sequence ?? 0
      return latest(b.id) - latest(a.id)
    })
  const visibleThreads = filter === "missions" ? threads.filter(message => missionById.has(message.id)) : threads
  return (
    <aside className="browser-board" aria-label="Forum">
      <div className="browser-board-heading">
        {(thread || creating) && (
          <button
            className="forum-back"
            type="button"
            aria-label="Back to threads"
            onClick={() => {
              setThread(undefined)
              setParent(undefined)
              setCreating(false)
              setError(undefined)
            }}
          >
            ←
          </button>
        )}
        <h2>Forum</h2>
        <button
          type="button"
          className="forum-new-post"
          aria-label="New post"
          title="New post"
          onClick={() => {
            setCreating(true)
            setThread(undefined)
            setParent(undefined)
            setBody("")
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <div className="forum-navigation">
        {!thread && !creating ? (
          <><span>{visibleThreads.length} threads</span><div className="forum-filters" role="group" aria-label="Filter forum threads"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button><button type="button" aria-pressed={filter === "missions"} onClick={() => setFilter("missions")}>Missions</button></div></>
        ) : (
          <span />
        )}
      </div>
      <div className="browser-posts">
        {creating ? (
          <p className="forum-hint">Start a new conversation with the residents.</p>
        ) : root ? (
          <>
            <h3>{root.title}</h3>
            {missionById.get(root.id) && missionDetails(missionById.get(root.id)!, true)}
            {renderMessage(root, 0)}
          </>
        ) : visibleThreads.length ? (
          visibleThreads.map((message) => (
            <button
              type="button"
              className="forum-thread-card"
              key={message.id}
              onClick={() => openThread(message.id)}
            >
              {authorLine(message)}
              {missionById.get(message.id) && missionDetails(missionById.get(message.id)!)}
              <h3>{message.title}</h3>
              <p>{message.body}</p>
              <small>
                {
                  messages.filter(
                    (entry) => entry.threadId === message.id && entry.parentId
                  ).length
                }{" "}
                replies
              </small>
            </button>
          ))
        ) : filter === "missions" ? (
          <p className="forum-hint">No missions yet.</p>
        ) : (
          <p className="forum-hint">
            The residents are reading their mission. Start a thread, or wait for
            their first idea.
          </p>
        )}
      </div>
      {(creating || root) && (
        <form
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          {creating ? (
            <input
              aria-label="Post title"
              placeholder="Give your post a title"
              value={title}
              maxLength={policy.maxTitleCharacters}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          ) : (
            <small>
              Replying to{" "}
              {author(
                messages.find((message) => message.id === (parent ?? thread))
                  ?.author ?? "user"
              )}
            </small>
          )}
          <textarea
            aria-label={creating ? "Post body" : "Reply body"}
            placeholder={
              creating
                ? "Share an idea with the residents"
                : "Add to the conversation"
            }
            value={body}
            maxLength={policy.maxBodyCharacters}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          {error && (
            <p role="alert" className="browser-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={sending || !body.trim() || (creating && !title.trim())}
          >
            {sending ? "Sending…" : creating ? "Post" : "Reply"}
          </button>
        </form>
      )}
    </aside>
  )
}
