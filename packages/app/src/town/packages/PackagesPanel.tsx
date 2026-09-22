import { McpPanel } from "./McpPanel"
import type { McpCommand, McpConnectionInfo, McpUpdateResult } from "./mcp-types"
import { useState } from "react"
import { LockKeyhole, Wrench, FolderOpen, X } from "lucide-react"
import type { PackageUpdate, TownPackage } from "./types"
export function PackagesPanel({ packages, onUpdate, onClose, mcp = [], onMcp }: { mcp?: readonly McpConnectionInfo[] | undefined; onMcp?: ((command: McpCommand) => Promise<McpUpdateResult>) | undefined; packages: readonly TownPackage[]; onUpdate?: ((update: PackageUpdate) => Promise<void>) | undefined; onClose: () => void }) {
  const [key, setKey] = useState("")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const save = async (update: PackageUpdate) => {
    if (saving || !onUpdate) return
    setSaving(true); setError(undefined)
    try { await onUpdate(update); setKey(""); setEditing(false) }
    catch { setError("Could not update package settings. Try again.") }
    finally { setSaving(false) }
  }
  return <aside className="artifact-browser workspace-browser packages-panel" aria-label="Packages">
    <header><h2><Wrench size={17} aria-hidden="true" /> Packages</h2><button className="panel-icon-button" type="button" aria-label="Close packages" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <p className="artifact-meta">Tools available to your residents.</p>
    {!onUpdate && <p role="status">Restart the backend and start a new town to configure packages.</p>}
    <div className="package-list">{packages.map(pkg => <section className="package-entry" key={pkg.id}>
      <div className="package-heading">
        <div className={`package-logo package-logo-${pkg.id}`} aria-hidden="true">{pkg.id === "exa" ? <span>exa</span> : <FolderOpen size={22} strokeWidth={1.6} />}</div>
        <div className="package-identity"><strong>{pkg.name}</strong><p>{pkg.description}</p></div>
        {pkg.builtIn ? <small className="package-badge">Built-in</small> : <button className="package-toggle" type="button" role="switch" aria-label="Enable Exa" aria-checked={pkg.enabled} title={pkg.enabled ? "Disable Exa" : "Enable Exa"} disabled={saving} onClick={() => void save({ id: "exa", enabled: !pkg.enabled })}><span /></button>}
      </div>
      {pkg.id === "exa" && <>
        <div className="package-credential"><LockKeyhole size={13} aria-hidden="true" /><span>{pkg.credential === "configured" ? "Key configured" : "API key needed"}</span><button type="button" disabled={saving} onClick={() => { setEditing(value => !value); setKey("") }}>{pkg.credential === "configured" ? "Replace key" : "Add key"}</button>{pkg.credential === "configured" && <button disabled={saving} type="button" onClick={() => void save({ id: "exa", removeKey: true })}>Remove</button>}</div>
        {editing && <form onSubmit={event => { event.preventDefault(); if (key.trim()) void save({ id: "exa", apiKey: key }) }}><label>Exa API key<input type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" autoFocus value={key} onChange={event => setKey(event.target.value)} disabled={saving} required /></label><div><button type="button" disabled={saving} onClick={() => { setEditing(false); setKey("") }}>Cancel</button><button type="submit" disabled={saving || !key.trim()}>{saving ? "Saving…" : "Save key"}</button></div></form>}
      </>}
    </section>)}
    {onMcp && <McpPanel connections={mcp} update={onMcp} />}
    </div>
    {error && <p role="alert">{error}</p>}
    <p className="artifact-meta">Keys stay on the server for this town’s session. Changes apply to new requests. API charges are separate.</p>
  </aside>
}
