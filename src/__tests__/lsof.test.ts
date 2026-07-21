import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}))

describe("lsof", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    delete process.env.OPENCODE_SERVER_URL
  })

  it("returns null when no server is listening", async () => {
    const { execSync } = await import("node:child_process")
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("no process")
    })

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()
    const url = resolveServerUrl()

    expect(url).toBeNull()
  })

  it("uses OPENCODE_SERVER_URL when available", async () => {
    process.env.OPENCODE_SERVER_URL = "http://localhost:5678"

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()
    const url = resolveServerUrl()

    expect(url).toBe("http://localhost:5678")
  })

  it("converts wildcard hostname to localhost", async () => {
    process.env.OPENCODE_SERVER_URL = "http://0.0.0.0:4096"

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()
    const url = resolveServerUrl()

    expect(url).toBe("http://localhost:4096")
  })

  it("caches the result from OPENCODE_SERVER_URL", async () => {
    process.env.OPENCODE_SERVER_URL = "http://localhost:4096"

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()
    expect(resolveServerUrl()).toBe("http://localhost:4096")

    delete process.env.OPENCODE_SERVER_URL
    clearServerUrlCache()

    const { execSync } = await import("node:child_process")
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("no process")
    })

    expect(resolveServerUrl()).toBeNull()
  })

  it("clears cache on demand", async () => {
    process.env.OPENCODE_SERVER_URL = "http://localhost:4096"

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()
    expect(resolveServerUrl()).toBe("http://localhost:4096")

    clearServerUrlCache()
    delete process.env.OPENCODE_SERVER_URL

    const { execSync } = await import("node:child_process")
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("no process")
    })

    expect(resolveServerUrl()).toBeNull()
  })
})
