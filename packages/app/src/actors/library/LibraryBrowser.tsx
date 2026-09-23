import { IconButton, Action, Input } from "../../town/ui/controls"
import { ArrowLeft as PanelBack, X as PanelClose, Upload, Library } from "lucide-react"
import { useEffect, useState } from "react"
import type { LibraryEntry, LibraryDocument } from "./store"
import type { Resident } from "../../town/world"

export type ReadLibrary = (id: string) => Promise<LibraryDocument>

export function LibraryBrowser({ entries, read, upload, residents, onClose }: {
  upload?: ((title: string, content: string, operationId: string) => Promise<unknown>) | undefined
  entries: readonly LibraryEntry[]
  read?: ReadLibrary | undefined
  residents: readonly Resident[]
  onClose: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string>()
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
  const author = (id: string) => id === "user" ? "You" : residents.find(resident => resident.id === id)?.name ?? id
  const needle = query.trim().toLocaleLowerCase()
  const visible = entries.filter(entry => `${entry.title} ${entry.sourceUrl ?? ""}`.toLocaleLowerCase().includes(needle))
  const source = document?.sourceUrl
  const safeSource = source && /^https?:\/\//i.test(source) ? source : undefined
  return <aside data-scene-card="library" className="artifact-browser library-browser" aria-label="Library">
    <header><h2><Library size={16} aria-hidden="true" /> Library</h2><IconButton variant="ghost" className="panel-icon-button" type="button" onClick={onClose} label="Close library"><PanelClose size={18} strokeWidth={1.75} aria-hidden="true" /></IconButton></header>
    {selected ? <>
      <nav><IconButton variant="ghost" className="panel-icon-button" label="Back to library" type="button" onClick={() => setSelected(undefined)}><PanelBack size={18} strokeWidth={1.75} aria-hidden="true" /></IconButton></nav>
      {error ? <p role="alert">{error}</p> : !read ? <p>Reading is unavailable.</p> : !document ? <p role="status">Opening reference…</p> : <>
        <h3>{document.title}</h3>
        <p className="artifact-meta">Saved by {author(document.author)} · <time dateTime={new Date(document.at).toISOString()}>{new Date(document.at).toLocaleString()}</time></p>
        {safeSource && <a className="library-source" href={safeSource} target="_blank" rel="noopener noreferrer">{safeSource}</a>}
        <div className="artifact-document library-content">{document.content}</div>
      </>}
    </> : <>
      <label className="library-search">Find a reference<Input type="search" placeholder="Search titles or sources" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p className="artifact-meta">{entries.length} {entries.length === 1 ? "reference" : "references"}</p>
      <div className="artifact-files library-entries">
        {!entries.length ? <p>No references yet. Residents can save source material here for everyone to read.</p> : !visible.length ? <p>No matching references.</p> : visible.map(entry => <Action key={entry.id} type="button" onClick={() => setSelected(entry.id)}>
          <span>{entry.title}</span>
          <small>{entry.sourceUrl ?? "Town reference"}</small>
          <small>Saved by {author(entry.author)}</small>
        </Action>)}
      </div>
      <div className="library-upload-footer">
      {upload && <label className="library-upload"><Upload size={14} aria-hidden="true" />{uploading ? "Uploading…" : "Upload Markdown"}<input type="file" accept=".md,.markdown,text/markdown" disabled={uploading} onChange={async event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ""
        if (!file) return
        setUploadError(undefined)
        if (!/\.(md|markdown)$/i.test(file.name) || file.size > 400000) { setUploadError("Choose a Markdown file up to 400 KB (100,000 characters)."); return }
        setUploading(true)
        try { await upload(file.name, await file.text(), crypto.randomUUID()); setQuery("") }
        catch (cause) { setUploadError(cause instanceof Error ? cause.message : "Upload failed. Try again.") }
        finally { setUploading(false) }
      }} /></label>}
      {uploadError && <p role="alert">{uploadError}</p>}
      </div>
    </>}
  </aside>
}
