import { Action, Button, IconButton } from "../ui/controls"
import { ArrowRight, Users, X } from "lucide-react"
import { ResidentAvatar } from "./ResidentAvatar"
import type { Resident } from "../world"
export function ResidentsButton({ residents, active, onClick }: { residents: readonly Resident[]; active: boolean; onClick: () => void }) {
  return <Button type="button" aria-pressed={active} onClick={onClick}><Users size={13} aria-hidden="true" /> Residents · {residents.length}</Button>
}

export function ResidentsList({ residents, onSelect, onClose }: { residents: readonly Resident[]; onSelect: (id: string) => void; onClose: () => void }) {
  return <aside data-scene-card="residents" className="residents-list" aria-label="Residents">
    <header><h2><Users size={17} aria-hidden="true" /> Residents <span>{residents.length}</span></h2><IconButton variant="ghost" label="Close residents" onClick={onClose}><X size={18} aria-hidden="true" /></IconButton></header>
    <div className="residents-list-items">
      {residents.map(resident => <Action type="button" key={resident.id} onClick={() => onSelect(resident.id)}><ResidentAvatar index={resident.index} /><span>{resident.name}</span><ArrowRight size={15} aria-hidden="true" /></Action>)}
    </div>
  </aside>
}
