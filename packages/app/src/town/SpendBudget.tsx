import { useTownPanel } from "./state/TownUiProvider"
import { Input, Button, IconButton, Modal, ModalTitle, ModalActions } from "./ui/controls"
import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { validBudget, type SpendState } from "./budget"
const dollars = (value: number) => `$${value.toFixed(3)}`
export function SpendBudget({ spend, onAdd }: { spend?: SpendState | undefined; onAdd?: ((amount: number, operationId: string) => Promise<void>) | undefined }) {
  const [open, setOpen] = useTownPanel("budget")
  const [amount, setAmount] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const operation = useRef<string | undefined>(undefined)
  return <div className="town-budget" aria-label="Model spending budget">
    <div className="town-budget-summary">
      <div className="town-budget-balance"><strong>{spend && !spend.unavailable ? `${spend.estimated ? "≈ " : ""}${dollars(spend.remainingUsd)}` : "—"}</strong><span>{spend?.unavailable ? "Cost unavailable" : "left"}</span></div>
      {spend && <small title={spend.reservedUsd > 0 ? "Model calls in progress; spend updates when each turn finishes" : "Model spending"}>{dollars(spend.spentUsd)} / ${spend.limitUsd.toFixed(2)} spent</small>}
    </div>
    {spend && onAdd && <IconButton label="Add budget" type="button" onClick={() => setOpen(value => !value)} aria-label="Add budget" title="Add budget" aria-expanded={open}><Plus size={18} strokeWidth={1.75} aria-hidden="true" /></IconButton>}
    {onAdd && <Modal open={open} onOpenChange={setOpen} busy={saving}>
      <ModalTitle>Add model budget</ModalTitle>
      <p className="budget-dialog-balance">{spend ? `${dollars(spend.remainingUsd)} remaining · $${spend.limitUsd.toFixed(2)} total budget` : "Increase this town’s model budget."}</p>
      <form onSubmit={async event => {
      event.preventDefault()
      if (saving || !validBudget(amount)) return
      setSaving(true); setError(undefined)
      operation.current ??= crypto.randomUUID()
      try { await onAdd(amount, operation.current); operation.current = undefined; setOpen(false) }
      catch (cause) { setError(String(cause)) }
      finally { setSaving(false) }
    }}>
      <label>Amount (USD)<Input autoFocus type="number" min="0.01" max="100" step="0.01" value={amount} disabled={saving} required onChange={event => { setAmount(Number(event.target.value)); operation.current = undefined }} /></label>
      <p>Model calls only. Calls in progress can exceed the limit. Adding funds does not resume a paused town.</p>
      {error && <p role="alert">{error}</p>}
      <ModalActions><Button type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={saving || !validBudget(amount)} type="submit">{saving ? "Adding…" : "Add budget"}</Button>
    </ModalActions></form></Modal>}
  </div>
}
