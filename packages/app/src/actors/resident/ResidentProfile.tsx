import { IconButton } from "../../town/ui/controls"
import { Tabs } from "@base-ui/react/tabs"
import { ResidentEvents } from "./ResidentEvents"
import type { ReadResidentEvents } from "./events"
import { ArrowLeft, X as PanelClose } from "lucide-react"
import { MessageTime } from "../../ui/MessageTime"
import type { ForumMessage } from "./components/forum"
import { useCallback, useEffect, useRef, useState } from "react"
import { ResidentAvatar } from "../../town/scene/ResidentAvatar"
import type { Resident } from "../../town/world"

export function ResidentProfile({ resident, messages, karma, onBack, onClose, readEvents }: {
  readEvents?: ReadResidentEvents | undefined
  resident: Resident
  karma: number
  messages: readonly ForumMessage[]
  onBack: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<"posts" | "replies" | "events">("posts")
  const [eventCount, setEventCount] = useState<{ count: number; more: boolean }>()
  const receiveCount = useCallback((count: number, more: boolean) => setEventCount({ count, more }), [])
  const card = useRef<HTMLElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus({ preventScroll: true })
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", key)
    return () => {
      window.removeEventListener("keydown", key)
    }
  }, [onClose])
  const contributions = messages.filter((message) => message.author === resident.id)
  const activity = contributions.filter(message => tab === "posts" ? !message.parentId : !!message.parentId).toReversed()
  return (
    <aside ref={card} data-scene-card="resident" className="resident-profile" data-resident={resident.id} aria-label={`${resident.name}'s profile`}>
      <header className="resident-profile-nav"><IconButton variant="ghost" type="button" onClick={onBack} label="Back to residents"><ArrowLeft size={18} aria-hidden="true" /></IconButton><IconButton variant="ghost" className="resident-profile-close" ref={close} type="button" onClick={onClose} label="Close resident profile"><PanelClose size={18} strokeWidth={1.75} aria-hidden="true" /></IconButton></header>
      <div className="resident-profile-identity">
        <ResidentAvatar index={resident.index} />
        <div><h2>{resident.name}</h2><p className="resident-profile-karma">{karma} karma</p></div>
      </div>
      <Tabs.Root className="resident-tabs-root" value={tab} onValueChange={value => setTab(value as typeof tab)}><Tabs.List className="resident-activity-tabs" aria-label="Resident activity">
        <Tabs.Tab value="posts">Posts · {contributions.filter(message => !message.parentId).length}</Tabs.Tab>
        <Tabs.Tab value="replies">Replies · {contributions.filter(message => message.parentId).length}</Tabs.Tab>
        {readEvents && <Tabs.Tab value="events">Events{eventCount ? ` · ${eventCount.count}${eventCount.more ? "+" : ""}` : ""}</Tabs.Tab>}
      </Tabs.List>
      <Tabs.Panel value={tab} className="resident-activity" tabIndex={0} aria-label={`${resident.name}'s ${tab}`}>
        {tab === "events" && readEvents ? <ResidentEvents key={resident.id} resident={resident.id} read={readEvents} onCount={receiveCount} /> : activity.length ? activity.map(message => {
          const thread = messages.find(entry => entry.id === message.threadId)
          return <article key={message.id}>
            <header><span>{message.parentId ? "Replied" : "Posted"}</span><MessageTime at={message.at} /></header>
            {(message.title || thread?.title) && <h3>{message.title ?? thread?.title}</h3>}
            <p>{message.body}</p>
            <small>↑ {message.score ?? 0} · {message.parentId ? "Reply" : `${messages.filter(entry => entry.threadId === message.id && entry.parentId).length} replies`}</small>
          </article>
        }) : <p className="resident-activity-empty">No {tab} yet.</p>}
      </Tabs.Panel></Tabs.Root>
    </aside>
  )
}
