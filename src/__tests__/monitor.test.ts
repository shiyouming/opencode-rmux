import { describe, it, expect, vi, beforeEach } from "vitest"

const lineStream = vi.hoisted(() => ({
  next: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

const outputStream = vi.hoisted(() => ({
  next: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

const renderStream = vi.hoisted(() => ({
  next: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@rmux/sdk", () => ({
  PaneOutputStream: { open: vi.fn().mockResolvedValue(outputStream) },
  PaneLineStream: vi.fn(function () { return lineStream }),
  PaneRenderStream: { open: vi.fn().mockResolvedValue(renderStream) },
}))

describe("MonitorManager", () => {
  let mm: any
  let MonitorManager: any

  beforeEach(async () => {
    vi.clearAllMocks()
    lineStream.next.mockReset()
    outputStream.next.mockReset()
    renderStream.next.mockReset()
    const mod = await import("../monitor.js")
    MonitorManager = mod.MonitorManager
    mm = new MonitorManager()
  })

  it("collectLines returns lines and stops on maxLines", async () => {
    lineStream.next
      .mockResolvedValueOnce("line1")
      .mockResolvedValueOnce("line2")
      .mockResolvedValueOnce("line3")

    const result = await mm.collectLines({} as any, { timeout: 10, maxLines: 2 })

    expect(result.lines).toEqual(["line1", "line2"])
    expect(result.stoppedReason).toBe("maxLines")
  })

  it("collectLines returns empty on immediate stream error", async () => {
    lineStream.next.mockRejectedValue(new Error("stream error"))

    const result = await mm.collectLines({} as any, { timeout: 10, maxLines: 100 })

    expect(result.lines).toEqual([])
    expect(result.stoppedReason).toBe("error")
  })

  it("collectLines stops on timeout", async () => {
    lineStream.next.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100000))
      return "too-late"
    })

    const result = await mm.collectLines({} as any, { timeout: 0.01, maxLines: 100 })

    expect(result.stoppedReason).toBe("timeout")
  })

  it("waitForPattern returns matching line", async () => {
    lineStream.next
      .mockResolvedValueOnce("foo")
      .mockResolvedValueOnce("bar")
      .mockResolvedValueOnce("hello world")
      .mockResolvedValueOnce("baz")

    const result = await mm.waitForPattern({} as any, "hello", { timeout: 10 })

    expect(result).toBe("hello world")
  })

  it("waitForPattern returns null on timeout", async () => {
    lineStream.next.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100000))
      return "too-late"
    })

    const result = await mm.waitForPattern({} as any, "hello", { timeout: 0.01 })

    expect(result).toBeNull()
  })

  it("waitForPattern supports RegExp", async () => {
    lineStream.next
      .mockResolvedValueOnce("abc")
      .mockResolvedValueOnce("error: something failed")
      .mockResolvedValueOnce("def")

    const result = await mm.waitForPattern({} as any, /error.*failed/, { timeout: 10 })

    expect(result).toBe("error: something failed")
  })

  it("startLineStream creates and stops a stream", async () => {
    lineStream.next.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100000))
      return null
    })

    const handle = await mm.startLineStream({} as any, {
      onLine: vi.fn(),
      onError: vi.fn(),
    })

    expect(handle.id).toBeTruthy()
    expect(mm.activeCount).toBe(1)

    await handle.stop()
    expect(mm.activeCount).toBe(0)
  })

  it("startRawStream calls onData with string content", async () => {
    const onData = vi.fn()
    outputStream.next.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100000))
      return null
    })

    const handle = await mm.startRawStream({} as any, { onData })

    expect(handle.id).toBeTruthy()
    await handle.stop()
  })

  it("startRenderStream creates render stream", async () => {
    const onRender = vi.fn()
    renderStream.next.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100000))
      return null
    })

    const handle = await mm.startRenderStream({} as any, { onRender })

    expect(handle.id).toBeTruthy()
    await handle.stop()
  })

  it("stopAll clears all streams", async () => {
    lineStream.next.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100000))
      return null
    })

    await mm.startLineStream({} as any, {})
    await mm.startLineStream({} as any, {})
    expect(mm.activeCount).toBe(2)

    await mm.stopAll()
    expect(mm.activeCount).toBe(0)
  })
})
