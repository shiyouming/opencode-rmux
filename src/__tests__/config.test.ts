import { describe, it, expect, vi, beforeEach } from "vitest"
import { join } from "node:path"

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}))

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
  platform: () => "linux",
}))

describe("config", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it("returns defaults when file is missing", async () => {
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT")
    })

    const { loadConfig } = await import("../config.js")
    const config = loadConfig()

    expect(config.splits).toBe(true)
    expect(config.notifications.done).toBe(true)
    expect(config.notifications.permission).toBe(true)
    expect(config.notifications.question).toBe(true)
    expect(config.notifications.error).toBe(true)
  })

  it("reads all config options from file", async () => {
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      splits: true,
      notifications: {
        done: false,
        permission: false,
        question: true,
        error: false,
      },
    }))

    const { loadConfig } = await import("../config.js")
    const config = loadConfig()

    expect(config.splits).toBe(true)
    expect(config.notifications.done).toBe(false)
    expect(config.notifications.permission).toBe(false)
    expect(config.notifications.question).toBe(true)
    expect(config.notifications.error).toBe(false)
  })

  it("reads partial notifications config", async () => {
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      splits: true,
      notifications: {
        done: false,
      },
    }))

    const { loadConfig } = await import("../config.js")
    const config = loadConfig()

    expect(config.splits).toBe(true)
    expect(config.notifications.done).toBe(false)
  })

  it("ignores invalid notifications type", async () => {
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      notifications: "invalid",
    }))

    const { loadConfig } = await import("../config.js")
    const config = loadConfig()

    expect(config.notifications.done).toBe(true)
  })

  it("handles invalid JSON gracefully", async () => {
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue("not json")

    const { loadConfig } = await import("../config.js")
    const config = loadConfig()

    expect(config.splits).toBe(true)
    expect(config.notifications.done).toBe(true)
  })

  it("sets splits from config", async () => {
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      splits: true,
    }))

    const { loadConfig } = await import("../config.js")
    const config = loadConfig()

    expect(config.splits).toBe(true)
  })

  it("uses XDG_CONFIG_HOME when set", async () => {
    const original = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = "/custom/config"

    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      splits: true,
    }))

    const { loadConfig } = await import("../config.js")
    loadConfig()

    const expectedPath = join("/custom/config", "opencode", "opencode-rmux.json")
    expect(readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8")

    process.env.XDG_CONFIG_HOME = original
  })
})
