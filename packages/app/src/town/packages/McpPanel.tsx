import { useState } from "react"
import { Plug, Plus } from "lucide-react"
import type { McpCommand, McpConnectionInfo, McpUpdateResult } from "./mcp-types"
export function McpPanel({ connections, update }: { connections: readonly McpConnectionInfo[]; update: (command: McpCommand) => Promise<McpUpdateResult> }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [auth, setAuth] = useState<"none" | "key" | "oauth">("none")
  const [key, setKey] = useState("")
  const [header, setHeader] = useState("Authorization")
  const [clientId, setClientId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [authorizationUrl, setAuthorizationUrl] = useState<string>()
  const run = async (command: McpCommand) => {
    if (busy) return
    setBusy(true); setError(undefined); setAuthorizationUrl(undefined)
    try { const result = await update(command); setAuthorizationUrl(result.authorizationUrl); if (command.action === "add") { setAdding(false); setKey(""); setName(""); setUrl("") } }
    catch { setError("Could not update MCP connection. Check the settings and try again.") }
    finally { setBusy(false) }
  }
  return <div className="mcp-settings">
    <div className="package-heading"><strong>Connected packages</strong><button type="button" onClick={() => setAdding(value => !value)}><Plus size={13} aria-hidden="true" /> Add MCP package</button></div>
    {adding && <form className="mcp-add-form" onSubmit={event => { event.preventDefault(); void run({ action: "add", name, url, auth, ...(auth === "key" ? { apiKey: key, headerName: header } : {}), ...(auth === "oauth" && clientId ? { clientId } : {}) }) }}>
      <label>Package name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Server URL<input required type="url" placeholder="https://example.com/mcp" value={url} onChange={event => setUrl(event.target.value)} /></label>
      <label>Authentication<select value={auth} onChange={event => { setAuth(event.target.value as typeof auth); setKey("") }}><option value="none">None</option><option value="key">API key</option><option value="oauth">OAuth sign-in</option></select></label>
      {auth === "key" && <><label>Header<input required value={header} onChange={event => setHeader(event.target.value)} /></label><label>API key<input type="password" autoComplete="off" required value={key} onChange={event => setKey(event.target.value)} /></label></>}
      {auth === "oauth" && <label>Client ID (if required by your server)<input value={clientId} onChange={event => setClientId(event.target.value)} /></label>}
      <div><button type="button" disabled={busy} onClick={() => { setAdding(false); setKey("") }}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect"}</button></div>
    </form>}
    {authorizationUrl && <a className="mcp-sign-in" href={authorizationUrl} target="_blank" rel="noopener noreferrer">Continue sign-in ↗</a>}
    {error && <p role="alert">{error}</p>}
    {connections.map(connection => <section className="package-entry" key={connection.id}>
      <div className="package-heading"><span className="package-logo package-logo-workspace"><Plug size={20} aria-hidden="true" /></span><div className="package-identity"><strong>{connection.name}</strong><p>{connection.status.replaceAll("_", " ")} · {connection.tools.filter(tool => tool.enabled).length} tools enabled</p></div></div>
      <p className="artifact-meta"><code>{connection.packageName}</code> · MCP</p>
      <p className="mcp-server-url" title={connection.url}>{connection.url}</p>
      {connection.error && <p>{connection.error}</p>}
      <div className="mcp-actions"><button type="button" disabled={busy} onClick={() => void run({ action: "connect", id: connection.id })}>{connection.status === "auth_required" ? "Sign in" : "Reconnect"}</button><button type="button" disabled={busy} onClick={() => void run({ action: "remove", id: connection.id })}>Remove</button></div>
      {!!connection.tools.length && <details><summary>Tools · {connection.tools.length}</summary>{connection.tools.map(tool => <label className="mcp-tool" key={tool.name}><input type="checkbox" checked={tool.enabled} disabled={busy} onChange={event => void run({ action: "tools", id: connection.id, enabled: event.target.checked ? [...connection.tools.filter(item => item.enabled).map(item => item.name), tool.name] : connection.tools.filter(item => item.enabled && item.name !== tool.name).map(item => item.name) })} /><span><strong>{connection.packageName}.{tool.method}</strong><small>{tool.description}</small></span></label>)}</details>}
    </section>)}
    {!connections.length && !adding && <p className="artifact-meta">Connect a remote server, then choose the tools residents can use.</p>}
  </div>
}
