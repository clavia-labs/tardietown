import { useTownPanel } from "../../town/state/TownUiProvider"
import { Textarea, Button, IconButton, Modal, ModalTitle } from "../../town/ui/controls"
import type { InboxIssue } from "./issues"
import { useState } from "react"
import { Bell, X } from "lucide-react"
import type { HumanRequest } from "./actor"
export type InboxAction = (input: { id: string; action: "answer" | "connect"; answer?: string }) => Promise<{ authorizationUrl?: string }>
export function HumanInboxButton({ items, action, issues = [], onIssue }: { items: readonly HumanRequest[]; action: InboxAction; issues?: readonly InboxIssue[]; onIssue?: ((issue: InboxIssue) => Promise<{ authorizationUrl?: string } | void>) | undefined }) {
  const [open, setOpen] = useTownPanel("inbox")
  const pending = items.filter(item => item.status === "pending")
  const count = pending.length + issues.length
  return <><IconButton label={`Inbox, ${count} pending`} className="inbox-bell" type="button" aria-label={`Inbox, ${count} pending`} title="Inbox" onClick={() => setOpen(true)}><Bell size={18} />{!!count && <span>{count}</span>}</IconButton>
    <Modal open={open} onOpenChange={setOpen} className="inbox-dialog"><header><ModalTitle>Inbox</ModalTitle><IconButton label="Close inbox" onClick={() => setOpen(false)}><X size={18} /></IconButton></header>
      {issues.map(issue => <IssueItem key={issue.id} issue={issue} run={async () => { const result = await onIssue?.(issue); if (issue.action === "budget") setOpen(false); return result }} />)}
      {!items.length && !issues.length && <p>No requests yet. Your mission owner can ask questions or request a package here.</p>}
      {[...pending, ...items.filter(item => item.status === "resolved").reverse()].map(item => <InboxItem key={item.id} item={item} action={action} />)}
    </Modal></>
}
function InboxItem({ item, action }: { item: HumanRequest; action: InboxAction }) {
  const [answer, setAnswer] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [url, setUrl] = useState<string>()
  const submit = async (kind: "answer" | "connect", text?: string) => {
    if (busy) return
    setBusy(true); setError(undefined)
    try { const result = await action({ id: item.id, action: kind, ...(text ? { answer: text } : {}) }); setUrl(result.authorizationUrl) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send response.") }
    finally { setBusy(false) }
  }
  return <article><strong>{item.kind === "package" ? `Connect ${item.provider}` : "Question from your mission owner"}</strong><p>{item.question}</p>
    {item.status === "resolved" ? <p className="inbox-resolved">✓ {item.answer}</p> : item.kind === "package" ? <div className="inbox-actions">{url ? <a href={url} target="_blank" rel="noopener noreferrer">Continue sign-in ↗</a> : <Button type="button" disabled={busy} onClick={() => void submit("connect")}>{busy ? "Connecting…" : "Connect"}</Button>}<Button type="button" disabled={busy} onClick={() => void submit("answer", "Package request declined by the user. Continue without it or find an alternative.")}>Decline</Button></div> : <form onSubmit={event => { event.preventDefault(); void submit("answer", answer) }}>
      {!!item.options.length && <div className="inbox-options">{item.options.map(option => <Button type="button" key={option} disabled={busy} onClick={() => setAnswer(option)}>{option}</Button>)}</div>}
      <label>Your answer<Textarea required maxLength={4000} value={answer} onChange={event => setAnswer(event.target.value)} /></label><Button variant="primary" type="submit" disabled={busy || !answer.trim()}>{busy ? "Sending…" : "Send answer"}</Button>
    </form>}{error && <p role="alert">{error}</p>}</article>
}

function IssueItem({ issue, run }: { issue: InboxIssue; run: () => Promise<{ authorizationUrl?: string } | void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [url, setUrl] = useState<string>()
  return <article className="inbox-issue"><strong>{issue.title}</strong><p>{issue.message}</p>{url ? <a href={url} target="_blank" rel="noopener noreferrer">Continue sign-in ↗</a> : <Button disabled={busy} onClick={async () => {
    setBusy(true); setError(undefined)
    try { const result = await run(); setUrl(result?.authorizationUrl) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete this action.") }
    finally { setBusy(false) }
  }}>{busy ? "Working…" : issue.action === "connect" ? "Reconnect" : issue.action === "budget" ? "Add budget" : "Retry"}</Button>}{error && <p role="alert">{error}</p>}</article>
}
