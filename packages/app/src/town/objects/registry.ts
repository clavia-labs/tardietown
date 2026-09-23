/** The physical scene objects are the source of truth for card anchors and pointer targets. */
export const TOWN_OBJECTS = {
  forum: { name: "messageBoard", height: 55, preference: "above-right" },
  clock: { name: "townClock", height: 64, preference: "beside" },
  packages: { name: "packageToolbox", height: 30, preference: "beside" },
  library: { name: "libraryShelf", height: 38, preference: "beside" },
  workspace: { name: "artifactTable", height: 34, preference: "beside" }
} as const

export const INTERACTIVE_OBJECT_NAMES = new Set<string>(Object.values(TOWN_OBJECTS).map(({ name }) => name))
