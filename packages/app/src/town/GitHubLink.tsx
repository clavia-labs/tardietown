import { ExternalLink } from "lucide-react"

export function GitHubLink() {
  return <a
    className="ui-button"
    href="https://github.com/clavia-labs/tardietown"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Tardie Town on GitHub"
    title="Tardie Town on GitHub"
  >GitHub <ExternalLink size={13} aria-hidden="true" /></a>
}
