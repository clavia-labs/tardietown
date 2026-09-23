import type { Mission } from "./missions/store"
export function MissionFlairs({ status, child = false }: { status: Mission["status"]; child?: boolean }) {
  return <div className="forum-mission-flairs"><span className="forum-mission-kind">{child ? "Child mission" : "Town mission"}</span><span className={`forum-mission-status forum-mission-status-${status}`}>{status.replaceAll("_", " ")}</span></div>
}
