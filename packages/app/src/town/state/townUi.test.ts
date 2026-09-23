import { describe, expect, test } from "bun:test"
import { createTownUiStore } from "./townUi"

describe("town UI store", () => {
  test("towns and previews have isolated state", () => {
    const town = createTownUiStore(), preview = createTownUiStore()
    town.getState().setPanel("library", true)
    town.getState().setSelectedResident("resident-1")
    expect(preview.getState().panels.library).toBe(false)
    expect(preview.getState().selectedResident).toBeUndefined()
  })
  test("cards stay independently open and only one resident is selected", () => {
    const store = createTownUiStore()
    store.getState().setPanel("library", true)
    store.getState().setPanel("packages", true)
    store.getState().setSelectedResident("resident-1")
    store.getState().setSelectedResident("resident-2")
    expect(store.getState().panels).toMatchObject({ forum: true, library: true, packages: true })
    expect(store.getState().selectedResident).toBe("resident-2")
    store.getState().setPanel("packages", open => !open)
    expect(store.getState().panels.library).toBe(true)
    expect(store.getState().panels.packages).toBe(false)
  })
  test("artifact navigation updates target and required cards atomically", () => {
    const store = createTownUiStore()
    store.getState().setPanel("forum", false)
    let updates = 0
    const stop = store.subscribe(() => updates++)
    store.getState().openArtifact("notes.md", 3)
    expect(updates).toBe(1)
    expect(store.getState().panels).toMatchObject({ forum: true, workspace: true })
    expect(store.getState().artifactTarget).toEqual({ path: "notes.md", revision: 3 })
    store.getState().setPanel("workspace", false)
    expect(store.getState().artifactTarget).toBeUndefined()
    stop()
  })
  test("budget recovery replaces Inbox without stacked dialogs", () => {
    const store = createTownUiStore()
    store.getState().setPanel("inbox", true)
    store.getState().setPanel("budget", true)
    expect(store.getState().panels).toMatchObject({ inbox: false, budget: true })
    store.getState().setPanel("inbox", true)
    expect(store.getState().panels).toMatchObject({ inbox: true, budget: false })
  })
  test("forum expansion survives closing its card", () => {
    const store = createTownUiStore()
    store.getState().setForumExpanded(true)
    store.getState().setPanel("forum", false)
    store.getState().setPanel("forum", true)
    expect(store.getState().forumExpanded).toBe(true)
  })
})
