import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { McpCommand, McpConnectionInfo, McpToolInfo, McpUpdateResult, InstalledPackage, PackageEvent } from "../../src/town/packages/mcp-types"
import { uniqueName } from "./names"
import { McpOAuth } from "./oauth"
interface Connection { info: McpConnectionInfo; client?: Client; transport?: StreamableHTTPClientTransport; oauth?: McpOAuth; key?: string; header: string; busy: boolean }
const validUrl = (value: string) => {
  const url = new URL(value)
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password || url.hash) throw Error("Use an HTTPS MCP URL, without credentials or fragments.")
  return url.href
}
export class McpConnections {
  private readonly connections = new Map<string, Connection>()
  private readonly usedNames = new Set<string>()
  private readonly installed = new Map<string, InstalledPackage>()
  private publishTail: Promise<void> = Promise.resolve()
  constructor(private readonly changed: () => void, private readonly publish: (event: PackageEvent) => Promise<void> = async () => {}) {}
  private sync(value: Connection) {
    const task = async () => {
      const previous = this.installed.get(value.info.id)
      const active = this.connections.has(value.info.id) && value.info.status === "connected"
      const current: InstalledPackage = {
        name: value.info.packageName, connectionId: value.info.id,
        methods: value.info.tools.filter(tool => tool.enabled).map(tool => ({ name: tool.method, tool: tool.name, description: tool.description, inputSchema: tool.inputSchema }))
      }
      if (active && JSON.stringify(previous) !== JSON.stringify(current)) {
        await this.publish({ ...current, type: previous ? "PackageUpdated" : "PackageInstalled", id: crypto.randomUUID(), at: Date.now() })
        this.installed.set(value.info.id, current)
      } else if (!active && previous) {
        await this.publish({ type: "PackageRemoved", name: previous.name, connectionId: value.info.id, id: crypto.randomUUID(), at: Date.now() })
        this.installed.delete(value.info.id)
      }
    }
    const result = this.publishTail.then(task)
    this.publishTail = result.catch(() => {})
    return result
  }
  snapshot = () => [...this.connections.values()].map(value => structuredClone(value.info))
  private get(id: string) { const value = this.connections.get(id); if (!value) throw Error("MCP connection not found."); return value }
  private async connect(value: Connection) {
    await value.client?.close().catch(() => {})
    const client = new Client({ name: "tardie-town", version: "1.0.0" })
    const transport = new StreamableHTTPClientTransport(new URL(value.info.url), {
      ...(value.oauth ? { authProvider: value.oauth } : {}),
      ...(value.key ? { requestInit: { headers: { [value.header]: value.header.toLowerCase() === "authorization" ? `Bearer ${value.key}` : value.key } } } : {}),
      fetch: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30000)]) })
    })
    value.client = client; value.transport = transport
    try {
      // SDK v1 exposes an optional sessionId getter as string | undefined.
      await client.connect(transport as Transport)
      const tools: McpToolInfo[] = []
      const enabled = new Set(value.info.tools.filter(tool => tool.enabled).map(tool => tool.name))
      let cursor: string | undefined
      const seen = new Set<string>()
      do {
        const page = await client.listTools(cursor ? { cursor } : {})
        tools.push(...page.tools.map(tool => ({ name: tool.name, method: "", description: (tool.description ?? "").slice(0, 2000), inputSchema: tool.inputSchema as Record<string, unknown>, enabled: enabled.has(tool.name) })))
        cursor = page.nextCursor
        if (tools.length > 500 || (cursor && seen.has(cursor))) throw Error("Tool list too large")
        if (cursor) seen.add(cursor)
      } while (cursor)
      if (new Set(tools.map(tool => tool.name)).size !== tools.length) throw Error("Duplicate MCP tools")
      const names = new Map(value.info.tools.map(tool => [tool.name, tool.method]))
      const used = new Set(names.values())
      for (const tool of [...tools].sort((a, b) => a.name.localeCompare(b.name))) tool.method = names.get(tool.name) ?? uniqueName(tool.name, used)
      value.info = { ...value.info, tools: JSON.parse(this.redact(JSON.stringify(tools))) as McpToolInfo[], status: "connected" }; delete value.info.error
    } catch {
      value.info.status = value.oauth?.pending?.url ? "auth_required" : "error"
      value.info.error = value.info.status === "auth_required" ? "Sign in to connect." : "Connection failed. Check the URL and authentication."
      await client.close().catch(() => {})
    }
    await this.sync(value)
    this.changed()
  }
  async command(command: McpCommand, callback: string): Promise<McpUpdateResult> {
    let value: Connection
    if (command.action === "add") {
      if (this.connections.size >= 12 || typeof command.name !== "string" || !command.name.trim() || command.name.length > 80 || typeof command.url !== "string" || !["none", "key", "oauth"].includes(command.auth)) throw Error("Invalid MCP connection.")
      const header = command.headerName?.trim() || "Authorization"
      if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(header) || /^(host|cookie|content-type|content-length|connection|mcp-.*)$/i.test(header)) throw Error("Invalid API key header.")
      if (command.auth === "key" && (typeof command.apiKey !== "string" || !command.apiKey.trim() || command.apiKey.length > 4096 || /[\r\n]/.test(command.apiKey))) throw Error("Supply a valid API key.")
      if (command.clientId !== undefined && (typeof command.clientId !== "string" || command.clientId.length > 512)) throw Error("Invalid client ID.")
      value = { info: { id: crypto.randomUUID(), name: command.name.trim(), packageName: uniqueName(command.name.trim().toLowerCase(), this.usedNames), url: validUrl(command.url), auth: command.auth, status: "error", tools: [] }, header, busy: false,
        ...(command.auth === "key" ? { key: command.apiKey!.trim() } : {}), ...(command.auth === "oauth" ? { oauth: new McpOAuth(callback, command.clientId?.trim() || undefined) } : {}) }
      this.connections.set(value.info.id, value)
    } else {
      value = this.get(command.id)
      if (value.busy) throw Error("Connection is busy. Try again.")
      if (command.action === "remove") { this.connections.delete(command.id); await value.client?.close().catch(() => {}); await this.sync(value); this.changed(); return { connections: this.snapshot() } }
      if (command.action === "tools") {
        if (!Array.isArray(command.enabled) || !command.enabled.every(name => typeof name === "string" && value.info.tools.some(tool => tool.name === name))) throw Error("Unknown MCP tool.")
        value.info.tools = value.info.tools.map(tool => ({ ...tool, enabled: command.enabled.includes(tool.name) })); await this.sync(value); this.changed(); return { connections: this.snapshot() }
      }
      if (command.action !== "connect") throw Error("Unknown MCP command.")
    }
    value.busy = true
    try { await this.connect(value) } finally { value.busy = false }
    return { connections: this.snapshot(), ...(value.oauth?.pending?.url ? { authorizationUrl: value.oauth.pending.url } : {}) }
  }
  ownsState(state: string) { return [...this.connections.values()].some(value => value.oauth?.pending?.state === state) }
  async callback(params: URLSearchParams) {
    const value = [...this.connections.values()].find(value => value.oauth?.pending?.state === params.get("state"))
    if (!value?.oauth?.pending || value.oauth.pending.expires < Date.now() || value.busy) throw Error("Authorization expired. Connect again.")
    const metadata = value.oauth.discoveryState()?.authorizationServerMetadata
    const issuer = params.get("iss")
    if ((issuer && issuer !== metadata?.issuer) || ((metadata as { authorization_response_iss_parameter_supported?: boolean } | undefined)?.authorization_response_iss_parameter_supported === true && !issuer)) throw Error("Authorization issuer mismatch.")
    value.oauth.pending = undefined
    if (!params.get("code") || params.has("error")) throw Error("Authorization was not completed.")
    value.busy = true
    try { await value.transport!.finishAuth(params.get("code")!); await this.connect(value) }
    catch { value.info.status = "error"; value.info.error = "Authorization failed. Connect again."; throw Error(value.info.error) }
    finally { value.busy = false; this.changed() }
  }
  tools = () => this.snapshot().filter(value => value.status === "connected").map(value => ({ id: value.id, name: value.name, tools: value.tools.filter(tool => tool.enabled) }))
  async call(id: string, name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const value = this.get(id)
    if (value.info.status !== "connected" || !value.client || !value.info.tools.some(tool => tool.name === name && tool.enabled)) throw Error("MCP tool is disconnected or disabled.")
    try {
      const result = await value.client.callTool({ name, arguments: args }, undefined, { signal, timeout: 60000 })
      const serialized = this.redact(JSON.stringify(result))
      return serialized.length > 100000 ? { truncated: true, content: serialized.slice(0, 100000) } : JSON.parse(serialized) as unknown
    } catch {
      if (value.oauth?.pending?.url) {
        value.info.status = "auth_required"
        value.info.error = "Sign in to reconnect."
        await this.sync(value)
        this.changed()
      }
      throw Error("MCP call failed. Check the connection in Packages; calls are not automatically retried.") }
  }
  redact(text: string) { for (const value of this.connections.values()) for (const secret of [value.key, value.oauth?.tokens()?.access_token, value.oauth?.tokens()?.refresh_token]) if (secret) text = text.replaceAll(JSON.stringify(secret).slice(1, -1), "[redacted]").replaceAll(secret, "[redacted]"); return text }
  async close() { await Promise.allSettled([...this.connections.values()].map(value => value.client?.close())); this.connections.clear() }
}
