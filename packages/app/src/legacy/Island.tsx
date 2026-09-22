import { MessageSquare, TreePine } from "lucide-react"
import type { CSSProperties } from "react"
import {
  bubblePreview,
  residentPosition,
  type Post,
  type Resident
} from "../town/world"

export function ResidentAvatar({
  color,
  variant = 0
}: {
  color: string
  variant?: number
}) {
  return (
    <svg
      viewBox="0 0 64 76"
      fill="none"
      aria-hidden="true"
      className="resident-avatar"
    >
      <ellipse cx="32" cy="68" rx="22" ry="6" fill="#344d3a" opacity=".13" />
      <path
        d="M21 56v9m22-9v9"
        stroke="#47524c"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect
        x="15"
        y="36"
        width="34"
        height="24"
        rx="12"
        fill={color}
        stroke="#384d42"
        strokeWidth="1.6"
      />
      <path
        d="M14 43l-5 8m41-8 5 8"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M32 14V7" stroke="#384d42" strokeWidth="2" />
      <circle
        cx="32"
        cy="6"
        r="4"
        fill={color}
        stroke="#384d42"
        strokeWidth="1.4"
      />
      <rect
        x="9"
        y="15"
        width="46"
        height="32"
        rx={variant % 2 ? "15" : "12"}
        fill={color}
        stroke="#384d42"
        strokeWidth="1.6"
      />
      <rect x="16" y="23" width="32" height="16" rx="7" fill="#fcfbef" />
      <path
        d="M24 29v3m16-3v3"
        stroke="#384d42"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {variant % 3 === 0 ? (
        <path
          d="M29 34q3 3 6 0"
          stroke="#384d42"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      ) : null}
      <circle cx="32" cy="52" r="2" fill="#fcfbef" />
      <path
        d="M18 19h14"
        stroke="white"
        strokeOpacity=".4"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

const point = (u: number, v: number) =>
  `${500 + (u - v) * 39},${155 + (u + v) * 20}`

export function World({
  residents,
  speaking,
  post,
  selected,
  preview = false,
  bubbleCharacters,
  onResident,
  onBoard,
  onPost
}: {
  residents: readonly Resident[]
  speaking?: string | undefined
  post?: Post | undefined
  selected?: string | undefined
  preview?: boolean
  bubbleCharacters: number
  onResident?: (id: string) => void
  onBoard?: () => void
  onPost?: (id: string) => void
}) {
  return (
    <div className={`world ${preview ? "world-preview" : ""}`}>
      <svg
        className="island"
        viewBox="0 0 1000 680"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <filter
            id="ground-shadow"
            x="-40%"
            y="-60%"
            width="180%"
            height="230%"
          >
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>
        <ellipse
          cx="500"
          cy="548"
          rx="280"
          ry="42"
          fill="#58634e"
          opacity=".13"
          filter="url(#ground-shadow)"
        />
        <path d="M110 355 500 555 890 355v24L500 579 110 379Z" fill="#879a69" />
        <path d="m500 555 390-200v24L500 579Z" fill="#71865c" />
        {Array.from({ length: 100 }, (_, index) => {
          const u = Math.floor(index / 10)
          const v = index % 10
          const path = u === 4 || u === 5 || v === 4 || v === 5
          return (
            <polygon
              key={index}
              points={`${point(u, v)} ${point(u + 1, v)} ${point(u + 1, v + 1)} ${point(u, v + 1)}`}
              fill={
                path
                  ? ["#e5dfbf", "#e8e2c4", "#e2dcbc"][index % 3]
                  : ["#b3c98d", "#b8cc93", "#aec589", "#b9cd95"][index % 4]
              }
              stroke={path ? "#d9d4b3" : "#a5bd80"}
              strokeWidth=".7"
            />
          )
        })}
        <path d="M110 355 500 155 890 355" stroke="#d6e4b9" strokeWidth="3" />
        <path d="m110 355 390 200 390-200" stroke="#96ac71" strokeWidth="3" />
        {[
          [258, 315],
          [713, 368],
          [372, 419],
          [613, 253],
          [593, 469]
        ].map(([x, y], index) => (
          <g key={index} opacity=".65">
            <path
              d={`M${x} ${y}v-7m0 7-5-4m5 4 5-5`}
              stroke="#75965e"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        ))}
      </svg>
      {[
        [27, 38, 0.9],
        [71, 43, 1],
        [56, 29, 0.75]
      ].map(([x, y, scale], index) => (
        <div
          key={index}
          className="tree"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            transform: `translate(-50%, -100%) scale(${scale})`
          }}
          aria-hidden="true"
        >
          <TreePine strokeWidth={1.1} />
        </div>
      ))}
      <button
        type="button"
        className="village-board"
        style={{ left: "50%", top: "48%" }}
        onClick={onBoard}
        tabIndex={preview ? -1 : 0}
        aria-label="Open the shared messageboard"
      >
        <span className="noticeboard">
          <span className="notice notice-one" />
          <span className="notice notice-two" />
          <span className="notice notice-three" />
          <span className="pin" />
        </span>
        <span className="board-legs" />
        <span className="board-name">
          <MessageSquare size={12} /> Messageboard
        </span>
      </button>
      {residents.map((resident) => {
        const position = residentPosition(resident.index, residents.length)
        const isSpeaking = speaking === resident.id
        const hasBubble = post?.author === resident.id
        return (
          <div
            key={resident.id}
            className="resident-position"
            style={
              {
                left: `${position.x / 10}%`,
                top: `${position.y / 6.8}%`,
                zIndex: Math.round(position.y),
                "--resident-color": resident.color
              } as CSSProperties
            }
          >
            {hasBubble ? (
              <button
                type="button"
                className="speech-bubble"
                onClick={() => onPost?.(post.id)}
                title={post.text}
              >
                <span>{bubblePreview(post.text, bubbleCharacters)}</span>
                <span className="bubble-more">
                  Read on the board <span aria-hidden="true">↗</span>
                </span>
              </button>
            ) : null}
            {isSpeaking && !hasBubble ? (
              <span
                className="thinking"
                aria-label={`${resident.name} is thinking`}
              >
                <i />
                <i />
                <i />
              </span>
            ) : null}
            <button
              type="button"
              className={`resident ${selected === resident.id ? "selected" : ""} ${isSpeaking ? "speaking" : ""}`}
              onClick={() => onResident?.(resident.id)}
              tabIndex={preview ? -1 : 0}
              aria-label={`Meet ${resident.name}, ${resident.role.toLowerCase()}`}
              aria-pressed={selected === resident.id}
            >
              <ResidentAvatar color={resident.color} variant={resident.index} />
              <span className="resident-name">{resident.name}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
