import { useEffect, useState } from "react"
import type { LibraryEntry, LibraryDocument } from "./store"
import type { Resident } from "../world"

export type ReadLibrary = (id: string) => Promise<LibraryDocument>

export function LibraryBrowser({ entries, read, residents, onClose }: {
  entries: readonly LibraryEntry[]
  read?: ReadLibrary | undefined
  residents: readonly Resident[]
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string>()
  const [document, setDocument] = useState<LibraryDocument>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let cancelled = false
    setDocument(undefined)
    setError(undefined)
    if (selected && read) void read(selected).then(
      entry => { if (!cancelled) setDocument(entry) },
      cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)) }
    )
    return () => { cancelled = true }
  }, [selected, read])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [onClose])
  const author = (id: string) => residents.find(resident => resident.id === id)?.name ?? id
  const needle = query.trim().toLocaleLowerCase()
  const visible = entries.filter(entry => `${entry.title} ${entry.sourceUrl ?? ""}`.toLocaleLowerCase().includes(needle))
  const source = document?.sourceUrl
  const safeSource = source && /^https?:\/\//i.test(source) ? source : undefined
  return <aside className="artifact-browser library-browser" aria-label="Library">
    <header><h2>Library</h2><button type="button" onClick={onClose} aria-label="Close library">×</button></header>
    {selected ? <>
      <nav><button type="button" onClick={() => setSelected(undefined)}>← Back</button></nav>
      {error ? <p role="alert">{error}</p> : !read ? <p>Reading is unavailable.</p> : !document ? <p role="status">Opening reference…</p> : <>
        <h3>{document.title}</h3>
        <p className="artifact-meta">Saved by {author(document.author)} · <time dateTime={new Date(document.at).toISOString()}>{new Date(document.at).toLocaleString()}</time></p>
        {safeSource && <a className="library-source" href={safeSource} target="_blank" rel="noopener noreferrer">{safeSource}</a>}
        <div className="artifact-document library-content">{document.content}</div>
      </>}
    </> : <>
      <label className="library-search">Find a reference<input type="search" placeholder="Search titles or sources" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p className="artifact-meta">{entries.length} {entries.length === 1 ? "reference" : "references"}</p>
      <div className="artifact-files library-entries">
        {!entries.length ? <p>No references yet. Residents can save source material here for everyone to read.</p> : !visible.length ? <p>No matching references.</p> : visible.map(entry => <button key={entry.id} type="button" onClick={() => setSelected(entry.id)}>
          <span>{entry.title}</span>
          <small>{entry.sourceUrl ?? "Town reference"}</small>
          <small>Saved by {author(entry.author)}</small>
        </button>)}
      </div>
    </>}
  </aside>
}
