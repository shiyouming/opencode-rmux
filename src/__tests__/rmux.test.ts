import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const mockPane = {
    sendText: vi.fn().mockResolvedValue(undefined),
    sendKeys: vi.fn().mockResolvedValue(undefined),
    captureText: vi.fn().mockResolvedValue("pane content"),
    capture: vi.fn().mockResolvedValue("pane content"),
    waitForText: vi.fn().mockResolvedValue({ matched: "hello" }),
    close: vi.fn().mockResolvedValue(undefined),
    split: vi.fn().mockResolvedValue({ target: "test:0.0" }),
    split_with: vi.fn().mockResolvedValue({ target: "test:0.0" }),
    select: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn().mockResolvedValue({}),
    target: "test:0.0",
  }

  const mockWindow = {
    pane: vi.fn().mockReturnValue(mockPane),
    panes: vi.fn().mockResolvedValue([mockPane]),
    target: "test:0",
  }

  const mockSession = {
    name: "test-session",
    target: "test-session",
    pane: vi.fn().mockReturnValue(mockPane),
    windows: vi.fn().mockResolvedValue([mockWindow]),
    window: vi.fn().mockReturnValue(mockWindow),
    newWindow: vi.fn().mockResolvedValue(mockWindow),
    kill: vi.fn().mockResolvedValue(undefined),
  }

  const mockClient = {
    listSessions: vi.fn().mockResolvedValue([{ session_name: "session-1" }]),
    session: vi.fn().mockReturnValue(mockSession),
    ensureSession: vi.fn().mockResolvedValue(mockSession),
    sendKeys: vi.fn().mockResolvedValue({ returnCode: 0, stdout: "", stderr: "" }),
    capturePane: vi.fn().mockResolvedValue("captured content"),
    cmd: vi.fn().mockResolvedValue({ returnCode: 0, stdout: "output", stderr: "" }),
  }

  const MockRMUX = function () {
    return mockClient
  }
  MockRMUX.builder = function () {
    return { connectOrStart: () => Promise.resolve(mockClient) }
  }

  return { MockRMUX, mockClient, mockPane, mockSession }
})

vi.mock("@rmux/sdk", () => ({
  RMUX: mocks.MockRMUX,
  Rmux: mocks.MockRMUX,
  Pane: vi.fn(),
  Session: vi.fn(),
  Window: vi.fn(),
}))

describe("RMUXManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.MockRMUX.builder = function () {
      return { connectOrStart: () => Promise.resolve(mocks.mockClient) }
    }
  })

  it("connects to RMUX daemon", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    const result = await mgr.connect()

    expect(result).toBe(true)
    expect(mgr.isConnected()).toBe(true)
  })

  it("handles connection failure gracefully", async () => {
    mocks.MockRMUX.builder = function () {
      return { connectOrStart: () => Promise.reject(new Error("daemon not found")) }
    }

    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    const result = await mgr.connect()

    expect(result).toBe(false)
    expect(mgr.isConnected()).toBe(false)
  })

  it("lists sessions", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const sessions = await mgr.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].name).toBe("session-1")
  })

  it("lists sessions after connection failure returns error", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()

    await expect(mgr.listSessions()).rejects.toThrow("RMUX not connected")
  })

  it("ensures a session", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const session = await mgr.ensureSession("test-session")
    expect(session).not.toBeNull()
    expect(mocks.mockClient.ensureSession).toHaveBeenCalledWith("test-session", {
      detached: true,
    })
  })

  it("creates an agent pane (sidebar)", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const session = await mgr.ensureSession("test-session")
    const pane = await mgr.createAgentPane(session)

    expect(pane).not.toBeNull()
    expect(mocks.mockPane.split).toHaveBeenCalledWith({ direction: "h", size: "30%" })
  })

  it("captures pane text", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const session = await mgr.ensureSession("test-session")
    const pane = session.pane(0, 0)

    const content = await mgr.capturePaneText(pane)
    expect(content).toBe("pane content")
  })

  it("captures target string", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const content = await mgr.captureTarget("test-session:0")
    expect(content).toBe("captured content")
    expect(mocks.mockClient.capturePane).toHaveBeenCalledWith({
      target: "test-session:0",
    })
  })

  it("sends text to pane", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const session = await mgr.ensureSession("test-session")
    const pane = session.pane(0, 0)

    await mgr.sendTextToPane(pane, "echo hello")
    expect(mocks.mockPane.sendText).toHaveBeenCalledWith("echo hello")
  })

  it("gets a session by name", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const session = await mgr.getSession("test-session")
    expect(session).not.toBeNull()
    expect(mocks.mockClient.session).toHaveBeenCalledWith("test-session")
  })

  it("executes raw command", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const result = await mgr.cmd("list-sessions")
    expect(result.stdout).toBe("output")
    expect(result.returnCode).toBe(0)
  })
})
