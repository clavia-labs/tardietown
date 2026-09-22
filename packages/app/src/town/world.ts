export const DEFAULT_AGENT_COUNT = 6
export const DEFAULT_MAX_AGENTS = 1000
export const DEFAULT_MESSAGES_PER_AGENT = 3
export const DEFAULT_POST_WORDS = 45
export const DEFAULT_BUBBLE_CHARACTERS = 110

export interface Resident {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly color: string
  readonly index: number
}

export interface Post {
  readonly id: string
  readonly author: string
  readonly text: string
  readonly at: number
  readonly replyTo?: string
}

export interface WorldConfig {
  readonly name: string
  readonly count: number
  readonly premise: string
  readonly messagesPerAgent: number
  readonly timeoutMs: number
  readonly postWords: number
  readonly bubbleCharacters: number
}

const identities = [
  ["Pip", "An optimistic inventor", "#eda660"],
  ["Moss", "A thoughtful gardener", "#8dac75"],
  ["Cleo", "A curious researcher", "#ba9ed1"],
  ["Otto", "A practical builder", "#77abc2"],
  ["Basil", "A very opinionated cook", "#d77f78"],
  ["Dot", "A meticulous organizer", "#d4b955"],
  ["Fern", "An adventurous explorer", "#75bba6"],
  ["Fig", "A dramatic storyteller", "#c997b6"]
] as const

export function makeResidents(
  count: number,
  maxAgents = DEFAULT_MAX_AGENTS
): Resident[] {
  if (!Number.isSafeInteger(maxAgents) || maxAgents < 1)
    throw new Error("Agent limit must be a positive integer.")
  if (!Number.isSafeInteger(count) || count < 1 || count > maxAgents)
    throw new Error(`Choose between 1 and ${maxAgents} agents.`)
  return Array.from({ length: count }, (_, index) => {
    const identity = identities[index % identities.length]!
    const suffix = Math.floor(index / identities.length)
    return {
      id: `resident-${index}`,
      name: `${identity[0]}${suffix ? ` ${suffix + 1}` : ""}`,
      role: identity[1],
      color: identity[2],
      index
    }
  })
}

export function bubblePreview(
  text: string,
  characters = DEFAULT_BUBBLE_CHARACTERS
): string {
  return text.length <= characters
    ? text
    : `${text.slice(0, characters).trimEnd()}…`
}
