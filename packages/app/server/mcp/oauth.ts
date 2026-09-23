import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js"

export interface SavedOAuth {
  client?: OAuthClientInformationMixed | undefined
  token?: OAuthTokens | undefined
  discovery?: OAuthDiscoveryState | undefined
}

// Each provider belongs to one town connection; secrets never enter snapshots.
export class McpOAuth implements OAuthClientProvider {
  private client: OAuthClientInformationMixed | undefined
  private token: OAuthTokens | undefined
  private verifier = ""
  private discovery: OAuthDiscoveryState | undefined
  pending: { state: string; expires: number; url?: string } | undefined
  constructor(readonly redirectUrl: string, clientId?: string, private readonly persist: () => Promise<void> = async () => {}) { if (clientId) this.client = { client_id: clientId } }
  exportCredentials(): SavedOAuth { return { client: this.client, token: this.token, discovery: this.discovery } }
  restoreCredentials(saved: SavedOAuth) { this.client = saved.client; this.token = saved.token; this.discovery = saved.discovery }
  get clientMetadata(): OAuthClientMetadata { return { client_name: "Tardie Town", redirect_uris: [this.redirectUrl], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" } }
  state() { this.pending = { state: crypto.randomUUID(), expires: Date.now() + 600000 }; return this.pending.state }
  clientInformation() { return this.client }
  async saveClientInformation(value: OAuthClientInformationMixed) { this.client = value; await this.persist() }
  tokens() { return this.token }
  async saveTokens(value: OAuthTokens) { this.token = value; await this.persist() }
  redirectToAuthorization(url: URL) { if (!this.pending) throw Error("Missing authorization state"); this.pending.url = url.href }
  saveCodeVerifier(value: string) { this.verifier = value }
  codeVerifier() { return this.verifier }
  async saveDiscoveryState(value: OAuthDiscoveryState) { this.discovery = value; await this.persist() }
  discoveryState() { return this.discovery }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "tokens") this.token = undefined
    if (scope === "all" || scope === "client") this.client = undefined
    if (scope === "all" || scope === "verifier") this.verifier = ""
    if (scope === "all" || scope === "discovery") this.discovery = undefined
    await this.persist()
  }
}
