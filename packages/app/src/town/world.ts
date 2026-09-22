export const DEFAULT_AGENT_COUNT = 6
export const DEFAULT_MAX_AGENTS = 1000
export const DEFAULT_MESSAGES_PER_AGENT = 3
export const DEFAULT_POST_WORDS = 45
export const DEFAULT_BUBBLE_CHARACTERS = 110

export interface Resident {
  readonly id: string
  readonly name: string
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

const descriptors = [
  "Hungry", "Curious", "Handy", "Dreamy", "Mossy", "Fussy", "Wandering", "Chatty",
  "Sleepy", "Sunny", "Clever", "Lucky", "Jolly", "Quiet", "Brave", "Cozy",
  "Dizzy", "Bouncy", "Snappy", "Rusty", "Dusty", "Merry", "Nimble", "Gentle",
  "Cheeky", "Mellow", "Peppy", "Witty", "Dapper", "Breezy", "Scrappy", "Sparky"
]
const names = [
  "Jack", "Cleo", "Otto", "Pip", "Mae", "Dot", "Fern", "Fig",
  "Moss", "Basil", "Jude", "Nell", "Kit", "Bea", "Finn", "Ada",
  "Theo", "Ivy", "Max", "Rose", "Leo", "Wren", "Sam", "June",
  "Lou", "Rory", "Milo", "Tess", "Gus", "Olive", "Ruby", "Jasper"
]
const colors = ["#eda660", "#8dac75", "#ba9ed1", "#77abc2", "#d77f78", "#d4b955", "#75bba6", "#c997b6"]

export function makeResidents(
  count: number,
  maxAgents = DEFAULT_MAX_AGENTS
): Resident[] {
  if (!Number.isSafeInteger(maxAgents) || maxAgents < 1)
    throw new Error("Agent limit must be a positive integer.")
  if (!Number.isSafeInteger(count) || count < 1 || count > maxAgents)
    throw new Error(`Choose between 1 and ${maxAgents} agents.`)
  const shuffledNames = descriptors.flatMap(descriptor => names.map(name => `${descriptor} ${name}`))
  for (let i = shuffledNames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledNames[i], shuffledNames[j]] = [shuffledNames[j]!, shuffledNames[i]!]
  }
  return Array.from({ length: count }, (_, index) => {
    const suffix = Math.floor(index / shuffledNames.length)
    return {
      id: `resident-${index}`,
      name: `${shuffledNames[index % shuffledNames.length]}${suffix ? ` ${suffix + 1}` : ""}`,
      color: colors[index % colors.length]!,
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
