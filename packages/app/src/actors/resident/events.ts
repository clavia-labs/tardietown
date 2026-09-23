export interface ResidentEvent { seq: number; type: string; at?: number; details: string }
export interface ResidentEventPage { events: ResidentEvent[]; cursor: number; hasMore: boolean }
export type ReadResidentEvents = (resident: string, cursor?: number) => Promise<ResidentEventPage>
