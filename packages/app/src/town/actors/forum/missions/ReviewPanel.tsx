import { useState } from "react"
import type { Mission, MissionResult } from "./store"
import type { Resident } from "../../../world"
export type ReviewMission = (missionId: string, reviewId: string, decision: "approve" | "request_changes", reason: string, operationId: string) => Promise<MissionResult>

export function ReviewPanel({ mission, residents, onReview }: { mission: Mission; residents: readonly Resident[]; onReview?: ReviewMission | undefined }) {
  const [reason, setReason] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const votes = [...new Map((mission.reviews ?? []).filter(vote => vote.reviewId === mission.reviewId).map(vote => [vote.reviewer, vote])).values()]
  const submit = async (decision: "approve" | "request_changes") => {
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
  return <section className="mission-review" aria-label="Mission review">
    <p>{votes.filter(vote => vote.decision === "approve").length} / {mission.approvalsRequired} approvals{mission.humanReviewRequired ? " · Your review needed" : ""}</p>
    {votes.map(vote => <p key={vote.reviewer}><strong>{vote.reviewer === "user" ? "You" : residents.find(resident => resident.id === vote.reviewer)?.name ?? vote.reviewer}</strong> · {vote.decision === "approve" ? "Approved" : "Changes requested"}<br />{vote.reason}</p>)}
    {mission.status === "in_review" && mission.humanReviewRequired && onReview && <div className="mission-review-controls">
      <label>Read the submitted artifact, then explain your review<textarea aria-label="Review reason" value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div><button type="button" disabled={sending || !reason.trim()} onClick={() => void submit("approve")}>Approve</button><button type="button" disabled={sending || !reason.trim()} onClick={() => void submit("request_changes")}>Request changes</button></div>
      {error && <p role="alert">{error}</p>}
    </div>}
    {(mission.reviews?.length ?? 0) > votes.length && <details><summary>Review history</summary>{mission.reviews.map((vote, index) => <p key={index}>{residents.find(resident => resident.id === vote.reviewer)?.name ?? vote.reviewer} · {vote.decision.replace("_", " ")} · {vote.artifactPath} v{vote.artifactRevision}<br />{vote.reason}</p>)}</details>}
  </section>
}
