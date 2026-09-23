export interface TownPackage { id: "exa" | "workspace" | "fetch"; name: string; description: string; enabled: boolean; credential: "configured" | "missing" | "not_required"; builtIn: boolean; tools?: readonly { name: string; description: string; input: unknown }[] }
export interface PackageUpdate { id: "exa"; enabled?: boolean; apiKey?: string; removeKey?: boolean }
