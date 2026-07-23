import { Pane, PaneOutputStream, PaneLineStream, PaneRenderStream } from "@rmux/sdk"

export interface StreamHandle {
  id: string
  stop(): Promise<void>
}

export class MonitorManager {
  private streams = new Map<string, AbortController>()

  async startLineStream(pane: Pane, opts: {
    onLine?: (line: string) => void
    onError?: (err: Error) => void
  }): Promise<StreamHandle> {
    const id = `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ac = new AbortController()
    this.streams.set(id, ac)

    const run = async () => {
      try {
        const output = await PaneOutputStream.open(pane)
        const stream = new PaneLineStream(output)
        while (!ac.signal.aborted) {
          const line = await stream.next(1)
          if (!line) break
          opts.onLine?.(line)
        }
        await stream.close().catch(() => {})
      } catch (err) {
        opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      } finally {
        this.streams.delete(id)
      }
    }
    run()

    return {
      id,
      stop: async () => {
        ac.abort()
        this.streams.delete(id)
      },
    }
  }

  async startRawStream(pane: Pane, opts: {
    onData?: (data: string) => void
    onError?: (err: Error) => void
  }): Promise<StreamHandle> {
    const id = `raw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ac = new AbortController()
    this.streams.set(id, ac)

    const run = async () => {
      try {
        const output = await PaneOutputStream.open(pane)
        while (!ac.signal.aborted) {
          const chunk = await output.next(1)
          if (!chunk) break
          opts.onData?.(chunk.data.toString())
        }
        await output.close().catch(() => {})
      } catch (err) {
        opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      } finally {
        this.streams.delete(id)
      }
    }
    run()

    return {
      id,
      stop: async () => {
        ac.abort()
        this.streams.delete(id)
      },
    }
  }

  async startRenderStream(pane: Pane, opts: {
    onRender?: (snapshotText: string) => void
    onError?: (err: Error) => void
  }): Promise<StreamHandle> {
    const id = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ac = new AbortController()
    this.streams.set(id, ac)

    const run = async () => {
      try {
        const stream = await PaneRenderStream.open(pane)
        while (!ac.signal.aborted) {
          const snapshot = await stream.next(1)
          if (!snapshot) break
          opts.onRender?.(snapshot.visibleText)
        }
        await stream.close().catch(() => {})
      } catch (err) {
        opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      } finally {
        this.streams.delete(id)
      }
    }
    run()

    return {
      id,
      stop: async () => {
        ac.abort()
        this.streams.delete(id)
      },
    }
  }

  async collectLines(
    pane: Pane,
    opts: { timeout: number; maxLines: number }
  ): Promise<{ lines: string[]; stoppedReason: "timeout" | "maxLines" | "streamEnd" | "error" }> {
    const output = await PaneOutputStream.open(pane)
    const stream = new PaneLineStream(output)
    const lines: string[] = []
    let stoppedReason: "timeout" | "maxLines" | "streamEnd" | "error" = "timeout"
    const deadline = Date.now() + opts.timeout * 1000
    const TIMEOUT = Symbol("timeout")

    try {
      while (Date.now() < deadline && lines.length < opts.maxLines) {
        const remaining = Math.max(0, deadline - Date.now())
        const result = await Promise.race([
          stream.next(1),
          new Promise<typeof TIMEOUT>(resolve =>
            setTimeout(() => resolve(TIMEOUT), remaining)
          ),
        ])
        if (result === TIMEOUT) continue
        if (result === null) { stoppedReason = "streamEnd"; break }
        lines.push(result)
      }
      if (lines.length >= opts.maxLines) stoppedReason = "maxLines"
    } catch {
      stoppedReason = "error"
    } finally {
      await stream.close().catch(() => {})
    }

    return { lines, stoppedReason }
  }

  async waitForPattern(
    pane: Pane,
    pattern: string | RegExp,
    opts?: { timeout?: number }
  ): Promise<string | null> {
    const timeout = opts?.timeout ?? 30
    const deadline = Date.now() + timeout * 1000
    const output = await PaneOutputStream.open(pane)
    const stream = new PaneLineStream(output)
    const TIMEOUT = Symbol("timeout")

    try {
      while (Date.now() < deadline) {
        const remaining = Math.max(0, deadline - Date.now())
        const result = await Promise.race([
          stream.next(1),
          new Promise<typeof TIMEOUT>(resolve =>
            setTimeout(() => resolve(TIMEOUT), remaining)
          ),
        ])
        if (result === TIMEOUT) continue
        if (result === null) break
        if (typeof pattern === "string") {
          if (result.includes(pattern)) return result
        } else {
          if (pattern.test(result)) return result
        }
      }
    } finally {
      await stream.close().catch(() => {})
    }
    return null
  }

  async stopStream(id: string): Promise<void> {
    const ac = this.streams.get(id)
    if (ac) {
      ac.abort()
      this.streams.delete(id)
    }
  }

  async stopAll(): Promise<void> {
    for (const [id, ac] of this.streams) {
      ac.abort()
    }
    this.streams.clear()
  }

  get activeCount(): number {
    return this.streams.size
  }
}
