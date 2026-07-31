import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
    cb(new Error("no process"))
  }),
}))

vi.mock("node:os", () => ({
  platform: () => "win32",
}))

describe("lsof", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    delete process.env.OPENCODE_SERVER_URL
  })

  it("returns null when no server is listening", async () => {
    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()

    expect(await resolveServerUrl()).toBeNull()
  })

  it("uses OPENCODE_SERVER_URL when available", async () => {
    process.env.OPENCODE_SERVER_URL = "http://localhost:5678"

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()

    expect(await resolveServerUrl()).toBe("http://localhost:5678")
  })

  it("converts wildcard hostname to localhost", async () => {
    process.env.OPENCODE_SERVER_URL = "http://0.0.0.0:4096"

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()

    expect(await resolveServerUrl()).toBe("http://localhost:4096")
  })

  it("caches the result from OPENCODE_SERVER_URL", async () => {
    process.env.OPENCODE_SERVER_URL = "http://localhost:4096"

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()
    expect(await resolveServerUrl()).toBe("http://localhost:4096")

    delete process.env.OPENCODE_SERVER_URL
    clearServerUrlCache()

    expect(await resolveServerUrl()).toBeNull()
  })

  it("finds listening port from subprocess output", async () => {
    const { execFile } = await import("node:child_process")
    vi.mocked(execFile).mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: any) => {
      cb(null, `  TCP    127.0.0.1:4096    0.0.0.0:0    LISTENING       ${process.pid}\n`)
    })

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()

    expect(await resolveServerUrl()).toBe("http://localhost:4096")
  })

  it("tries netstat first, then PowerShell as fallback on Windows", async () => {
    const { execFile } = await import("node:child_process")
    vi.mocked(execFile).mockImplementation((cmd: string, _args: string[], _opts: unknown, cb: any) => {
      if (cmd === "netstat") {
        cb(null, "  TCP    127.0.0.1:9999    0.0.0.0:0    LISTENING       999\n")
      } else if (cmd === "pwsh") {
        cb(null, "4096\n")
      } else {
        cb(new Error("not found"))
      }
    })

    const { resolveServerUrl, clearServerUrlCache } = await import("../lsof.js")
    clearServerUrlCache()

    expect(await resolveServerUrl()).toBe("http://localhost:4096")

    const commands = vi.mocked(execFile).mock.calls.map(c => c[0])
    expect(commands[0]).toBe("netstat")
    expect(commands[1]).toBe("pwsh")
  })
})
