import type { ForumSessionState } from "../forum/session"
import type { McpConnectionInfo } from "../../town/packages/mcp-types"
export interface InboxIssue { id: string; title: string; message: string; action: "connect" | "budget" | "retry"; connectionId?: string }
// Stable IDs group repeated failures; the authoritative snapshot clears fixed issues.
export function inboxIssues(state: ForumSessionState, connections: readonly McpConnectionInfo[]): InboxIssue[] {
  const issues: InboxIssue[] = []
  for (const connection of connections) if (connection.status !== "connected") issues.push({ id: `connection:${connection.id}`, title: `${connection.name} needs attention`, message: connection.status === "auth_required" ? "Sign in to make this package available." : "The package could not connect. Check its settings or reconnect.", action: "connect", connectionId: connection.id })
  if (state.spend && !state.spend.unavailable && state.spend.remainingUsd <= 0.000001) issues.push({ id: "budget", title: "Model budget used up", message: "Add budget to continue. The town stays paused until you resume it.", action: "budget" })
  if (state.error) issues.push({ id: "resident-failure", title: "A resident could not finish", message: state.error, action: "retry" })
  return issues
}
