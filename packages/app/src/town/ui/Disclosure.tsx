import { Collapsible } from "@base-ui/react/collapsible"
import { Children, type ComponentProps, type ReactNode } from "react"
export function Disclosure({ children, className = "", ...props }: Omit<ComponentProps<typeof Collapsible.Root>, "className"> & { className?: string }) {
  const [heading, ...content] = Children.toArray(children)
  return <Collapsible.Root {...props} className={`ui-disclosure ${className}`}>{heading}<Collapsible.Panel>{content}</Collapsible.Panel></Collapsible.Root>
}
export function DisclosureSummary({ children, className = "", ...props }: Omit<ComponentProps<typeof Collapsible.Trigger>, "className"> & { children?: ReactNode; className?: string }) {
  return <Collapsible.Trigger {...props} className={`disclosure-trigger ${className}`}>{children}</Collapsible.Trigger>
}
