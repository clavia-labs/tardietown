export interface McpToolInfo { name: string; method: string; description: string; inputSchema: Record<string, unknown>; enabled: boolean }
export interface McpConnectionInfo { id: string; name: string; packageName: string; url: string; auth: "none" | "key" | "oauth"; status: "connected" | "auth_required" | "error"; tools: McpToolInfo[]; error?: string }
export type McpCommand =
  | { action: "add"; name: string; url: string; auth: "none" | "key" | "oauth"; apiKey?: string; headerName?: string; clientId?: string }
  | { action: "remove" | "connect"; id: string }
  | { action: "tools"; id: string; enabled: string[] }
export interface McpUpdateResult { connections: McpConnectionInfo[]; authorizationUrl?: string }

export interface InstalledPackage {
  name: string
  connectionId: string
  methods: { name: string; tool: string; description: string; inputSchema: Record<string, unknown> }[]
}
export type PackageEvent =
  | (InstalledPackage & { type: "PackageInstalled" | "PackageUpdated"; id: string; at: number })
  | { type: "PackageRemoved"; name: string; connectionId: string; id: string; at: number }
