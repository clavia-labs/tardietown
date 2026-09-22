import { FileTree } from "./FileTree"
import { ArrowLeft as PanelBack, X as PanelClose } from "lucide-react"
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
export function WorkspaceBrowser({ missions, residents, reader, artifacts, readArtifact, onClose, initialPath, initialRevision }: {
  missions: readonly Mission[]
  residents: readonly Resident[]
  reader?: WorkspaceReader | undefined
  artifacts: readonly Artifact[]
  readArtifact?: ReadArtifact | undefined
  onClose: () => void
  initialPath?: string | undefined
  initialRevision?: number | undefined
}) {
  const [published, setPublished] = useState(!!initialPath)
  const [target, setTarget] = useState<{ path: string | undefined; revision: number | undefined }>({ path: initialPath, revision: initialRevision })
  const [missionId, setMissionId] = useState<string>()
  const [path, setPath] = useState<string>()
  const [files, setFiles] = useState<MissionFileInfo[]>([])
  const [document, setDocument] = useState<MissionFile>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const mission = missions.find(entry => entry.id === missionId)
  const version = mission?.history.length
  useEffect(() => { if (initialPath) { setTarget({ path: initialPath, revision: initialRevision }); setPublished(true) } }, [initialPath, initialRevision])
  useEffect(() => {
    let cancelled = false
    setError(undefined); setDocument(undefined); setFiles([])
    if (!missionId || !reader || published || !mission || !("approvalsRequired" in mission)) { setLoading(false); return }
    setLoading(true)
    const load = async () => {
      try {
        if (path) {
          const value = await reader.readMissionFile(missionId, path)
          if (!cancelled) setDocument(value)
        } else {
          const value = await reader.listMissionFiles(missionId)
          if (!cancelled) setFiles(value)
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)) }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [missionId, path, reader, version, published])
  if (published) return <ArtifactBrowser files={artifacts} residents={residents} read={readArtifact} onClose={onClose} onBack={() => setPublished(false)} initialPath={target.path} initialRevision={target.revision} />
  return <aside className="artifact-browser workspace-browser mission-workspace" aria-label="Mission workspace">
    <header><h2>Workspace</h2><button className="panel-icon-button" type="button" onClick={onClose} aria-label="Close workspace"><PanelClose size={18} strokeWidth={1.75} aria-hidden="true" /></button></header>
    <nav>
      {missionId && <button className="panel-icon-button" aria-label={path ? "Back to mission files" : "Back to missions"} type="button" onClick={() => { if (path) setPath(undefined); else setMissionId(undefined) }}><PanelBack size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
      <span title={path ?? mission?.description}>{path ?? mission?.description ?? "Mission files"}</span>
      <button type="button" className="workspace-published" onClick={() => { setTarget({ path: undefined, revision: undefined }); setPublished(true) }}>Published · {artifacts.length}</button>
    </nav>
    {mission && <p className="artifact-meta">{mission.owner ? `${residents.find(resident => resident.id === mission.owner)?.name ?? mission.owner}${mission.status === "completed" ? " · Read only" : " · Shared workspace"}` : "Unclaimed"}</p>}
    {mission?.artifactPath && <button type="button" className="workspace-submission" onClick={() => { setTarget({ path: mission.artifactPath, revision: mission.artifactRevision }); setPublished(true) }}>
      Submitted · {mission.artifactPath.split("/").at(-1)} · v{mission.artifactRevision}
    </button>}
    {error ? <p role="alert">{error}</p> : loading ? <p role="status">Opening workspace…</p> : document ? <div className="artifact-document">
      {document.path.endsWith(".md") ? <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ href, children }) => <a href={href?.startsWith("https://") || href?.startsWith("http://") ? href : undefined} target="_blank" rel="noopener noreferrer">{children}</a> }}>{document.content}</Markdown> : <pre>{document.content}</pre>}
    </div> : <div className="artifact-files mission-files">
      {!missionId ? missions.map(entry => <button key={entry.id} type="button" onClick={() => { setMissionId(entry.id); setPath(undefined) }}><span>{entry.description}</span><small>{entry.status.replace("_", " ")}</small></button>) : files.length ? <FileTree key={missionId} files={files} submittedPath={mission?.reviewFilePath} onOpen={setPath} /> : <p>No working files recorded.</p>}
    </div>}
  </aside>
}
