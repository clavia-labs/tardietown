import { Action, Input } from "../ui/controls"
import { SelectField } from "../ui/SelectField"
import { Switch } from "@base-ui/react/switch"
import { Disclosure, DisclosureSummary } from "../ui/Disclosure"
import { MCP_PRESETS } from "./presets"
import { createPortal } from "react-dom"
import { useState } from "react"
import { ChevronRight, LockKeyhole, Plug, Plus, Search } from "lucide-react"
import type { McpCommand, McpConnectionInfo, McpUpdateResult } from "./mcp-types"
export function McpPanel({ connections, update, actions }: { actions: HTMLDivElement | null; connections: readonly McpConnectionInfo[]; update: (command: McpCommand) => Promise<McpUpdateResult> }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [auth, setAuth] = useState<"none" | "key" | "oauth">("none")
  const [key, setKey] = useState("")
  const [header, setHeader] = useState("Authorization")
  const [clientId, setClientId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [authorization, setAuthorization] = useState<{ id: string; url: string }>()
  const run = async (command: McpCommand) => {
    if (busy) return
    setBusy(true); setError(undefined); setAuthorization(undefined)
    try { const result = await update(command); if (result.authorizationUrl) { const id = command.action === "add" ? result.connections.at(-1)?.id : command.id; if (id) setAuthorization({ id, url: result.authorizationUrl }) }; if (command.action === "add") { setAdding(false); setKey(""); setName(""); setUrl("") } }
    catch { setError("Could not update MCP connection. Check the settings and try again.") }
    finally { setBusy(false) }
  }
  return <div className="mcp-settings">
    {adding && <form className="mcp-add-form" onSubmit={event => { event.preventDefault(); void run({ action: "add", name, url, auth, ...(auth === "key" ? { apiKey: key, headerName: header } : {}), ...(auth === "oauth" && clientId ? { clientId } : {}) }) }}>
      <label>Package name<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Server URL<Input required type="url" placeholder="https://example.com/mcp" value={url} onChange={event => setUrl(event.target.value)} /></label>
      <label>Authentication<SelectField label="Authentication" value={auth} onValueChange={value => { setAuth(value as typeof auth); setKey("") }} options={[{ value: "none", label: "None" }, { value: "key", label: "API key" }, { value: "oauth", label: "OAuth sign-in" }]} /></label>
      {auth === "key" && <><label>Header<Input required value={header} onChange={event => setHeader(event.target.value)} /></label><label>API key<Input type="password" autoComplete="off" required value={key} onChange={event => setKey(event.target.value)} /></label></>}
      {auth === "oauth" && <label>Client ID (if required by your server)<Input value={clientId} onChange={event => setClientId(event.target.value)} /></label>}
      <div><Action type="button" disabled={busy} onClick={() => { setAdding(false); setKey("") }}>Cancel</Action><Action type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect"}</Action></div>
    </form>}
    {error && <p role="alert">{error}</p>}
    {connections.map(connection => {
      const connected = connection.status === "connected"
      const enabled = connection.tools.filter(tool => tool.enabled)
      const signInUrl = !connected && authorization?.id === connection.id ? authorization.url : undefined
      return <section className="package-entry" key={connection.id}>
        <div className="package-heading">
          <span className="package-logo package-logo-workspace" aria-hidden="true"><McpIcon src={connection.icon} /></span>
          <div className="package-identity"><strong>{connection.name}</strong><p>{connected ? `${enabled.length} of ${connection.tools.length} tools enabled` : connection.status === "auth_required" ? "Sign in to connect" : "Connection unavailable"}</p></div>
          {connected && <Switch.Root className="ui-switch" aria-label={`Enable ${connection.name} tools`} checked={enabled.length > 0} disabled={busy || !connection.tools.length} onCheckedChange={() => void run({ action: "tools", id: connection.id, enabled: enabled.length ? [] : connection.tools.map(tool => tool.name) })}><Switch.Thumb /></Switch.Root>}
        </div>
        <Disclosure className="package-settings" defaultOpen={!connected}><DisclosureSummary>Connection settings</DisclosureSummary><div className="package-credential">
          <LockKeyhole size={13} aria-hidden="true" /><span>{connected ? "Connected" : "Not connected"}</span>
          {signInUrl ? <a href={signInUrl} target="_blank" rel="noopener noreferrer">Continue sign-in ↗</a> : <Action type="button" disabled={busy} onClick={() => void run({ action: "connect", id: connection.id })}>{!connected && connection.auth === "oauth" ? "Sign in" : "Reconnect"}</Action>}
          <Action type="button" disabled={busy} onClick={() => void run({ action: "remove", id: connection.id })}>Remove</Action>
        </div>
        </Disclosure>
        {connection.status === "error" && connection.error && <p className="mcp-error" role="status">{connection.error}</p>}
        {!!connection.tools.length && <Disclosure className="mcp-tools">
          <DisclosureSummary className="mcp-tools-heading"><ChevronRight size={14} aria-hidden="true" /><span>Tools</span><span className="mcp-tools-count">{connection.tools.length}</span></DisclosureSummary>
          <McpTools connection={connection} busy={busy} run={run} />
        </Disclosure>}
      </section>
    })}
    {!adding && <div className="mcp-presets" aria-label="Suggested packages">
      {MCP_PRESETS.filter(preset => !connections.some(connection => connection.url.replace(/\/$/, "") === preset.url)).map(preset =>
        <Action key={preset.name} type="button" disabled={busy} onClick={() => void run({ action: "add", name: preset.name, url: preset.url, auth: preset.auth })}>
          <span><strong>{preset.label}</strong><small>{preset.description}</small></span><Plus size={15} aria-hidden="true" />
        </Action>
      )}
    </div>}
    {!adding && actions && createPortal(<Action className="mcp-add-button" type="button" disabled={busy} onClick={() => setAdding(true)}><Plus size={13} aria-hidden="true" /> Add MCP package</Action>, actions)}
  </div>
}

function McpTools({ connection, busy, run }: { connection: McpConnectionInfo; busy: boolean; run: (command: McpCommand) => Promise<void> }) {
  const [query, setQuery] = useState("")
  const enabled = connection.tools.filter(tool => tool.enabled).map(tool => tool.name)
  const tools = connection.tools.filter(tool => `${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase().trim()))
  return <div className="mcp-tool-browser">
    <label className="mcp-tool-search"><Search size={14} aria-hidden="true" /><Input aria-label={`Search ${connection.name} tools`} placeholder="Find a tool…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="mcp-tool-list" role="group" aria-label={`${connection.name} tools`}>
      {tools.map(tool => {
        const prefix = `${connection.packageName}_`
        const label = (tool.method.startsWith(prefix) ? tool.method.slice(prefix.length) : tool.method).replaceAll("_", " ")
        return <div className="mcp-tool" key={tool.name}>
          <Disclosure className="mcp-tool-description">
            <DisclosureSummary><ChevronRight size={12} aria-hidden="true" /><span>{label}</span></DisclosureSummary>
            <code>{connection.packageName}.{tool.method}</code><p>{tool.description || "No description provided."}</p>
          </Disclosure>
          <Switch.Root className="ui-switch" aria-label={`Enable ${connection.packageName}.${tool.method}`} checked={tool.enabled} disabled={busy} onCheckedChange={() => void run({ action: "tools", id: connection.id, enabled: tool.enabled ? enabled.filter(name => name !== tool.name) : [...enabled, tool.name] })}><Switch.Thumb /></Switch.Root>
        </div>
      })}
      {!tools.length && <p className="mcp-no-tools">No matching tools.</p>}
    </div>
    <div className="mcp-tool-footer"><span>{tools.length} tools</span><span title={connection.url}>{new URL(connection.url).hostname}</span></div>
  </div>
}

function McpIcon({ src }: { src?: string | undefined }) {
  const [failed, setFailed] = useState<string>()
  return src && failed !== src
    ? <img className="mcp-provider-icon" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} />
    : <Plug size={22} strokeWidth={1.6} />
}
