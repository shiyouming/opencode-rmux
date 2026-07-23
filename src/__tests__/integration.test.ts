import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const mockLineStream = {
    next: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockOutput = {
    next: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockRenderStream = {
    next: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }

  const mockPane = {
    sendText: vi.fn().mockResolvedValue(undefined),
    captureText: vi.fn().mockResolvedValue("pane text content"),
    waitForText: vi.fn().mockResolvedValue({ matched: "hello" }),
    close: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    target: "test:0.0",
    split: vi.fn().mockImplementation(function () {
      return Promise.resolve({ target: "test:0.0", sendText: vi.fn(), select: vi.fn() })
    }),
  }

  const mockWindow = {
    pane: vi.fn().mockReturnValue(mockPane),
    panes: vi.fn().mockResolvedValue([mockPane]),
  }

  const mockSession = {
    name: "rmux-session",
    newWindow: vi.fn().mockResolvedValue(mockWindow),
    pane: vi.fn().mockReturnValue(mockPane),
    window: vi.fn().mockReturnValue(mockWindow),
  }

  const mockClient = {
    listSessions: vi.fn().mockResolvedValue([{ session_name: "s1" }, { session_name: "s2" }]),
    session: vi.fn().mockReturnValue(mockSession),
    ensureSession: vi.fn().mockResolvedValue(mockSession),
    sendKeys: vi.fn().mockResolvedValue({ returnCode: 0, stdout: "", stderr: "" }),
    sendText: vi.fn().mockResolvedValue({ returnCode: 0, stdout: "", stderr: "" }),
    capturePane: vi.fn().mockResolvedValue("captured output text"),
    cmd: vi.fn().mockResolvedValue({ returnCode: 0, stdout: "ok", stderr: "" }),
  }

  function MockRMUX() {
    return mockClient
  }
  MockRMUX.builder = function () {
    return { connectOrStart: () => Promise.resolve(mockClient) }
  }

  const MockPane = vi.fn(function () { return mockPane })

  return {
    mockPane, mockWindow, mockSession, mockClient, MockRMUX, MockPane,
    mockLineStream, mockOutput, mockRenderStream,
  }
})

vi.mock("@rmux/sdk", () => ({
  RMUX: mocks.MockRMUX,
  Rmux: mocks.MockRMUX,
  Pane: mocks.MockPane,
  Session: vi.fn(),
  Window: vi.fn(),
  PaneOutputStream: { open: vi.fn().mockResolvedValue(mocks.mockOutput) },
  PaneLineStream: vi.fn(function () { return mocks.mockLineStream }),
  PaneRenderStream: { open: vi.fn().mockResolvedValue(mocks.mockRenderStream) },
}))

vi.mock("../lsof.js", () => ({
  resolveServerUrl: vi.fn(() => "http://localhost:12345"),
  resolveServerUrlWithRetry: vi.fn(() => Promise.resolve("http://localhost:12345")),
}))

vi.mock("node:http", () => ({
  request: vi.fn((_url: string, _opts: any, cb: (res: any) => void) => {
    const mockReq = { on: vi.fn(), end: vi.fn(), destroy: vi.fn() }
    setTimeout(() => cb({ statusCode: 200 }), 0)
    return mockReq
  }),
}))

