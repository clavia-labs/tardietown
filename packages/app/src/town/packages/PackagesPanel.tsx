import { IconButton } from "../ui/controls"
import { Disclosure, DisclosureSummary } from "../ui/Disclosure"
import { useState } from "react"
import { McpPanel } from "./McpPanel"
import type { McpCommand, McpConnectionInfo, McpUpdateResult } from "./mcp-types"
import { ChevronRight, Globe, Wrench, FolderOpen, X } from "lucide-react"
import type { PackageUpdate, TownPackage } from "./types"
export function PackagesPanel({ packages, onClose, mcp = [], onMcp, preview = false }: { preview?: boolean; mcp?: readonly McpConnectionInfo[] | undefined; onMcp?: ((command: McpCommand) => Promise<McpUpdateResult>) | undefined; packages: readonly TownPackage[]; onUpdate?: ((update: PackageUpdate) => Promise<void>) | undefined; onClose: () => void }) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  return <aside className="artifact-browser workspace-browser packages-panel" aria-label="Packages">
    <header><h2><Wrench size={17} aria-hidden="true" /> Packages</h2><IconButton variant="ghost" className="panel-icon-button" type="button" label="Close packages" onClick={onClose}><X size={18} aria-hidden="true" /></IconButton></header>
    <p className="artifact-meta">{preview ? "Built-in tools · Connect more after starting a town." : "Tools available to your residents."}</p>
    <div className="package-list">{packages.filter(pkg => pkg.id !== "exa").map(pkg => <section className="package-entry" key={pkg.id}>
      <div className="package-heading">
        <div className="package-logo package-logo-workspace" aria-hidden="true">{pkg.id === "fetch" ? <Globe size={22} strokeWidth={1.6} /> : <FolderOpen size={22} strokeWidth={1.6} />}</div>
        <div className="package-identity"><strong>{pkg.name}</strong><p>{pkg.id === "workspace" ? "Read and search research files." : pkg.id === "fetch" ? "Read URLs and make requests." : pkg.description}</p></div>
        <small className="package-badge">Built-in</small>
      </div>
      {!!pkg.tools?.length && <Disclosure className="mcp-tools">
        <DisclosureSummary className="mcp-tools-heading"><ChevronRight size={14} aria-hidden="true" /><span>Tools</span><span className="mcp-tools-count">{pkg.tools.length}</span></DisclosureSummary>
        <div className="mcp-tool-list builtin-tool-list">{pkg.tools.map(tool => <Disclosure key={tool.name}>
          <DisclosureSummary><ChevronRight size={13} aria-hidden="true" /><code>{tool.name}</code></DisclosureSummary>
          <p>{tool.description}</p><pre>{JSON.stringify(tool.input, null, 2)}</pre>
        </Disclosure>)}</div>
      </Disclosure>}
    </section>)}
    {onMcp && <McpPanel connections={mcp} update={onMcp} actions={actions} />}
    </div>
    {onMcp && <div className="packages-footer" ref={setActions} />}
  </aside>
}
