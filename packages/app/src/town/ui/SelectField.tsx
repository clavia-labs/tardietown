import { Select } from "@base-ui/react/select"
import { ChevronDown, Check } from "lucide-react"
export function SelectField({ value, onValueChange, options, disabled, label }: { value: string; onValueChange: (value: string) => void; options: readonly { value: string; label: string }[]; disabled?: boolean; label: string }) {
  return <Select.Root value={value} onValueChange={value => { if (value !== null) onValueChange(value) }} items={options} disabled={disabled}>
    <Select.Trigger className="ui-select" aria-label={label}><Select.Value /><Select.Icon><ChevronDown size={14} /></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Positioner side="bottom" align="start" alignItemWithTrigger={false} sideOffset={6} className="ui-select-positioner"><Select.Popup className="ui-select-popup">{options.map(option => <Select.Item key={option.value} value={option.value} className="ui-select-item"><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={13} /></Select.ItemIndicator></Select.Item>)}</Select.Popup></Select.Positioner></Select.Portal>
  </Select.Root>
}
