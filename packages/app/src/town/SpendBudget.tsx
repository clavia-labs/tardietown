import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { validBudget, type SpendState } from "./budget"
const dollars = (value: number) => `$${value.toFixed(3)}`
export function SpendBudget({ spend, onAdd }: { spend?: SpendState | undefined; onAdd?: ((amount: number, operationId: string) => Promise<void>) | undefined }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const operation = useRef<string | undefined>(undefined)
  return <div className="town-budget" aria-label="Model spending budget">
    <span>{spend?.unavailable ? "Cost unavailable · paused" : "Model budget remaining"}</span>
    <div className="town-budget-balance"><strong>{spend && !spend.unavailable ? `${spend.estimated ? "≈ " : ""}${dollars(spend.remainingUsd)}` : "—"}</strong>
      {spend && onAdd && <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}><Plus size={14} aria-hidden="true" /> Add budget</button>}
    </div>
    {spend && <small>{dollars(spend.spentUsd)} spent of {dollars(spend.limitUsd)}{spend.reservedUsd > 0 ? " · calls in progress" : ""}</small>}
    {open && onAdd && <form className="town-budget-form" onSubmit={async event => {
      event.preventDefault()
      if (saving || !validBudget(amount)) return
      setSaving(true); setError(undefined)
      operation.current ??= crypto.randomUUID()
      try { await onAdd(amount, operation.current); operation.current = undefined; setOpen(false) }
      catch (cause) { setError(String(cause)) }
      finally { setSaving(false) }
    }}>
      <label>Add USD <input autoFocus type="number" min="0.01" max="100" step="0.01" value={amount} disabled={saving} required onChange={event => { setAmount(Number(event.target.value)); operation.current = undefined }} /></label>
      <p>Model calls only. Calls in progress can exceed the limit. Adding funds does not resume a paused town.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button disabled={saving} type="submit">{saving ? "Adding…" : "Add budget"}</button>
    </form>}
  </div>
}
