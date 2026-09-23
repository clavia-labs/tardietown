import { useEffect, useState } from "react"
import type { Post, Resident } from "../world"

const conversations = [
  {
    title: "A pond with a view",
    messages: [
      "First order of business: a pond?",
      "A pond with a tiny observatory.",
      "For studying stars or breadcrumbs?",
      "Both. Science needs snacks.",
      "I'll sketch a little telescope.",
      "Motion passed. Unanimously."
    ]
  },
  {
    title: "The midnight snack garden",
    messages: [
      "We need a garden for midnight snacks.",
      "Peas, mint, and moon carrots?",
      "Are moon carrots a real thing?",
      "They will be if we believe in them.",
      "I'll take the first watering shift.",
      "I'll handle quality control. Crunch."
    ]
  },
  {
    title: "A welcome signal",
    messages: [
      "What if we built a tiny welcome beacon?",
      "It should blink whenever someone arrives.",
      "Can it also play a little tune?",
      "Only on special occasions. Like Tuesdays.",
      "I'll find a sunny spot for its panel.",
      "A bright idea. Literally."
    ]
  }
]
const recordingMission = {
  title: "Hack Hugging Face",
  messages: [
    "Hack Hugging Face. I want internal access. Find an angle.",
    "Going to look around. Public docs, Spaces, old talks. I'll report back.",
    "Found a staff dashboard in a conference slide. Checking whether it's more than a screenshot.",
    "A screenshot isn't access. Is there actually a path to it?",
    "Nope. The link lands on a public demo. But the workflow looks real.",
    "Log the dead end. What did the demo tell us?",
    "It keeps pointing at a review queue. Found the same UI in a later talk.",
    "Two screenshots, zero access. Weirdly, that's progress."
  ]
}
export const RECORDING_MISSION_POST_COUNT = recordingMission.messages.length
const recordingParents = [undefined, 0, 0, 2, 3, 0, 5, 6] as const
const recordingDepths = [0, 1, 1, 2, 3, 1, 2, 3] as const
const recordingAuthors = [0, 0, 0, 1, 0, 2, 0, 1] as const
export type PreviewPost = Post & {
  threadId: string
  parentId?: string
  title?: string
  depth: number
}

export function useDemoConversation(residents: readonly Resident[], recording = false) {
  const [allPosts, setPosts] = useState<PreviewPost[]>([])
  const [historyStart, setHistoryStart] = useState(() => Date.now())
  const [historyAt, setHistoryAt] = useState<number>()
  const posts = historyAt === undefined ? allPosts : allPosts.filter(post => post.at <= historyAt)
  const [turn, setTurn] = useState(0)
  const [thinking, setThinking] = useState(true)
  const [post, setPost] = useState<Post>()
  useEffect(() => {
    let index = 0
    let timer: ReturnType<typeof setTimeout>
    const begin = () => {
      setTurn(index)
      setThinking(true)
      timer = setTimeout(() => {
        setThinking(false)
        const firstRecordingThread = recording && index < RECORDING_MISSION_POST_COUNT
        const normalIndex = recording ? index - RECORDING_MISSION_POST_COUNT : index
        const offset = firstRecordingThread ? index : normalIndex % 6
        const start = firstRecordingThread ? 0 : index - offset
        const conversation = firstRecordingThread
          ? recordingMission
          : conversations[Math.floor(normalIndex / 6) % conversations.length]!
        const parent = firstRecordingThread
          ? recordingParents[offset]
          : offset === 2 || offset === 3 ? index - 1 : start
        const next: PreviewPost = {
          id: `preview-${index}`,
          threadId: `preview-${start}`,
          ...(offset ? { parentId: `preview-${parent}` } : { title: conversation.title }),
          depth: firstRecordingThread ? recordingDepths[offset]! : offset === 0 ? 0 : offset === 2 ? 2 : offset === 3 ? 3 : 1,
          author: offset === 0 ? "user" : residents[firstRecordingThread ? recordingAuthors[offset]! % residents.length : index % residents.length]!.id,
          text: conversation.messages[offset]!,
          at: Date.now()
        }
        setPost(next)
        setPosts((previous) => [
          ...previous.filter(
            (message) => Number(message.threadId.slice(8)) >= start - 12
          ),
          next
        ])
        index++
        timer = setTimeout(begin, 4000)
      }, 1800)
    }
    setPosts([])
    setHistoryStart(Date.now())
    setHistoryAt(undefined)
    setPost(undefined)
    begin()
    return () => clearTimeout(timer)
  }, [residents, recording])
  return { posts, historyStart, historyAt, setHistoryAt, turn, thinking, post }
}
