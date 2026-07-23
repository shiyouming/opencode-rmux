import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
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
    capturePane: vi.fn().mockResolvedValue("captured output text"),
    cmd: vi.fn().mockResolvedValue({ returnCode: 0, stdout: "ok", stderr: "" }),
  }

  function MockRMUX() {
    return mockClient
  }
  MockRMUX.builder = function () {
    return { connectOrStart: () => Promise.resolve(mockClient) }
  }

  return { mockPane, mockWindow, mockSession, mockClient, MockRMUX }
})

vi.mock("@rmux/sdk", () => ({ RMUX: mocks.MockRMUX }))

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

  it("skips creation when resolveServerUrl returns null", async () => {
    const { resolveServerUrlWithRetry } = await import("../lsof.js")
    vi.mocked(resolveServerUrlWithRetry).mockResolvedValue(null)

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
      properties: { info: { id: "sub-003", parentID: "parent-001" } },
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

  it("serializes multiple session.created events through queue", async () => {
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

    await Promise.all([
      sm.handleEvent({
        type: "session.created",
        properties: { info: { id: "sub-030", parentID: "parent-001" } },
      }),
      sm.handleEvent({
        type: "session.created",
        properties: { info: { id: "sub-031", parentID: "parent-001" } },
      }),
    ])

    expect(mocks.mockClient.listSessions).toHaveBeenCalled()
    expect(mocks.mockPane.split).toHaveBeenCalled()
  })
})

describe("Integration: Tools + real RMUXManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.MockRMUX.builder = function () {
      return { connectOrStart: () => Promise.resolve(mocks.mockClient) }
    }
  })

  it("rmux_list_sessions returns formatted session list", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_list_sessions.execute({}, {})

    expect(result).toContain("s1")
    expect(result).toContain("s2")
    expect(mocks.mockClient.listSessions).toHaveBeenCalledTimes(1)
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

  it("rmux_create_session with command sends keys", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_create_session.execute({
      name: "cmd-session",
      command: "npm run dev",
    }, {})

    expect(result).toContain("npm run dev")
    expect(mocks.mockSession.window).toHaveBeenCalledWith(0)
  })

  it("rmux_send_keys sends to session:target", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_send_keys.execute({
      session: "s1", target: "0.0", keys: "echo hello",
    }, {})

    expect(result).toContain("echo hello")
    expect(mocks.mockClient.sendKeys).toHaveBeenCalledWith("s1:0.0", "echo hello")
  })

  it("rmux_capture returns pane content", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_capture.execute({
      session: "s1", target: "0.0",
    }, {})

    expect(result).toBe("captured output text")
    expect(mocks.mockClient.capturePane).toHaveBeenCalledWith({ target: "s1:0.0" })
  })

  it("rmux_wait_for_text finds pattern immediately", async () => {
    mocks.mockClient.capturePane.mockResolvedValue("hello world")

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_wait_for_text.execute({
      session: "s1", target: "0.0", pattern: "hello", timeout: 5,
    }, {})

    expect(result).toContain("hello")
    expect(mocks.mockClient.capturePane).toHaveBeenCalledWith({ target: "s1:0.0" })
  })

  it("rmux_wait_for_text returns timeout when pattern not found", async () => {
    mocks.mockClient.capturePane.mockResolvedValue("goodbye world")

    const { RMUXManager } = await import("../rmux.js")
    const { createTools } = await import("../tools.js")

    const rmux = new RMUXManager()
    await rmux.connect()

    const tools = createTools(rmux)
    const result = await tools.rmux_wait_for_text.execute({
      session: "s1", target: "0.0", pattern: "hello", timeout: 0.01,
    }, {})

    expect(result).toContain("Timeout")
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

    const sendResult = await tools.rmux_send_keys.execute({
      session: "s", target: "0", keys: "x",
    }, {})
    expect(sendResult).toContain("not connected")

    const captureResult = await tools.rmux_capture.execute({
      session: "s", target: "0",
    }, {})
    expect(captureResult).toContain("not connected")

    const waitResult = await tools.rmux_wait_for_text.execute({
      session: "s", target: "0", pattern: "x", timeout: 1,
    }, {})
    expect(waitResult).toContain("not connected")
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
  })

  it("routes events through plugin interface", async () => {
    const plugin = await import("../index.js")
    const instance = await plugin.default()

    await instance.event({ event: { type: "permission.asked", properties: { id: "p1" } } })
    await instance.event({ event: { type: "permission.replied", properties: { id: "p1" } } })
  })

  it("ignores unknown event types", async () => {
    const plugin = await import("../index.js")
    const instance = await plugin.default()

    await expect(
      instance.event({ event: { type: "unknown.event", properties: {} } }),
    ).resolves.toBeUndefined()
  })

  it("tools execute through plugin interface", async () => {
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
