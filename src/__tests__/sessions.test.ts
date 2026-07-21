import { describe, it, expect, vi, beforeEach } from "vitest"

const rmuxMocks = vi.hoisted(() => {
  const mockSendTextToPane = vi.fn().mockResolvedValue(undefined)
  const mockGetSession = vi.fn()
  const mockCreateAgentPane = vi.fn()
  const mockCmd = vi.fn().mockResolvedValue({ returnCode: 0, stdout: "", stderr: "" })

  function MockRMUXManager() {
    return {
      isConnected: () => true,
      getSession: mockGetSession,
      createAgentPane: mockCreateAgentPane,
      sendTextToPane: mockSendTextToPane,
      listSessions: vi.fn().mockResolvedValue([{ name: "test-rmux" }]),
      getClient: () => null,
      captureTarget: vi.fn(),
      cmd: mockCmd,
    }
  }

  return { MockRMUXManager, mockSendTextToPane, mockGetSession, mockCreateAgentPane, mockCmd }
})

vi.mock("../rmux.js", () => ({
  RMUXManager: rmuxMocks.MockRMUXManager,
}))

vi.mock("../lsof.js", () => ({
  resolveServerUrl: vi.fn(),
  resolveServerUrlWithRetry: vi.fn(),
}))

vi.mock("node:http", () => ({
  request: vi.fn((_url: string, _opts: any, cb: (res: any) => void) => {
    const mockReq = { on: vi.fn(), end: vi.fn(), destroy: vi.fn() }
    setTimeout(() => cb({ statusCode: 200 }), 0)
    return mockReq
  }),
}))

function testConfig(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    splits: true,
    splitSize: "30%",
    keepPaneOnIdle: false,
    debug: false,
    notifications: { done: true, permission: true, question: true, error: true },
    ...overrides,
  }
}

describe("SessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("handles session.created without parentID (not a subagent)", async () => {
    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "main-123" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).not.toHaveBeenCalled()
  })

  it("handles session.created with parentID (subagent)", async () => {
    const { resolveServerUrlWithRetry } = await import("../lsof.js")
    vi.mocked(resolveServerUrlWithRetry).mockResolvedValue("http://localhost:4096")

    const mockPane = { sendText: vi.fn(), close: vi.fn(), select: vi.fn(), target: "test:0" }
    rmuxMocks.mockCreateAgentPane.mockResolvedValue(mockPane)
    rmuxMocks.mockGetSession.mockResolvedValue({ name: "test-rmux" })

    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-456", parentID: "parent-123" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).toHaveBeenCalledWith(
      { name: "test-rmux" },
      "opencode attach http://localhost:4096 --session sub-456",
      "30%",
    )
  })

  it("skips subagent splits when splits disabled", async () => {
    const { resolveServerUrl } = await import("../lsof.js")
    vi.mocked(resolveServerUrl).mockReturnValue("http://localhost:4096")

    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig({ splits: false }))

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-456", parentID: "parent-123" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).not.toHaveBeenCalled()
  })

  it("tracks permissions", async () => {
    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig({ splits: false }))

    expect(sm.hasPendingInput()).toBe(false)

    await sm.handleEvent({
      type: "permission.asked",
      properties: { id: "perm-1", title: "Execute command" },
    })
    expect(sm.hasPendingInput()).toBe(true)

    await sm.handleEvent({
      type: "permission.replied",
      properties: { id: "perm-1" },
    })
    expect(sm.hasPendingInput()).toBe(false)
  })

  it("handles session.deleted", async () => {
    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig())

    await sm.handleEvent({
      type: "session.deleted",
      properties: { info: { id: "sub-456" } },
    })

    expect(rmuxMocks.mockCmd).not.toHaveBeenCalled()
  })

  it("handles session.status idle (not tracked)", async () => {
    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig())

    await sm.handleEvent({
      type: "session.status",
      properties: { sessionID: "test-123", status: { type: "idle" } },
    })

    expect(rmuxMocks.mockCmd).not.toHaveBeenCalled()
  })

  it("handles session.error", async () => {
    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig())

    await sm.handleEvent({
      type: "session.error",
      properties: { sessionID: "test-123" },
    })

    expect(rmuxMocks.mockCmd).not.toHaveBeenCalled()
  })

  it("tracks multiple permissions", async () => {
    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig({ splits: false }))

    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-1" } })
    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-2" } })
    expect(sm.hasPendingInput()).toBe(true)

    await sm.handleEvent({ type: "permission.replied", properties: { id: "perm-1" } })
    expect(sm.hasPendingInput()).toBe(true)

    await sm.handleEvent({ type: "permission.replied", properties: { id: "perm-2" } })
    expect(sm.hasPendingInput()).toBe(false)
  })

  it("does not track duplicate permissions", async () => {
    const { SessionManager } = await import("../sessions.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = new SessionManager(mgr, testConfig({ splits: false }))

    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-1" } })
    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-1" } })

    expect(sm.hasPendingInput()).toBe(true)
  })
})
