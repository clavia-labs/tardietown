import { Button as BaseButton } from "@base-ui/react/button"
import { Input as BaseInput } from "@base-ui/react/input"
import { Dialog } from "@base-ui/react/dialog"
import type { ComponentProps, ReactNode } from "react"
import "./controls.css"

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & { className?: string; variant?: "default" | "primary" | "ghost" | "danger" }
export function Button({ className = "", variant = "default", ...props }: ButtonProps) {
  return <BaseButton {...props} className={`ui-button ${variant === "default" ? "" : `ui-${variant}`} ${className}`} />
}
export function IconButton({ label, className = "", ...props }: ButtonProps & { label: string }) {
  return <Button {...props} aria-label={label} title={label} className={`ui-icon-button ${className}`} />
}
export function Modal({ open, onOpenChange, busy = false, className = "", children }: {
  open: boolean; onOpenChange: (open: boolean) => void; busy?: boolean; className?: string; children: ReactNode
}) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className={`ui-dialog ${className}`}>{children}</Dialog.Popup></Dialog.Portal>
  </Dialog.Root>
}
export const ModalTitle = Dialog.Title

// Unstyled Base UI button for structured rows, scene controls, and cards.
export const Action = BaseButton
export function Input({ className = "", ...props }: Omit<ComponentProps<typeof BaseInput>, "className"> & { className?: string }) {
  return <BaseInput {...props} className={`ui-input ${className}`} />
}
// Base UI uses the native textarea: retain native editing and resize behavior.
export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`ui-input ${className}`} />
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="ui-dialog-actions">{children}</div>
}
