export function MessageTime({ at }: { at: number }) {
  const date = new Date(at)
  return <time className="forum-message-time" dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
}
