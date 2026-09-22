import { ArrowUp, ArrowDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import type { Mission, MissionResult } from "./store"
import type { Resident } from "../../../world"
export type ReviewMission = (missionId: string, reviewId: string, decision: "complete" | "needs_work", reason: string, operationId: string) => Promise<MissionResult>

export function ReviewPanel({ mission, residents, onReview, artifact, showComments = false }: { showComments?: boolean; artifact?: ReactNode; mission: Mission; residents: readonly Resident[]; onReview?: ReviewMission | undefined }) {
  const [reason, setReason] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const votes = [...new Map((mission.reviews ?? []).filter(vote => vote.reviewId === mission.reviewId).map(vote => [vote.reviewer, vote])).values()]
  const submit = async (decision: "complete" | "needs_work") => {
    if (!onReview || !mission.reviewId || !reason.trim() || sending) return
    setSending(true); setError(undefined)
    try {
      const result = await onReview(mission.id, mission.reviewId, decision, reason.trim(), crypto.randomUUID())
      if (!result.ok) setError(result.error)
      else setReason("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setSending(false) }
  }
  if (!mission.reviewId) return null
  return <section className="mission-review" aria-label="Mission completion votes">
    {artifact}
    <span className="mission-review-score" role="img" aria-label={`${votes.filter(vote => vote.decision === "complete").length} approvals, ${votes.filter(vote => vote.decision === "needs_work").length} needs work; ${mission.approvalsRequired} approvals required`} title={`${mission.approvalsRequired} approvals required`}>
      <ArrowUp size={14} aria-hidden="true" /><span>{votes.filter(vote => vote.decision === "complete").length}</span>
      <ArrowDown size={14} aria-hidden="true" /><span>{votes.filter(vote => vote.decision === "needs_work").length}</span>
    </span>
    {showComments && <div className="artifact-review-comments">
      {votes.length ? votes.map(vote => <div key={vote.reviewer}><strong>{vote.reviewer === "user" ? "You" : residents.find(resident => resident.id === vote.reviewer)?.name ?? vote.reviewer}</strong><span> · {vote.decision === "complete" ? "Approved" : "Needs work"}</span><p>{vote.reason}</p></div>) : <p>No reviews for this revision yet.</p>}
    </div>}
    {mission.status === "in_review" && mission.humanReviewRequired && onReview && <div className="mission-review-controls">
      <label>Has this mission been completed? Check its requirements and submitted evidence, then explain your vote.<textarea aria-label="Reason for completion vote" value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div><button type="button" disabled={sending || !reason.trim()} onClick={() => void submit("complete")}>Complete</button><button type="button" disabled={sending || !reason.trim()} onClick={() => void submit("needs_work")}>Needs work</button></div>
      {error && <p role="alert">{error}</p>}
    </div>}

  </section>
}