describe("Integration: SessionManager + real RMUXManager", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.MockRMUX.builder = function () {
      return { connectOrStart: () => Promise.resolve(mocks.mockClient) }
    }
    const mod = await import("../lsof.js")
    vi.mocked(mod.resolveServerUrlWithRetry).mockResolvedValue("http://localhost:12345")
  })

  it("creates subagent pane on session.created with parentID", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { SessionManager } = await import("../sessions.js")
    const { PermissionState, QuestionState } = await import("../state.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const sm = new SessionManager(rmux, {
      splits: true,
      maxPanes: 4,
      notifications: { done: true, permission: true, question: true, error: true },
    }, new PermissionState(), new QuestionState())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-001", parentID: "parent-001" } },
    })

    expect(mocks.mockClient.listSessions).toHaveBeenCalled()
    expect(mocks.mockSession.window).toHaveBeenCalledWith(0)
    expect(mocks.mockPane.split).toHaveBeenCalledWith({
      direction: "h", size: "30%",
      shellCommand: "opencode attach http://localhost:12345 --session sub-001",
    })
  })

  it("skips creation when splits disabled", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { SessionManager } = await import("../sessions.js")
    const { PermissionState, QuestionState } = await import("../state.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const sm = new SessionManager(rmux, {
      splits: false,
      maxPanes: 4,
      notifications: { done: true, permission: true, question: true, error: true },
    }, new PermissionState(), new QuestionState())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-002", parentID: "parent-001" } },
    })

    expect(mocks.mockClient.listSessions).not.toHaveBeenCalled()
  })

  it("tracks permissions across multiple events", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { SessionManager } = await import("../sessions.js")
    const { PermissionState, QuestionState } = await import("../state.js")

    const rmux = new RMUXManager()
    const perms = new PermissionState()
    const questions = new QuestionState()
    const sm = new SessionManager(rmux, {
      splits: false,
      maxPanes: 4,
      notifications: { done: true, permission: true, question: true, error: true },
    }, perms, questions)

    await sm.handleEvent({ type: "permission.asked", properties: { id: "p1" } })
    await sm.handleEvent({ type: "permission.asked", properties: { id: "p2" } })
    expect(sm.hasPendingInput()).toBe(true)

    await sm.handleEvent({ type: "permission.replied", properties: { id: "p1" } })
    expect(sm.hasPendingInput()).toBe(true)

    await sm.handleEvent({ type: "permission.replied", properties: { id: "p2" } })
    expect(sm.hasPendingInput()).toBe(false)
  })

  it("closes pane on session.error", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { SessionManager } = await import("../sessions.js")
    const { PermissionState, QuestionState } = await import("../state.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const sm = new SessionManager(rmux, {
      splits: true,
      maxPanes: 4,
      notifications: { done: true, permission: true, question: true, error: true },
    }, new PermissionState(), new QuestionState())

    await sm.handleEvent({
      type: "session.created",
      properties: { info: { id: "sub-020", parentID: "parent-001" } },
    })

    await sm.handleEvent({
      type: "session.error",
      properties: { sessionID: "sub-020" },
    })

    expect(mocks.mockClient.cmd).toHaveBeenCalledWith("kill-pane", "-t", "test:0.0")
  })
})

describe("Integration: Tools + real RMUXManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.MockRMUX.builder = function () {
      return { connectOrStart: () => Promise.resolve(mocks.mockClient) }
    }
  })

  it("rmux_list_sessions returns formatted session list with metadata", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: "s1|2|1|120|40\ns2|1|0|80|24\n",
      stderr: "",
    })

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_list_sessions.execute({}, {})

    expect(result).toContain("s1")
    expect(result).toContain("2 windows")
    expect(result).toContain("120x40")
    expect(result).toContain("s2")
    expect(result).toContain("80x24")
  })

  it("rmux_create_session creates session and returns name", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_create_session.execute({ name: "my-session" }, {})

    expect(result).toContain("my-session")
    expect(mocks.mockClient.ensureSession).toHaveBeenCalledWith("my-session", { detached: true })
  })

  it("rmux_send_keys sends to single target", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_send_keys.execute({
      target: "s1:0.0", keys: "echo hello",
    }, {})

    expect(result).toContain("echo hello")
    expect(mocks.mockClient.sendText).toHaveBeenCalledWith("s1:0.0", "echo hello")
  })

  it("rmux_capture returns pane content", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_capture.execute({ target: "s1:0.0" }, {})

    expect(result).toBe("captured output text")
    expect(mocks.mockClient.capturePane).toHaveBeenCalledWith({ target: "s1:0.0" })
  })

  it("rmux_find_panes returns formatted results", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: "s1|0|0|%0|1|80|24|0||100|bash|bash\n",
      stderr: "",
    })

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_find_panes.execute({ sessionName: "s1" }, {})

    expect(result).toContain("id:%0")
    expect(result).toContain("Found 1 pane(s)")
  })

  it("rmux_find_panes returns no panes when none match", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0, stdout: "s1|0|0|%0|1|80|24|0||100|bash|bash\n", stderr: "",
    })

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_find_panes.execute({ currentCommand: "node" }, {})

    expect(result).toContain("No panes found")
  })

  it("rmux_pane_info returns formatted metadata", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: "demo|0|1|%2|0|40|25|0||9999|my pane|node",
      stderr: "",
    })

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_pane_info.execute({ target: "demo:%2" }, {})

    expect(result).toContain("Session: demo")
    expect(result).toContain("demo:0.1")
    expect(result).toContain("pane ID: %2")
    expect(result).toContain("PID: 9999")
    expect(result).toContain("Command: node")
  })

  it("rmux_observe collects lines", async () => {
    mocks.mockLineStream.next
      .mockResolvedValueOnce("line1")
      .mockResolvedValueOnce("line2")
      .mockRejectedValueOnce(new Error("stream over"))

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_observe.execute({
      target: "s1:0.0", timeout: 10, maxLines: 100,
    }, {})

    expect(result).toContain("line1")
    expect(result).toContain("line2")
  })

  it("rmux_observe_multi collects from multiple panes", async () => {
    let callCount = 0
    mocks.mockLineStream.next.mockImplementation(async () => {
      callCount++
      if (callCount <= 2) return `pane${String.fromCharCode(64 + callCount)}-line1`
      throw new Error("stream over")
    })

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_observe_multi.execute({
      panes: [
        { sessionName: "s1", target: "s1:0.0" },
        { sessionName: "s1", target: "s1:0.1" },
      ],
      timeout: 10,
      maxLinesPerPane: 50,
    }, {})

    expect(result).toContain("paneA-line1")
    expect(result).toContain("paneB-line1")
  })

  it("handles RMUX not connected gracefully for all tools", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()

    const tools = createTools(rmux)

    const listResult = await tools.rmux_list_sessions.execute({}, {})
    expect(listResult).toContain("not connected")

    const createResult = await tools.rmux_create_session.execute({ name: "x" }, {})
    expect(createResult).toContain("not connected")

    const sendResult = await tools.rmux_send_keys.execute({ target: "s:0", keys: "x" }, {})
    expect(sendResult).toContain("not connected")

    const captureResult = await tools.rmux_capture.execute({ target: "s:0" }, {})
    expect(captureResult).toContain("not connected")

    const waitResult = await tools.rmux_wait_for_text.execute({ target: "s:0", pattern: "x", timeout: 1 }, {})
    expect(waitResult).toContain("not connected")

    const findResult = await tools.rmux_find_panes.execute({ sessionName: "s1" }, {})
    expect(findResult).toContain("not connected")

    const infoResult = await tools.rmux_pane_info.execute({ target: "s:0" }, {})
    expect(infoResult).toContain("not connected")

    const observeResult = await tools.rmux_observe.execute({ target: "s:0", timeout: 1 }, {})
    expect(observeResult).toContain("not connected")

    const multiResult = await tools.rmux_observe_multi.execute({
      panes: [{ sessionName: "s", target: "s:0" }], timeout: 1,
    }, {})
    expect(multiResult).toContain("not connected")
  })
})

