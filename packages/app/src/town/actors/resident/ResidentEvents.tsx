import { useEffect, useRef, useState } from "react"
import { MessageTime } from "../../../ui/MessageTime"
import type { ReadResidentEvents, ResidentEvent } from "./events"
export function ResidentEvents({ resident, read }: { resident: string; read: ReadResidentEvents }) {
  const [events, setEvents] = useState<ResidentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [more, setMore] = useState(false)
  const cursor = useRef(0)
  const alive = useRef(false)
  const busy = useRef(false)
  const load = async () => {
    if (busy.current) return
    busy.current = true; setLoading(true); setError(undefined)
    try {
      const page = await read(resident, cursor.current)
      if (!alive.current) return
      cursor.current = page.cursor
      setEvents(previous => [...previous, ...page.events]); setMore(page.hasMore)
    } catch { if (alive.current) setError("Could not load events. Try again.") }
    finally { busy.current = false; if (alive.current) setLoading(false) }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [resident, read])
  return <div className="resident-events">
    {events.map(event => <details key={event.seq}><summary><span>{event.type.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>{event.at !== undefined && <MessageTime at={event.at} />}</summary><pre>{event.details}</pre></details>)}
    {!events.length && !loading && !error && <p>No events yet.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={loading} onClick={() => void load()}>{loading ? "Loading…" : error ? "Retry" : more ? "Load more events" : "Refresh"}</button>
  </div>
}
