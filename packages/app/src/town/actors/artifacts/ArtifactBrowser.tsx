import { useEffect, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Artifact, ArtifactDocument } from "./store"
import type { Resident } from "../../world"
export type ReadArtifact = (path: string, revision?: number) => Promise<{ artifact: ArtifactDocument; history: readonly Artifact[] }>
export function ArtifactBrowser({ files, read, residents, onClose, initialPath, initialRevision }: { files: readonly Artifact[]; read?: ReadArtifact | undefined; residents: readonly Resident[]; onClose: () => void; initialPath?: string | undefined; initialRevision?: number | undefined }) {
  const [folder, setFolder] = useState("/")
  const [path, setPath] = useState<string>()
  const [revision, setRevision] = useState<number>()
  const [document, setDocument] = useState<ArtifactDocument>()
  const [history, setHistory] = useState<readonly Artifact[]>([])
  const [raw, setRaw] = useState(false)
  const [error, setError] = useState<string>()
  const currentRevision = files.find(file => file.path === path)?.revision
  useEffect(() => {
    if (!initialPath) return
    setFolder(initialPath.slice(0, initialPath.lastIndexOf("/") + 1) || "/")
    setPath(initialPath)
    setRevision(initialRevision)
  }, [initialPath, initialRevision])
  useEffect(() => {
    let cancelled = false
    setDocument(undefined); setError(undefined)
    if (path && read) void read(path, revision).then(result => {
      if (!cancelled) { setDocument(result.artifact); setHistory(result.history) }
    }, cause => { if (!cancelled) setError(String(cause)) })
    return () => { cancelled = true }
  }, [path, revision, read, currentRevision])
  const download = () => {
    if (!document) return
    const url = URL.createObjectURL(new Blob([document.content], { type: "text/markdown;charset=utf-8" }))
    const link = window.document.createElement("a")
    link.href = url; link.download = document.path.split("/").at(-1)!
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const entries = [...new Set(files.filter(file => file.path.startsWith(folder)).map(file => file.path.slice(folder.length).split("/")[0]!))].sort()
  return <aside className="artifact-browser" aria-label="Shared workspace">
    <header><h2>Shared workspace</h2><button type="button" onClick={onClose} aria-label="Close shared workspace">×</button></header>
    <nav><button type="button" disabled={!path && folder === "/"} onClick={() => { if(path) { setPath(undefined); setRevision(undefined) } else setFolder(folder.slice(0,-1).split("/").slice(0,-1).join("/") + "/") }}>← Back</button><span>{path ?? folder}</span></nav>
    {path ? <>
      {error ? <p role="alert">{error}</p> : !document ? <p role="status">Opening document…</p> : <>
        <div className="artifact-actions"><label>Revision <select value={document.revision} onChange={event => setRevision(Number(event.target.value))}>{history.map(file => <option key={file.revision} value={file.revision}>{file.revision}</option>)}</select></label><button type="button" onClick={() => setRaw(!raw)}>{raw ? "Preview" : "Raw Markdown"}</button><button type="button" onClick={download}>Download</button></div>
        <p className="artifact-meta">{residents.find(resident => resident.id === document.author)?.name ?? document.author} · {new Date(document.at).toLocaleString()}</p>
        <p className="artifact-meta">{document.summary}</p>
        <div className="artifact-document">{raw ? <pre>{document.content}</pre> : <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({alt}) => <span>{alt}</span>, a: ({href, children}) => <a href={href?.startsWith("https://") || href?.startsWith("http://") ? href : undefined} target="_blank" rel="noopener noreferrer">{children}</a> }}>{document.content}</Markdown>}</div>
      </>}
    </> : <div className="artifact-files">{!entries.length ? <p>No artifacts yet. Residents can publish Markdown documents here.</p> : entries.map(name => {
      const file = files.find(file => file.path === folder + name)
      return <button type="button" key={name} onClick={() => { if(file) { setPath(file.path); setRevision(undefined) } else setFolder(folder + name + "/") }}><span>{file ? "▤" : "▱"} {name}{file ? "" : "/"}</span>{file && <small>v{file.revision} · {residents.find(resident => resident.id === file.author)?.name ?? file.author}</small>}</button>
    })}</div>}
  </aside>
}
