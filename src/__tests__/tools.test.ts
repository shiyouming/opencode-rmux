import { describe, it, expect, vi, beforeEach } from "vitest"

const mockLineStream = vi.hoisted(() => ({
  next: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

const mockOutputStream = vi.hoisted(() => ({
  next: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

const mockRenderStream = vi.hoisted(() => ({
  next: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@rmux/sdk", () => ({
  PaneOutputStream: { open: vi.fn().mockResolvedValue(mockOutputStream) },
  PaneLineStream: vi.fn(function () { return mockLineStream }),
  PaneRenderStream: { open: vi.fn().mockResolvedValue(mockRenderStream) },
}))

const rmuxMocks = vi.hoisted(() => {
  const mockListSessions = vi.fn()
  const mockEnsureSession = vi.fn()
  const mockSendTextToPane = vi.fn()
  const mockSendKeys = vi.fn()
  const mockCaptureTarget = vi.fn()
  const mockPaneFromTarget = vi.fn()
  const mockGetSessionMetas = vi.fn()
  let isConnected = true

  function MockRMUXManager() {
    return {
      isConnected: () => isConnected,
      listSessions: mockListSessions,
      ensureSession: mockEnsureSession,
      sendTextToPane: mockSendTextToPane,
      sendKeys: mockSendKeys,
      captureTarget: mockCaptureTarget,
      paneFromTarget: mockPaneFromTarget,
      getSessionMetas: mockGetSessionMetas,
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
    mockPaneFromTarget, mockGetSessionMetas,
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
    mockLineStream.next.mockReset()
    rmuxMocks.isConnected = true
  })

  it("rmux_list_sessions returns session list with metadata", async () => {
    rmuxMocks.mockGetSessionMetas.mockResolvedValue([
      { name: "session-1", windows: 2, attached: 1, width: 120, height: 40 },
      { name: "session-2", windows: 1, attached: 0, width: 80, height: 24 },
    ])

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_list_sessions.execute({}, createMockContext())

    expect(result).toContain("session-1")
    expect(result).toContain("2 windows")
    expect(result).toContain("120x40")
    expect(result).toContain("session-2")
    expect(result).toContain("80x24")
  })

  it("rmux_list_sessions returns empty message when no sessions", async () => {
    rmuxMocks.mockGetSessionMetas.mockResolvedValue([])

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
    const mockWindow = { pane: vi.fn().mockReturnValue({ sendText: vi.fn() }) }
    rmuxMocks.mockEnsureSession.mockResolvedValue({
      window: vi.fn().mockReturnValue(mockWindow),
    })
    rmuxMocks.mockGetSessionMetas.mockResolvedValue([
      { name: "ci-session", windows: 1, attached: 0, width: 80, height: 24 },
    ])

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_create_session.execute(
      { name: "ci-session" },
      createMockContext(),
    )

    expect(result).toContain('Created RMUX session "ci-session"')
    expect(result).toContain("1 windows")
    expect(result).toContain("80x24")
    expect(rmuxMocks.mockEnsureSession).toHaveBeenCalledWith("ci-session", true)
  })

  it("rmux_create_session creates session with command", async () => {
    const mockPane = { sendText: vi.fn() }
    const mockWindow2 = { pane: vi.fn().mockReturnValue(mockPane) }
    rmuxMocks.mockEnsureSession.mockResolvedValue({
      window: vi.fn().mockReturnValue(mockWindow2),
    })
    rmuxMocks.mockGetSessionMetas.mockResolvedValue([
      { name: "ci-session", windows: 1, attached: 1, width: 120, height: 40 },
    ])

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_create_session.execute(
      { name: "ci-session", command: "npm test" },
      createMockContext(),
    )

    expect(result).toContain("npm test")
    expect(result).toContain("1 windows")
    expect(rmuxMocks.mockSendTextToPane).toHaveBeenCalled()
  })

  it("rmux_send_keys sends keystrokes to single target", async () => {
    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_send_keys.execute(
      { target: "test:0", keys: "echo hello" },
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
      { target: "test:0" },
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
      { target: "test:0" },
      createMockContext(),
    )

    expect(result).toBe("(empty pane)")
  })

  it("rmux_wait_for_text finds text pattern via MonitorManager", async () => {
    rmuxMocks.mockPaneFromTarget.mockReturnValue({})
    mockLineStream.next
      .mockResolvedValueOnce("some output")
      .mockResolvedValueOnce("found hello world")
      .mockResolvedValueOnce(null)

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_wait_for_text.execute(
      { target: "test:0", pattern: "hello", timeout: 5 },
      createMockContext(),
    )

    expect(result).toContain('Found pattern "hello"')
    expect(rmuxMocks.mockPaneFromTarget).toHaveBeenCalledWith("test:0")
  })

  it("rmux_wait_for_text times out when pattern not found", async () => {
    rmuxMocks.mockPaneFromTarget.mockReturnValue({})
    mockLineStream.next.mockResolvedValue("no match")

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_wait_for_text.execute(
      { target: "test:0", pattern: "missing", timeout: 0.01 },
      createMockContext(),
    )

    expect(result).toContain("Timeout")
  })

  it("rmux_find_panes returns found panes", async () => {
    const { RMUXManager } = await import("../rmux.js")
    rmuxMocks.mockPaneFromTarget.mockReturnValue(null)
    const mgr = new rmuxMocks.MockRMUXManager()
    mgr.findPanes = vi.fn().mockResolvedValue([
      { sessionName: "s1", paneId: "%0", windowIndex: 0, paneIndex: 0, currentCommand: "bash", pid: 100 },
    ])

    const { createTools } = await import("../tools.js")
    const tools = createTools(mgr)
    const result = await tools.rmux_find_panes.execute(
      { sessionName: "s1" },
      createMockContext(),
    )

    expect(result).toContain("Found 1 pane(s)")
    expect(result).toContain("id:%0")
  })

  it("rmux_find_panes returns no panes when none match", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    mgr.findPanes = vi.fn().mockResolvedValue([])

    const { createTools } = await import("../tools.js")
    const tools = createTools(mgr)
    const result = await tools.rmux_find_panes.execute(
      { currentCommand: "node" },
      createMockContext(),
    )

    expect(result).toContain("No panes found")
  })

  it("rmux_pane_info returns formatted metadata", async () => {
    const mgr = new rmuxMocks.MockRMUXManager()
    mgr.getPaneMeta = vi.fn().mockResolvedValue({
      sessionName: "demo", paneId: "%2", windowIndex: 0, paneIndex: 1,
      active: false, dead: false, deadStatus: null,
      width: 40, height: 25, pid: 9999, title: "my pane", currentCommand: "node",
    })

    const { createTools } = await import("../tools.js")
    const tools = createTools(mgr)
    const result = await tools.rmux_pane_info.execute(
      { target: "demo:%2" },
      createMockContext(),
    )

    expect(result).toContain("Session: demo")
    expect(result).toContain("demo:0.1")
    expect(result).toContain("pane ID: %2")
    expect(result).toContain("PID: 9999")
    expect(result).toContain("Command: node")
  })

  it("rmux_observe collects lines", async () => {
    rmuxMocks.mockPaneFromTarget.mockReturnValue({})
    let obsCalls = 0
    mockLineStream.next.mockImplementation(async () => {
      obsCalls++
      if (obsCalls <= 2) return `line${obsCalls}`
      throw new Error("stream over")
    })

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_observe.execute(
      { target: "test:0", timeout: 10, maxLines: 100 },
      createMockContext(),
    )

    const parsed = JSON.parse(result)
    expect(parsed.lines).toContain("line1")
    expect(parsed.lines).toContain("line2")
    expect(parsed.totalLines).toBe(2)
  })

  it("rmux_observe_multi collects from multiple panes", async () => {
    rmuxMocks.mockPaneFromTarget.mockReturnValue({})
    let multiCalls = 0
    mockLineStream.next.mockImplementation(async () => {
      multiCalls++
      if (multiCalls <= 2) return `pane${String.fromCharCode(64 + multiCalls)} line`
      throw new Error("stream over")
    })

    const { createTools } = await import("../tools.js")
    const mgr = new rmuxMocks.MockRMUXManager()
    const tools = createTools(mgr)
    const result = await tools.rmux_observe_multi.execute({
      panes: [
        { sessionName: "s1", target: "s1:0.0" },
        { sessionName: "s1", target: "s1:0.1" },
      ],
      timeout: 10,
      maxLinesPerPane: 50,
    }, createMockContext())

    const parsed = JSON.parse(result)
    expect(parsed).toHaveLength(2)
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
      tools.rmux_send_keys.execute({ target: "s:0", keys: "k" }, ctx),
      tools.rmux_capture.execute({ target: "s:0" }, ctx),
      tools.rmux_wait_for_text.execute({ target: "s:0", pattern: "p" }, ctx),
      tools.rmux_find_panes.execute({ sessionName: "s" }, ctx),
      tools.rmux_pane_info.execute({ target: "s:0" }, ctx),
      tools.rmux_observe.execute({ target: "s:0" }, ctx),
      tools.rmux_observe_multi.execute({ panes: [{ sessionName: "s", target: "s:0" }] }, ctx),
    ])

    for (const result of results) {
      expect(result).toContain("not connected")
    }
  })
})
