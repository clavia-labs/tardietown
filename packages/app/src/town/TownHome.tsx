import { Action, Button, IconButton, Modal, ModalTitle, ModalActions } from "./ui/controls"
import { toast } from "sonner"
import { ModelSettings } from "./ModelSettings"
import { DemoTownScene } from "./scene/DemoTownScene"
import { makeResidents, DEFAULT_AGENT_COUNT } from "./world"
import { useEffect, useState } from "react"
import { ArrowRight, Plus, RotateCw, Trash2 } from "lucide-react"
import { deleteSavedTown, listSavedTowns, type SavedTown } from "./connection"

export function TownHome({ onOpen, onNew, busy, error }: { onOpen: (id: string) => void; onNew: () => void; busy: boolean; error?: string | undefined }) {
  const [residents] = useState(() => makeResidents(DEFAULT_AGENT_COUNT, DEFAULT_AGENT_COUNT))
  const [towns, setTowns] = useState<SavedTown[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [deletingTown, setDeletingTown] = useState<SavedTown>()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true); setLoadError(false)
    void listSavedTowns().then(value => { if (alive) setTowns(value) }, () => { if (alive) setLoadError(true) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refresh])
  return <main className="town-home mx-auto w-full max-w-[var(--container)] px-6 py-9 text-town-ink max-[520px]:px-3.5">
    <header className="mb-6 flex items-center justify-between gap-5 max-[700px]:flex-col max-[700px]:items-start"><div className="w-[360px] max-w-full shrink-0"><h1 className="entry-title m-0 font-[Georgia,serif] text-[clamp(28px,3.5vw,42px)] leading-[1.15] italic tracking-[-.035em] text-town-ink">Tardie Town</h1><p className="mt-2 mb-0 font-town text-sm leading-relaxed text-town-muted">Give a swarm of agents a mission. See how they work together to accomplish it.</p></div><div className="home-header-actions flex shrink-0 items-center gap-2.5"><ModelSettings /><Button variant="primary" disabled={busy} onClick={onNew}><Plus size={16} /> Start new town</Button></div></header>
    <div className="town-home-layout grid grid-cols-[minmax(260px,360px)_minmax(0,1fr)] items-start gap-7 max-[900px]:grid-cols-1 max-[900px]:gap-5"><section className="town-home-saved min-w-0 pt-4" aria-label="Your towns">
    <div className="town-home-heading flex items-center justify-between border-b border-town-hair pb-2"><h2 className="m-0 font-town text-[15px] font-medium">Your towns</h2><IconButton variant="ghost" className="panel-icon-button" type="button" label="Refresh towns" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}><RotateCw size={15} /></IconButton></div>
    {error && <p role="alert">{error}</p>}
    {loadError ? <p role="alert">Could not load saved towns. Check that the backend is running.</p> : loading ? <p role="status">Loading towns…</p> : !towns.length ? <div className="town-home-empty py-[30px] font-town text-sm leading-[1.6] text-town-muted"><p>A place for your residents to work together.</p><p>Start a town with a mission. Come back whenever you like.</p></div> : <div className="town-home-list grid max-h-[calc(100dvh-210px)] overflow-y-auto [scrollbar-width:thin] max-[900px]:max-h-60" aria-label="Saved towns">
      {towns.map(town => <div className="town-home-row-wrap flex items-stretch border-b border-town-hair" key={town.id}><Action className="town-home-row flex w-full min-w-0 flex-1 items-center gap-4 rounded-none border-0 bg-transparent px-2 py-3 text-left font-town text-town-ink hover:bg-[var(--sunken)] focus-visible:bg-[var(--sunken)]" type="button" disabled={busy} onClick={() => onOpen(town.id)}>
        <span className="town-home-copy grid min-w-0 flex-1 gap-1"><strong className="text-[15px] font-medium">{town.name}</strong><span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-town-muted">{town.premise}</span><small className="text-[11px] text-town-faint">{town.residents} residents · {town.running ? "Running" : "Paused"} · {new Date(town.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span><ArrowRight className="shrink-0 text-town-faint" size={18} aria-hidden="true" />
      </Action><IconButton variant="ghost" className="town-delete-button h-auto w-10 rounded-none border-0" label={`Delete ${town.name}`} disabled={busy || deleting || town.running} onClick={() => { setDeleteError(undefined); setDeletingTown(town) }}><Trash2 size={15} /></IconButton></div>)}
    </div>}
    {busy && <p role="status">Opening town…</p>}
    </section><section className="entry-land town-home-demo relative m-0 h-[calc(100dvh-160px)] min-h-[460px] max-[900px]:h-[520px] max-[900px]:min-h-0 max-[520px]:h-[460px]" aria-label="Interactive demo town"><DemoTownScene residents={residents} /><span className="town-home-demo-label pointer-events-none absolute top-0 left-3 font-town-mono text-[10px] text-town-faint">Demo town · Click to explore</span></section></div>
    <Modal open={!!deletingTown} onOpenChange={open => { if (!open) setDeletingTown(undefined) }} busy={deleting}>
      <ModalTitle>Delete {deletingTown?.name}?</ModalTitle>
      <p>This permanently deletes the town’s conversations, files, library, and saved connections. This cannot be undone.</p>
      {deleteError && <p role="alert">{deleteError}</p>}
      <ModalActions><Button disabled={deleting} onClick={() => setDeletingTown(undefined)}>Cancel</Button><Button variant="danger" disabled={deleting} onClick={async () => {
        if (!deletingTown || deleting) return
        setDeleting(true); setDeleteError(undefined)
        try { await deleteSavedTown(deletingTown.id); toast.success(`${deletingTown.name} deleted`); setTowns(towns => towns.filter(town => town.id !== deletingTown.id)); sessionStorage.removeItem(`terrarium-server:${deletingTown.id}`); setDeletingTown(undefined) }
        catch (error) { setDeleteError(error instanceof Error ? error.message : "Could not delete town.") }
        finally { setDeleting(false) }
      }}>{deleting ? "Deleting…" : "Delete town"}</Button></ModalActions>
    </Modal>
  </main>
}
