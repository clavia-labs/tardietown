import { Input, Button, IconButton, Modal, ModalTitle, ModalActions } from "./ui/controls"
import { SelectField } from "./ui/SelectField"
import { useEffect, useState } from "react"
import { Settings, X } from "lucide-react"
interface SettingsValue { provider: string; model: string; configured: boolean }
export async function readModelSettings(): Promise<SettingsValue> {
  const response = await fetch("/api/settings")
  if (!response.ok) throw Error("Could not load settings.")
  return response.json()
}
export function ModelSettings({ initialOpen = false, onSaved }: { initialOpen?: boolean; onSaved?: (() => void) | undefined }) {
  const [open, setOpen] = useState(initialOpen)
  const [provider, setProvider] = useState("openrouter")
  const [model, setModel] = useState("")
  const [key, setKey] = useState("")
  const [configuredProvider, setConfiguredProvider] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true); setError(undefined)
    void readModelSettings().then(value => { if (alive) { setProvider(value.provider); setModel(value.model); setConfiguredProvider(value.configured ? value.provider : undefined) } }, () => { if (alive) setError("Could not load provider settings.") }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open])
  const close = () => { setOpen(false); setKey("") }
  return <><IconButton label="Settings" type="button" aria-label="Settings" title="Settings" onClick={() => setOpen(true)}><Settings size={17} /></IconButton>
    <Modal open={open} onOpenChange={value => { if (!value) close() }} busy={busy} className="model-settings-dialog">
      <header><ModalTitle>Model settings</ModalTitle><IconButton label="Close settings" disabled={busy} onClick={close}><X size={18} /></IconButton></header>
      <p>Choose the provider and model for new or reopened towns. Running towns keep their current model.</p>
      <form onSubmit={async event => {
        event.preventDefault(); if (busy || loading) return
        setBusy(true); setError(undefined)
        try {
          const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model, ...(key ? { apiKey: key } : {}) }) })
          const result = await response.json()
          if (!response.ok) throw Error(result.error)
          setKey(""); onSaved?.(); close()
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings.") }
        finally { setBusy(false) }
      }}>
        <label>Provider<SelectField label="Provider" value={provider} disabled={busy || loading} onValueChange={value => { setProvider(value); setKey(""); setModel("") }} options={[{ value: "openrouter", label: "OpenRouter" }, { value: "openai", label: "OpenAI" }, { value: "anthropic", label: "Anthropic" }]} /></label>
        <label>Model ID<Input required maxLength={200} value={model} disabled={busy || loading} placeholder="Enter a model ID" onChange={event => setModel(event.target.value)} /></label>
        <label>{configuredProvider === provider ? "Replace API key (optional)" : "API key"}<Input type="password" autoComplete="off" required={configuredProvider !== provider} value={key} disabled={busy || loading} onChange={event => setKey(event.target.value)} placeholder={configuredProvider === provider ? "Key already configured" : "Provider API key"} /></label>
        <p>Keys are saved privately on the server and never sent back to the browser. Each town has its own budget.</p>
        {error && <p role="alert">{error}</p>}
        <ModalActions><Button type="button" disabled={busy} onClick={close}>Cancel</Button><Button variant="primary" type="submit" disabled={busy || loading}>{busy ? "Saving…" : "Save settings"}</Button></ModalActions>
      </form>
    </Modal></>
}
