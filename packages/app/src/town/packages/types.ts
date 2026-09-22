export interface TownPackage { id: "exa" | "workspace"; name: string; description: string; enabled: boolean; credential: "configured" | "missing" | "not_required"; builtIn: boolean }
export interface PackageUpdate { id: "exa"; enabled?: boolean; apiKey?: string; removeKey?: boolean }
