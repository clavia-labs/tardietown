import { IconButton, Action } from "../../town/ui/controls"
import { SelectField } from "../../town/ui/SelectField"
import { Disclosure, DisclosureSummary } from "../../town/ui/Disclosure"
import { ReviewPanel } from "../forum/missions/ReviewPanel"
import type { Mission } from "../forum/missions/store"
import { ArrowLeft as PanelBack, X as PanelClose, MoreHorizontal as PanelMore, FolderOpen, FileText } from "lucide-react"
import { useEffect, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Artifact, ArtifactDocument } from "./store"
import type { Resident } from "../../town/world"
export type ReadArtifact = (path: string, revision?: number) => Promise<{ artifact: ArtifactDocument; history: readonly Artifact[] }>
export function ArtifactBrowser({ title = "Published", files, read, residents, onClose, initialPath, initialRevision, onBack, missions = [] }: { title?: string; missions?: readonly Mission[]; files: readonly Artifact[]; read?: ReadArtifact | undefined; residents: readonly Resident[]; onClose: () => void; onBack?: (() => void) | undefined; initialPath?: string | undefined; initialRevision?: number | undefined }) {
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
  const reviewMission = document && missions.find(mission => mission.artifactPath === document.path || mission.reviews?.some(vote => vote.artifactPath === document.path))
  const revisionVotes = document && reviewMission?.reviews.filter(vote => vote.artifactPath === document.path && vote.artifactRevision === document.revision)
  const revisionReviewId = reviewMission?.artifactPath === document?.path && reviewMission?.artifactRevision === document?.revision ? reviewMission?.reviewId : revisionVotes?.at(-1)?.reviewId
  const download = () => {
    if (!document) return
    const url = URL.createObjectURL(new Blob([document.content], { type: "text/markdown;charset=utf-8" }))
    const link = window.document.createElement("a")
    link.href = url; link.download = document.path.split("/").at(-1)!
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const entries = [...new Set(files.filter(file => file.path.startsWith(folder)).map(file => file.path.slice(folder.length).split("/")[0]!))].sort()
  return <aside data-scene-card="workspace" className="artifact-browser workspace-browser" aria-label="Shared workspace">
    <header><h2>{title === "Workspace" ? <FolderOpen size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />} {title}</h2><IconButton variant="ghost" className="panel-icon-button" type="button" onClick={onClose} label="Close shared workspace"><PanelClose size={18} strokeWidth={1.75} aria-hidden="true" /></IconButton></header>
    <nav><IconButton variant="ghost" className="panel-icon-button" type="button" disabled={!path && folder === "/" && !onBack} label={onBack ? "Back to files" : path ? "Back to published files" : folder !== "/" ? "Back to parent folder" : "Back to mission workspace"} onClick={() => { if (onBack) { onBack(); return } if(path) { setPath(undefined); setRevision(undefined); setRaw(false) } else if (folder !== "/") setFolder(folder.slice(0,-1).split("/").slice(0,-1).join("/") + "/") }}><PanelBack size={18} strokeWidth={1.75} aria-hidden="true" /></IconButton><span title={path ?? folder}>{path ? path.split("/").at(-1) : folder === "/" ? "All documents" : folder}</span></nav>
    {path ? <>
      {error ? <p role="alert">{error}</p> : !document ? <p role="status">Opening document…</p> : <>
        <div className="workspace-document-bar">
        <p className="artifact-meta">{residents.find(resident => resident.id === document.author)?.name ?? document.author} · <time dateTime={new Date(document.at).toISOString()} title={new Date(document.at).toLocaleString()}>{new Date(document.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></p>
        <Disclosure className="workspace-options"><DisclosureSummary aria-label="Document options"><PanelMore size={18} strokeWidth={1.75} aria-hidden="true" /></DisclosureSummary><div className="workspace-options-panel">
        <div className="artifact-actions"><label>Revision <SelectField label="Revision" value={String(document.revision)} onValueChange={value => setRevision(Number(value))} options={history.map(file => ({ value: String(file.revision), label: String(file.revision) }))} /></label><Action type="button" onClick={() => setRaw(!raw)}>{raw ? "Preview" : "Raw Markdown"}</Action><Action type="button" onClick={download}>Download</Action></div>
        <p className="artifact-meta">{document.summary}</p>
        </div></Disclosure>
        </div>
        <div className="artifact-document">{raw ? <pre>{document.content}</pre> : <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({alt}) => <span>{alt}</span>, a: ({href, children}) => <a href={href?.startsWith("https://") || href?.startsWith("http://") ? href : undefined} target="_blank" rel="noopener noreferrer">{children}</a> }}>{document.content}</Markdown>}
          {reviewMission && revisionReviewId && <div className="artifact-reviews"><h3>Reviews · v{document.revision}</h3><ReviewPanel key={revisionReviewId} mission={{ ...reviewMission, reviewId: revisionReviewId, reviews: revisionVotes ?? [] }} residents={residents} showComments /></div>}
        </div>
      </>}
    </> : <div className="artifact-files">{!entries.length ? <p>No documents yet.</p> : entries.map(name => {
      const file = files.find(file => file.path === folder + name)
      return <Action type="button" key={name} onClick={() => { if(file) { setPath(file.path); setRevision(undefined) } else setFolder(folder + name + "/") }}><span>{file ? "▤" : "▱"} {name}{file ? "" : "/"}</span>{file && <small>v{file.revision} · {residents.find(resident => resident.id === file.author)?.name ?? file.author}</small>}</Action>
    })}</div>}
  </aside>
}
