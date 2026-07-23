import { describe, it, expect } from "vitest"
import { PermissionState, QuestionState } from "../state.js"

describe("PermissionState", () => {
  it("tracks a new permission", () => {
    const s = new PermissionState()
    expect(s.track("perm-1")).toBe(true)
    expect(s.isPending("perm-1")).toBe(true)
    expect(s.pendingCount).toBe(1)
  })

  it("rejects duplicate tracking", () => {
    const s = new PermissionState()
    s.track("perm-1")
    expect(s.track("perm-1")).toBe(false)
    expect(s.pendingCount).toBe(1)
  })

  it("resolves a permission", () => {
    const s = new PermissionState()
    s.track("perm-1")
    s.resolve("perm-1")
    expect(s.isPending("perm-1")).toBe(false)
    expect(s.pendingCount).toBe(0)
  })

  it("clears all permissions", () => {
    const s = new PermissionState()
    s.track("perm-1")
    s.track("perm-2")
    s.clear()
    expect(s.pendingCount).toBe(0)
  })

  it("isPending returns false for unknown id", () => {
    const s = new PermissionState()
    expect(s.isPending("nonexistent")).toBe(false)
  })

  it("resolve unknown id does nothing", () => {
    const s = new PermissionState()
    s.resolve("unknown")
    expect(s.pendingCount).toBe(0)
  })
})

describe("QuestionState", () => {
  it("tracks a new question", () => {
    const s = new QuestionState()
    expect(s.track("q-1")).toBe(true)
    expect(s.isPending("q-1")).toBe(true)
    expect(s.pendingCount).toBe(1)
  })

  it("rejects duplicate tracking", () => {
    const s = new QuestionState()
    s.track("q-1")
    expect(s.track("q-1")).toBe(false)
    expect(s.pendingCount).toBe(1)
  })

  it("resolves a question", () => {
    const s = new QuestionState()
    s.track("q-1")
    s.resolve("q-1")
    expect(s.isPending("q-1")).toBe(false)
    expect(s.pendingCount).toBe(0)
  })

  it("tracks separate ids", () => {
    const s = new QuestionState()
    s.track("q-1")
    s.track("q-2")
    expect(s.pendingCount).toBe(2)
    s.resolve("q-1")
    expect(s.pendingCount).toBe(1)
    expect(s.isPending("q-2")).toBe(true)
  })
})
