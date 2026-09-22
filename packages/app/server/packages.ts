import type { PackageUpdate, TownPackage } from "../src/town/packages/types"

// Secrets live only in this town's backend memory. Snapshots contain status only.
export class TownPackages {
  private key: string | undefined
  private enabled = true
  constructor(apiKey?: string) { this.key = apiKey?.trim() || undefined }
  exa = () => ({ enabled: this.enabled, apiKey: this.key })
  snapshot = (): TownPackage[] => [
    { id: "exa", name: "Exa", description: "Search the web and read sources.", enabled: this.enabled, credential: this.key ? "configured" : "missing", builtIn: false },
    { id: "workspace", name: "Workspace", description: "Private research files and scratch data.", enabled: true, credential: "not_required", builtIn: true }
  ]
  update(input: PackageUpdate) {
    if (!input || input.id !== "exa" || (input.enabled !== undefined && typeof input.enabled !== "boolean") || (input.removeKey !== undefined && typeof input.removeKey !== "boolean") || (input.apiKey !== undefined && (typeof input.apiKey !== "string" || !input.apiKey.trim() || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey))) || (input.removeKey && input.apiKey !== undefined)) throw new Error("Invalid package settings.")
    if (input.enabled !== undefined) this.enabled = input.enabled
    if (input.removeKey) this.key = undefined
    if (input.apiKey !== undefined) this.key = input.apiKey.trim()
  }
}
