import type { ResidentEvent } from "../src/town/actors/resident/events"
// Never expose transport envelopes or credentials through the inspector.
export function residentEvent(row: { seq: number; event: { type: string; [key: string]: unknown } }, secret?: string): ResidentEvent {
  const details = JSON.stringify(row.event, (key, value) => {
    if (/^(http|headers|authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|secret|cookie|set-cookie)$/i.test(key)) return "[redacted]"
    if (typeof value === "string") {
      const clean = secret ? value.replaceAll(secret, "[redacted]") : value
      return clean.replace(/Bearer\s+[^\s"\\]+/gi, "Bearer [redacted]")
    }
    return value
  }, 2)
  return { seq: row.seq, type: row.event.type, ...(typeof row.event.at === "number" ? { at: row.event.at } : {}), details: details.length > 16000 ? details.slice(0, 16000) + "\n… truncated" : details }
}
