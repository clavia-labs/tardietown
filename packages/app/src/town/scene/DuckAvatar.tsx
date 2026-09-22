import type { DuckPalette } from "./duckModel"

export function DuckAvatar({ palette }: { palette: DuckPalette }) {
  return (
    <svg className="duck-avatar" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 12Q12 6 25 6Q42 6 44 20V34L36 39L8 34V19Z" fill={palette.shell} />
      <path d="M36 22L44 19V34L36 39Z" fill={palette.frame} opacity=".22" />
      <path d="M5 23Q5 12 17 12Q35 12 36 26V37L5 32Z" fill={palette.shell} />
      <path d="M8 24Q8 16 17 16Q31 16 32 26V32L8 29Z" fill={palette.face} stroke={palette.frame} strokeWidth="1.5" />
      <ellipse cx="20" cy="24" rx="5" ry="6" fill={palette.eye} transform="rotate(-12 20 24)" />
      <ellipse cx="20" cy="24" rx="2.7" ry="3.5" fill={palette.frame} />
      <circle cx="19" cy="22.5" r="1" fill="#fffdf5" />
      <path d="M28 26L30 26.5" stroke={palette.frame} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 33L36 38L44 34V38L36 42L5 37Z" fill={palette.jaw} />
    </svg>
  )
}