describe("Integration: Plugin entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.MockRMUX.builder = function () {
      return { connectOrStart: () => Promise.resolve(mocks.mockClient) }
    }
  })

  it("creates plugin with RMUX connected and exports event + tool", async () => {
    const plugin = await import("../index.js")
    const instance = await plugin.default()

    expect(instance).toHaveProperty("event")
    expect(instance).toHaveProperty("tool")
    expect(instance.tool).toHaveProperty("rmux_list_sessions")
    expect(instance.tool).toHaveProperty("rmux_create_session")
    expect(instance.tool).toHaveProperty("rmux_send_keys")
    expect(instance.tool).toHaveProperty("rmux_capture")
    expect(instance.tool).toHaveProperty("rmux_wait_for_text")
    expect(instance.tool).toHaveProperty("rmux_find_panes")
    expect(instance.tool).toHaveProperty("rmux_pane_info")
    expect(instance.tool).toHaveProperty("rmux_observe")
    expect(instance.tool).toHaveProperty("rmux_observe_multi")
  })

  it("routes events through plugin interface", async () => {
    const plugin = await import("../index.js")
    const instance = await plugin.default()

    await instance.event({ event: { type: "permission.asked", properties: { id: "p1" } } })
    await instance.event({ event: { type: "permission.replied", properties: { id: "p1" } } })
  })

  it("tools execute through plugin interface", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: "s1|1|0|80|24\n",
      stderr: "",
    })

    const plugin = await import("../index.js")
    const instance = await plugin.default()

    const result = await instance.tool.rmux_list_sessions.execute({}, {})
    expect(result).toContain("s1")
  })

  it("starts with RMUX disconnected when daemon unavailable", async () => {
    mocks.MockRMUX.builder = function () {
      return { connectOrStart: () => Promise.reject(new Error("daemon not found")) }
    }

    const plugin = await import("../index.js")
    const instance = await plugin.default()

    const result = await instance.tool.rmux_list_sessions.execute({}, {})
    expect(result).toContain("not connected")
  })
})
