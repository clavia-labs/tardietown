import { ChevronRight, FileText, Folder } from "lucide-react"
import type { MissionFileInfo } from "./workspace"

interface Directory { folders: Map<string, Directory>; files: MissionFileInfo[] }
export function FileTree({ files, submittedPath, onOpen, published }: { published?: { path: string; revision: number | undefined; onOpen: () => void } | undefined; files: readonly MissionFileInfo[]; submittedPath?: string | undefined; onOpen: (path: string) => void }) {
  const root: Directory = { folders: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split("/")
    let directory = root
    for (const part of parts.slice(0, -1)) {
      if (!directory.folders.has(part)) directory.folders.set(part, { folders: new Map(), files: [] })
      directory = directory.folders.get(part)!
    }
    directory.files.push(file)
  }
  const render = (directory: Directory) => <ul>
    {[...directory.folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => <li key={`folder:${name}`}>
      <details open><summary><ChevronRight className="file-tree-chevron" size={13} aria-hidden="true" /><Folder size={15} strokeWidth={1.6} aria-hidden="true" /><span>{name}</span></summary>{render(child)}</details>
    </li>)}
    {[...directory.files].sort((a, b) => a.path.localeCompare(b.path)).map(file => <li key={file.path}>
      <button type="button" title={file.path} onClick={() => onOpen(file.path)}><FileText size={15} strokeWidth={1.6} aria-hidden="true" /><span>{file.path.split("/").at(-1)}</span>{file.path === submittedPath && <small className="file-tree-submitted">Submitted</small>}<small>v{file.revision}</small></button>
    </li>)}
  </ul>
  return <nav className="workspace-file-tree" aria-label="Mission files">
    {published && <ul><li><button type="button" title={published.path} onClick={published.onOpen}><FileText size={15} strokeWidth={1.6} aria-hidden="true" /><span>{published.path.split("/").at(-1)}</span><small className="file-tree-submitted">Published</small><small>v{published.revision}</small></button></li></ul>}
    {render(root)}
  </nav>
}
