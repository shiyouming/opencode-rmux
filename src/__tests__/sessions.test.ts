import { describe, it, expect, vi, beforeEach } from "vitest"

const rmuxMocks = vi.hoisted(() => {
  const mockSendTextToPane = vi.fn().mockResolvedValue(undefined)
  const mockGetSession = vi.fn()
  const mockCreateAgentPane = vi.fn()
  const mockCmd = vi.fn().mockResolvedValue({ returnCode: 0, stdout: "", stderr: "" })

  const mockGetPaneMeta = vi.fn()

  function MockRMUXManager() {
    return {
      isConnected: () => true,
      getSession: mockGetSession,
      createAgentPane: mockCreateAgentPane,
      sendTextToPane: mockSendTextToPane,
      splitPane: vi.fn().mockResolvedValue({ target: "test:0.1" }),
      listSessions: vi.fn().mockResolvedValue([{ name: "test-rmux" }]),
      getSessionMetas: vi.fn().mockResolvedValue([{ name: "test-rmux", windows: 1, attached: 1, width: 179, height: 51 }]),
      getCurrentSessionName: vi.fn().mockResolvedValue("test-rmux"),
      getClient: () => null,
      captureTarget: vi.fn(),
      getPaneMeta: mockGetPaneMeta,
      closeTarget: vi.fn(async (target: string) => {
        return mockCmd("kill-pane", "-t", target)
      }),
      balanceRightPanes: vi.fn().mockResolvedValue(undefined),
      cmd: mockCmd,
    }
  }

  return { MockRMUXManager, mockSendTextToPane, mockGetSession, mockCreateAgentPane, mockCmd, mockGetPaneMeta }
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

async function createSM(mgr: any, config: any) {
  const { SessionManager } = await import("../sessions.js")
  const { PermissionState, QuestionState } = await import("../state.js")
  return new SessionManager(mgr, config, new PermissionState(), new QuestionState())
}

describe("SessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("handles session.created without parentID (not a subagent)", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

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
    rmuxMocks.mockGetSession.mockResolvedValue({
      name: "test-rmux",
      window: vi.fn().mockReturnValue({
        panes: vi.fn().mockResolvedValue([{ target: "test-rmux:0.0" }]),
      }),
    })

    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-456", parentID: "parent-123" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-rmux" }),
      "opencode attach http://localhost:4096 --session sub-456",
      "30%",
    )
  })

  it("skips subagent splits when splits disabled", async () => {
    const { resolveServerUrl } = await import("../lsof.js")
    vi.mocked(resolveServerUrl).mockResolvedValue("http://localhost:4096")

    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig({ splits: false }))

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-456", parentID: "parent-123" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).not.toHaveBeenCalled()
  })

  it("skips subagent splits when RMUX not connected", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    mgr.isConnected = () => false

    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-456", parentID: "parent-123" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).not.toHaveBeenCalled()
  })

  it("tracks permissions", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig({ splits: false }))

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
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.deleted",
      properties: { info: { id: "sub-456" } },
    })

    expect(rmuxMocks.mockCmd).not.toHaveBeenCalled()
  })

  it("handles session.status idle (not tracked)", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.status",
      properties: { sessionID: "test-123", status: { type: "idle" } },
    })

    expect(rmuxMocks.mockCmd).not.toHaveBeenCalled()
  })

  it("handles session.error", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.error",
      properties: { sessionID: "test-123" },
    })

    expect(rmuxMocks.mockCmd).not.toHaveBeenCalled()
  })

  it("tracks multiple permissions", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig({ splits: false }))

    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-1" } })
    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-2" } })
    expect(sm.hasPendingInput()).toBe(true)

    await sm.handleEvent({ type: "permission.replied", properties: { id: "perm-1" } })
    expect(sm.hasPendingInput()).toBe(true)

    await sm.handleEvent({ type: "permission.replied", properties: { id: "perm-2" } })
    expect(sm.hasPendingInput()).toBe(false)
  })

  it("does not track duplicate permissions", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig({ splits: false }))

    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-1" } })
    await sm.handleEvent({ type: "permission.asked", properties: { id: "perm-1" } })

    expect(sm.hasPendingInput()).toBe(true)
  })

  it("skips nested subagent chains (parent is itself a subagent)", async () => {
    const { resolveServerUrlWithRetry } = await import("../lsof.js")
    vi.mocked(resolveServerUrlWithRetry).mockResolvedValue("http://localhost:4096")

    const mockPane = { sendText: vi.fn(), close: vi.fn(), select: vi.fn(), target: "test:0.1" }
    rmuxMocks.mockCreateAgentPane.mockResolvedValue(mockPane)
    rmuxMocks.mockGetSession.mockResolvedValue({
      name: "test-rmux",
      window: vi.fn().mockReturnValue({
        panes: vi.fn().mockResolvedValue([{ target: "test-rmux:0.0" }]),
      }),
    })

    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "subagent-A", parentID: "main-session" } },
    })

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "nested-B", parentID: "subagent-A" } },
    })

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "nested-C", parentID: "nested-B" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).toHaveBeenCalledTimes(1)
    expect(rmuxMocks.mockCreateAgentPane).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-rmux" }),
      "opencode attach http://localhost:4096 --session subagent-A",
      "30%",
    )
  })

  it("cleans up dead orphaned pane before creating new subagent pane", async () => {
    const { resolveServerUrlWithRetry } = await import("../lsof.js")
    vi.mocked(resolveServerUrlWithRetry).mockResolvedValue("http://localhost:4096")

    const mockPane1 = { sendText: vi.fn(), close: vi.fn(), select: vi.fn(), target: "test:0.1" }
    const mockPane2 = { sendText: vi.fn(), close: vi.fn(), select: vi.fn(), target: "test:0.2" }
    rmuxMocks.mockCreateAgentPane.mockResolvedValueOnce(mockPane1)
    rmuxMocks.mockCreateAgentPane.mockResolvedValueOnce(mockPane2)
    rmuxMocks.mockGetSession.mockResolvedValue({
      name: "test-rmux",
      window: vi.fn().mockReturnValue({
        panes: vi.fn().mockResolvedValue([{ target: "test-rmux:0.0" }]),
      }),
    })

    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "subagent-A", parentID: "main-session" } },
    })

    rmuxMocks.mockGetPaneMeta.mockResolvedValue({
      dead: true, sessionName: "test-rmux", windowIndex: 0, paneIndex: 1,
      paneId: "%45", active: false, width: 50, height: 20,
      paneLeft: 120, paneTop: 0, deadStatus: 0, pid: null,
      title: "", currentCommand: "",
    })

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "subagent-B", parentID: "main-session" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).toHaveBeenCalledTimes(2)
    expect(rmuxMocks.mockCmd).toHaveBeenCalledWith("kill-pane", "-t", "test:0.1")
  })

  it("handles getPaneMeta error during orphaned pane cleanup gracefully", async () => {
    const { resolveServerUrlWithRetry } = await import("../lsof.js")
    vi.mocked(resolveServerUrlWithRetry).mockResolvedValue("http://localhost:4096")

    const mockPane1 = { sendText: vi.fn(), close: vi.fn(), select: vi.fn(), target: "test:0.1" }
    const mockPane2 = { sendText: vi.fn(), close: vi.fn(), select: vi.fn(), target: "test:0.2" }
    rmuxMocks.mockCreateAgentPane.mockResolvedValueOnce(mockPane1)
    rmuxMocks.mockCreateAgentPane.mockResolvedValueOnce(mockPane2)
    rmuxMocks.mockGetSession.mockResolvedValue({
      name: "test-rmux",
      window: vi.fn().mockReturnValue({
        panes: vi.fn().mockResolvedValue([{ target: "test-rmux:0.0" }]),
      }),
    })

    const mgr = new rmuxMocks.MockRMUXManager()
    const sm = await createSM(mgr, testConfig())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "subagent-A", parentID: "main-session" } },
    })

    rmuxMocks.mockGetPaneMeta.mockRejectedValue(new Error("pane not found"))

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "subagent-B", parentID: "main-session" } },
    })

    expect(rmuxMocks.mockCreateAgentPane).toHaveBeenCalledTimes(2)
    expect(rmuxMocks.mockCmd).not.toHaveBeenCalledWith("kill-pane", "-t", "test:0.1")
  })
})
