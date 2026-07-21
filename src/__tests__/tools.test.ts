import { describe, it, expect, vi, beforeEach } from "vitest"

const rmuxMocks = vi.hoisted(() => {
  const mockListSessions = vi.fn()
  const mockEnsureSession = vi.fn()
  const mockSendTextToPane = vi.fn()
  const mockSendKeys = vi.fn()
  const mockCaptureTarget = vi.fn()
  let isConnected = true

  function MockRMUXManager() {
    return {
      isConnected: () => isConnected,
      listSessions: mockListSessions,
      ensureSession: mockEnsureSession,
      sendTextToPane: mockSendTextToPane,
      sendKeys: mockSendKeys,
      captureTarget: mockCaptureTarget,
      cmd: vi.fn(),
      getClient: () => null,
    }
  }

  return {
    MockRMUXManager,
    get isConnected() { return isConnected },
    set isConnected(v) { isConnected = v },
    mockListSessions, mockEnsureSession,
    mockSendTextToPane, mockSendKeys, mockCaptureTarget,
  }
})

vi.mock("../rmux.js", () => ({
  RMUXManager: rmuxMocks.MockRMUXManager,
}))

function createMockContext() {
  return {
    sessionID: "session-1",
    messageID: "msg-1",
    agent: "test-agent",
    directory: "/test",
    worktree: "/test",
    abort: new AbortController().signal,
    metadata: vi.fn(),
    ask: vi.fn(),
  }
}

describe("tools", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rmuxMocks.isConnected = true
  })

  it("rmux_list_sessions returns session list", async () => {
    rmuxMocks.mockListSessions.mockResolvedValue([
      { name: "session-1", created: false },
      { name: "session-2", created: false },
    ])

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_list_sessions.execute({}, createMockContext())

    expect(result).toBe("- session-1\n- session-2")
  })

  it("rmux_list_sessions returns empty message when no sessions", async () => {
    rmuxMocks.mockListSessions.mockResolvedValue([])

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_list_sessions.execute({}, createMockContext())

    expect(result).toBe("No RMUX sessions found.")
  })

  it("rmux_list_sessions returns error when not connected", async () => {
    rmuxMocks.isConnected = false

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_list_sessions.execute({}, createMockContext())

    expect(result).toContain("not connected")
  })

  it("rmux_create_session creates session with name", async () => {
    const mockPane = { sendText: vi.fn() }
    rmuxMocks.mockEnsureSession.mockResolvedValue({
      pane: vi.fn().mockReturnValue(mockPane),
    })

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_create_session.execute(
      { name: "ci-session" },
      createMockContext(),
    )

    expect(result).toContain('Created RMUX session "ci-session"')
    expect(rmuxMocks.mockEnsureSession).toHaveBeenCalledWith("ci-session", true)
  })

  it("rmux_create_session creates session with command", async () => {
    const mockPane = { sendText: vi.fn() }
    rmuxMocks.mockEnsureSession.mockResolvedValue({
      pane: vi.fn().mockReturnValue(mockPane),
    })

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_create_session.execute(
      { name: "ci-session", command: "npm test" },
      createMockContext(),
    )

    expect(result).toContain("npm test")
    expect(rmuxMocks.mockSendTextToPane).toHaveBeenCalled()
  })

  it("rmux_send_keys sends keystrokes", async () => {
    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_send_keys.execute(
      { session: "test", target: "0", keys: "echo hello" },
      createMockContext(),
    )

    expect(result).toContain("Sent keys to")
    expect(rmuxMocks.mockSendKeys).toHaveBeenCalledWith("test:0", "echo hello")
  })

  it("rmux_capture captures pane content", async () => {
    rmuxMocks.mockCaptureTarget.mockResolvedValue("hello world")

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_capture.execute(
      { session: "test", target: "0" },
      createMockContext(),
    )

    expect(result).toBe("hello world")
    expect(rmuxMocks.mockCaptureTarget).toHaveBeenCalledWith("test:0")
  })

  it("rmux_capture returns empty message when pane empty", async () => {
    rmuxMocks.mockCaptureTarget.mockResolvedValue("")

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_capture.execute(
      { session: "test", target: "0" },
      createMockContext(),
    )

    expect(result).toBe("(empty pane)")
  })

  it("rmux_wait_for_text finds text pattern", async () => {
    rmuxMocks.mockCaptureTarget
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("still waiting")
      .mockResolvedValueOnce("found hello world")

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_wait_for_text.execute(
      { session: "test", target: "0", pattern: "hello", timeout: 5 },
      createMockContext(),
    )

    expect(result).toContain('Found pattern "hello"')
  })

  it("rmux_wait_for_text times out when pattern not found", async () => {
    rmuxMocks.mockCaptureTarget.mockResolvedValue("no match here")

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_wait_for_text.execute(
      { session: "test", target: "0", pattern: "missing", timeout: 1 },
      createMockContext(),
    )

    expect(result).toContain("Timeout")
  })

  it("all tools return not-connected message when RMUX unavailable", async () => {
    rmuxMocks.isConnected = false

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const ctx = createMockContext()

    const results = await Promise.all([
      tools.rmux_list_sessions.execute({}, ctx),
      tools.rmux_create_session.execute({ name: "test" }, ctx),
      tools.rmux_send_keys.execute({ session: "s", target: "0", keys: "k" }, ctx),
      tools.rmux_capture.execute({ session: "s", target: "0" }, ctx),
      tools.rmux_wait_for_text.execute({ session: "s", target: "0", pattern: "p" }, ctx),
    ])

    for (const result of results) {
      expect(result).toContain("not connected")
    }
  })
})
