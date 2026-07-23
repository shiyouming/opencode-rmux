import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const mockPaneHandle = {
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
    resize: vi.fn().mockResolvedValue(undefined),
  }

  const mockWindow = {
    pane: vi.fn().mockReturnValue(mockPaneHandle),
    panes: vi.fn().mockResolvedValue([mockPaneHandle]),
    target: "test:0",
  }

  const mockSession = {
    name: "test-session",
    target: "test-session",
    pane: vi.fn().mockReturnValue(mockPaneHandle),
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

  const MockPane = vi.fn(function () { return mockPaneHandle })

  return { MockRMUX, MockPane, mockClient, mockPane: mockPaneHandle, mockSession }
})

vi.mock("@rmux/sdk", () => ({
  RMUX: mocks.MockRMUX,
  Rmux: mocks.MockRMUX,
  Pane: mocks.MockPane,
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

  it("closeTarget calls kill-pane cmd", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    await mgr.closeTarget("test:0")

    expect(mocks.mockClient.cmd).toHaveBeenCalledWith("kill-pane", "-t", "test:0")
  })

  it("closeSession tries session.kill first, falls back to cmd", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    await mgr.closeSession("test-session")

    expect(mocks.mockClient.session).toHaveBeenCalledWith("test-session")
    expect(mocks.mockSession.kill).toHaveBeenCalled()
  })

  it("closeSession cmd fallback when session.kill fails", async () => {
    mocks.mockSession.kill.mockRejectedValueOnce(new Error("kill failed"))
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    await mgr.closeSession("test-session")

    expect(mocks.mockClient.cmd).toHaveBeenCalledWith("kill-session", "-t", "test-session")
  })

  it("closeSession does nothing when not connected", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()

    await mgr.closeSession("test-session")

    expect(mocks.mockSession.kill).not.toHaveBeenCalled()
  })

  it("listPaneMetas parses cmd output", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: [
        "test-session|0|0|%0|1|100|50|0||1234|bash|bash",
        "test-session|0|1|%1|0|30|50|0||5678|zsh|zsh",
      ].join("\n"),
      stderr: "",
    })
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const metas = await mgr.listPaneMetas()
    expect(metas).toHaveLength(2)
    expect(metas[0].sessionName).toBe("test-session")
    expect(metas[0].paneId).toBe("%0")
    expect(metas[0].active).toBe(true)
    expect(metas[1].paneIndex).toBe(1)
    expect(metas[1].pid).toBe(5678)
  })

  it("findPanes filters by session name", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: [
        "sess-a|0|0|%0|1|80|24|0||100|bash|bash",
        "sess-b|0|0|%1|1|80|24|0||200|zsh|zsh",
      ].join("\n"),
      stderr: "",
    })
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const found = await mgr.findPanes({ sessionName: "sess-a" })
    expect(found).toHaveLength(1)
    expect(found[0].paneId).toBe("%0")
  })

  it("getPaneMeta parses display-message output", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: "demo|0|1|%2|0|40|25|0||9999|node|node",
      stderr: "",
    })
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const meta = await mgr.getPaneMeta("demo:%2")
    expect(meta.sessionName).toBe("demo")
    expect(meta.paneId).toBe("%2")
    expect(meta.pid).toBe(9999)
    expect(meta.currentCommand).toBe("node")
  })

  it("paneFromTarget returns a Pane or null when not connected", async () => {
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const pane = mgr.paneFromTarget("test:%0")
    expect(pane).not.toBeNull()

    const mgr2 = new RMUXManager()
    const pane2 = mgr2.paneFromTarget("test:%0")
    expect(pane2).toBeNull()
  })

  it("getSessionMetas parses list-sessions output", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0,
      stdout: [
        "dev|2|1|120|40",
        "prod|1|0|80|24",
      ].join("\n"),
      stderr: "",
    })
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const metas = await mgr.getSessionMetas()
    expect(metas).toHaveLength(2)
    expect(metas[0].name).toBe("dev")
    expect(metas[0].windows).toBe(2)
    expect(metas[1].attached).toBe(0)
  })

  it("getCurrentCommand returns command or null", async () => {
    mocks.mockClient.cmd.mockResolvedValueOnce({
      returnCode: 0, stdout: "vim\n", stderr: "",
    })
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const cmd = await mgr.getCurrentCommand("test:%0")
    expect(cmd).toBe("vim")
  })

  it("getCurrentCommand returns null on error", async () => {
    mocks.mockClient.cmd.mockRejectedValueOnce(new Error("cmd failed"))
    const { RMUXManager } = await import("../rmux.js")
    const mgr = new RMUXManager()
    await mgr.connect()

    const cmd = await mgr.getCurrentCommand("test:%0")
    expect(cmd).toBeNull()
  })
})
