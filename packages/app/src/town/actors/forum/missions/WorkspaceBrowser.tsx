import { FileTree } from "./FileTree"
import { ArrowLeft, X, ChevronRight, Folder } from "lucide-react"
import { useEffect, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArtifactBrowser, type ReadArtifact } from "../../artifacts/ArtifactBrowser"
import type { Artifact } from "../../artifacts/store"
import type { Resident } from "../../../world"
import type { Mission } from "./store"
import type { MissionFile, MissionFileInfo } from "./workspace"

export interface WorkspaceReader {
  listMissionFiles: (missionId: string) => Promise<MissionFileInfo[]>
  readMissionFile: (missionId: string, path: string) => Promise<MissionFile>
}
type Target = { path: string; revision: number | undefined }
type FolderProps = {
  mission: Mission; missions: readonly Mission[]; reader: WorkspaceReader | undefined
  onFile: (mission: Mission, path: string) => void; onPublished: (target: Target) => void
}
function MissionFolder({ mission, missions, reader, onFile, onPublished }: FolderProps) {
  const [open, setOpen] = useState(!mission.parentMissionId)
  const [files, setFiles] = useState<MissionFileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!open || !reader) return
    let cancelled = false
    setLoading(true); setError(undefined)
    void reader.listMissionFiles(mission.id).then(value => { if (!cancelled) setFiles(value) }, cause => { if (!cancelled) setError(String(cause)) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, reader, mission.id, mission.history.length])
  return <li><details open={open} onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}>
    <summary title={mission.description}><ChevronRight className="file-tree-chevron" size={13} aria-hidden="true" /><Folder size={15} aria-hidden="true" /><span>{mission.description}</span><small>{mission.status.replaceAll("_", " ")}</small></summary>
    <div className="mission-folder-content">
      {error ? <p role="alert">{error}</p> : loading && !files.length ? <p role="status">Loading files…</p> : null}
      <FileTree files={files} submittedPath={mission.reviewFilePath} onOpen={path => onFile(mission, path)} published={mission.artifactPath ? { path: mission.artifactPath, revision: mission.artifactRevision, onOpen: () => onPublished({ path: mission.artifactPath!, revision: mission.artifactRevision }) } : undefined} />
      {!loading && !error && !files.length && !mission.artifactPath && <p className="file-tree-empty">No files yet</p>}
      <ul>{missions.filter(child => child.parentMissionId === mission.id).map(child => <MissionFolder key={child.id} mission={child} missions={missions} reader={reader} onFile={onFile} onPublished={onPublished} />)}</ul>
    </div>
  </details></li>
}
export function WorkspaceBrowser({ missions, residents, reader, artifacts, readArtifact, onClose, initialPath, initialRevision }: {
  missions: readonly Mission[]; residents: readonly Resident[]; reader?: WorkspaceReader | undefined
  artifacts: readonly Artifact[]; readArtifact?: ReadArtifact | undefined; onClose: () => void
  initialPath?: string | undefined; initialRevision?: number | undefined
}) {
  const [published, setPublished] = useState<Target>()
  const [selected, setSelected] = useState<{ mission: Mission; path: string }>()
  const [document, setDocument] = useState<MissionFile>()
  const [error, setError] = useState<string>()
  useEffect(() => { if (initialPath) { setPublished({ path: initialPath, revision: initialRevision }); setSelected(undefined) } }, [initialPath, initialRevision])
  const selectedVersion = missions.find(mission => mission.id === selected?.mission.id)?.history.length
  useEffect(() => {
    setDocument(undefined); setError(undefined)
    if (!selected || !reader) return
    let cancelled = false
    void reader.readMissionFile(selected.mission.id, selected.path).then(file => { if (!cancelled) setDocument(file) }, cause => { if (!cancelled) setError(String(cause)) })
    return () => { cancelled = true }
  }, [selected, reader, selectedVersion])
  const openFile = (mission: Mission, path: string) => { setSelected({ mission, path }); setPublished(undefined) }
  return <>
    {published && <ArtifactBrowser key={`${published.path}:${published.revision}`} missions={missions} files={artifacts} residents={residents} read={readArtifact} onClose={onClose} onBack={() => { setPublished(undefined); setSelected(undefined) }} initialPath={published.path} initialRevision={published.revision} />}
    <aside className="artifact-browser workspace-browser mission-workspace" aria-label="Workspace" style={published ? { display: "none" } : undefined}>
      <header><h2>Workspace</h2><button className="panel-icon-button" type="button" onClick={onClose} aria-label="Close workspace"><X size={18} strokeWidth={1.75} aria-hidden="true" /></button></header>
      {selected && <nav><button className="panel-icon-button" type="button" aria-label="Back to files" onClick={() => setSelected(undefined)}><ArrowLeft size={18} aria-hidden="true" /></button><span title={`${selected.mission.description}/${selected.path}`}>{selected.path}</span></nav>}
      <div className="artifact-files workspace-file-tree workspace-explorer" style={selected ? { display: "none" } : undefined}>
        <ul>{missions.filter(mission => !mission.parentMissionId || !missions.some(parent => parent.id === mission.parentMissionId)).map(mission => <MissionFolder key={mission.id} mission={mission} missions={missions} reader={reader} onFile={openFile} onPublished={setPublished} />)}</ul>
        {!missions.length && <p>No files yet.</p>}
      </div>
      {selected && (error ? <p role="alert">{error}</p> : !document ? <p role="status">Opening file…</p> : <div className="artifact-document">{document.path.endsWith(".md") ? <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ href, children }) => <a href={href?.startsWith("https://") || href?.startsWith("http://") ? href : undefined} target="_blank" rel="noopener noreferrer">{children}</a> }}>{document.content}</Markdown> : <pre>{document.content}</pre>}</div>)}
    </aside>
  </>
}
