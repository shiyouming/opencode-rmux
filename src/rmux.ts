import { Pane, RMUX } from "@rmux/sdk"
import type { Session } from "@rmux/sdk"
import type { FindPanesQuery, PaneMeta, SessionInfo, SessionMeta } from "./types.js"

export type { SessionInfo }

export class RMUXManager {
  private client: RMUX | null = null

  async connect(): Promise<boolean> {
    try {
      this.client = await RMUX.builder().connectOrStart()
      return true
    } catch {
      this.client = null
      return false
    }
  }

  isConnected(): boolean {
    return this.client !== null
  }

  getClient(): RMUX | null {
    return this.client
  }

  async listSessions(): Promise<SessionInfo[]> {
    if (!this.client) throw new Error("RMUX not connected")
    try {
      const sessions = await this.client.listSessions()
      return sessions.map((s: Record<string, unknown>) => ({
        name: (s.session_name ?? s.name ?? "unknown") as string,
      }))
    } catch {
      throw new Error("Failed to list RMUX sessions")
    }
  }

  async ensureSession(name: string, detached = true): Promise<Session> {
    if (!this.client) throw new Error("RMUX not connected")
    try {
      return await this.client.ensureSession(name, { detached })
    } catch {
      throw new Error(`Failed to ensure RMUX session: ${name}`)
    }
  }

  async getSession(name: string): Promise<Session | null> {
    if (!this.client) throw new Error("RMUX not connected")
    try {
      return this.client.session(name)
    } catch {
      return null
    }
  }

  async createAgentPane(session: Session, shellCommand?: string, splitSize?: string): Promise<Pane> {
    try {
      if (!this.client) throw new Error("RMUX not connected")
      const mainWindow = session.window(0)
      if (!mainWindow) throw new Error("Session has no window 0")
      const panesBefore = await mainWindow.panes()
      const size = splitSize ?? "30%"
      const isFirstSplit = panesBefore.length <= 1
      const targetPane = panesBefore[isFirstSplit ? 0 : panesBefore.length - 1]
      const direction = isFirstSplit ? "horizontal" : "vertical"
      const newPane = await targetPane.split({
        direction,
        size: isFirstSplit ? size : `${Math.floor(100 / (panesBefore.length + 1))}%`,
        shellCommand: shellCommand
          ? `${process.platform === "win32"
              ? `cmd.exe /c "set OPENCODE_RMUX_DISABLE_SPLITS=1 &&`
              : "OPENCODE_RMUX_DISABLE_SPLITS=1"} ${shellCommand}${process.platform === "win32"
              ? `"`
              : ""}`
          : undefined,
      })
      let panesAfter = await mainWindow.panes()
      const knownTargets = new Set<string>()
      for (const bp of panesBefore) knownTargets.add(bp.target)
      knownTargets.add(newPane.target)
      for (const p of panesAfter) {
        if (knownTargets.has(p.target)) continue
        await p.close().catch(() => {})
      }
      for (let retry = 0; retry < 2; retry++) {
        await new Promise(r => setTimeout(r, 300))
        panesAfter = await mainWindow.panes()
        for (const p of panesAfter) {
          if (knownTargets.has(p.target)) continue
          await p.close().catch(() => {})
        }
      }
      return newPane
    } catch {
      throw new Error("Failed to create agent pane")
    }
  }

  async sendKeys(target: string, keys: string): Promise<void> {
    if (!this.client) throw new Error("RMUX not connected")
    try {
      const client = this.client

      const toKeyName = (s: string): string | null => {
        if (/^[Cc]-[a-zA-Z]$/.test(s)) return `C-${s[2].toLowerCase()}`
        const m = s.match(/^Ctrl\+([a-zA-Z])$/i)
        if (m) return `C-${m[1].toLowerCase()}`
        const name = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
        if (/^(Enter|Tab|Escape|Space|Backspace|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|F(?:[1-9]|1[0-2]))$/.test(name)) return name
        return null
      }

      const tokens = keys.split(/\s+/).filter(Boolean)
      if (tokens.every(t => !toKeyName(t))) {
        if (keys.endsWith(" Enter")) {
          await client.sendText(target, keys.slice(0, -6) + "\n")
        } else {
          await client.sendText(target, keys)
        }
        return
      }

      const segments: Array<{ kind: "key" | "text"; value: string }> = []
      for (const t of tokens) {
        const kn = toKeyName(t)
        if (kn) {
          segments.push({ kind: "key", value: kn })
        } else {
          const inlineMatch = t.match(/^(.*?)((?:Ctrl\+[a-zA-Z]|[Cc]-[a-zA-Z]))(.*)$/)
          if (inlineMatch) {
            const [, before, ctrl, after] = inlineMatch
            const ctrlKey = toKeyName(ctrl)
            if (before) segments.push({ kind: "text", value: before })
            if (ctrlKey) segments.push({ kind: "key", value: ctrlKey })
            if (after) segments.push({ kind: "text", value: after })
          } else {
            const last = segments[segments.length - 1]
            if (last && last.kind === "text") {
              last.value += " " + t
            } else {
              segments.push({ kind: "text", value: t })
            }
          }
        }
      }

      for (const seg of segments) {
        if (seg.kind === "key") {
          await client.sendKeys(target, seg.value)
        } else if (seg.value) {
          await client.sendText(target, seg.value)
        }
      }
    } catch {
      throw new Error(`Failed to send keys to: ${target}`)
    }
  }
  async sendTextToPane(pane: Pane, text: string): Promise<void> {
    try {
      await pane.sendText(text)
    } catch {
      throw new Error("Failed to send text to pane")
    }
  }

  async capturePaneText(pane: Pane): Promise<string> {
    try {
      return await pane.captureText()
    } catch {
      throw new Error("Failed to capture pane text")
    }
  }

  async captureTarget(target: string): Promise<string> {
    if (!this.client) throw new Error("RMUX not connected")
    try {
      return await this.client.capturePane({ target })
    } catch {
      throw new Error(`Failed to capture: ${target}`)
    }
  }

  async waitForPaneText(pane: Pane, text: string): Promise<void> {
    try {
      await pane.waitForText(text)
    } catch {
      throw new Error(`Wait for text timed out: "${text}"`)
    }
  }

  async closeSession(name: string): Promise<void> {
    if (!this.client) return
    try {
      const session = this.client.session(name)
      if (session) {
        await session.kill()
        return
      }
    } catch {
    }
    try { await this.client.cmd("kill-session", "-t", name) } catch {}
  }

  async balanceRightPanes(sessionName: string): Promise<void> {
    if (!this.client) return
    try {
      const raw = await this.client.cmd("list-windows", "-t", sessionName, "-F", "#{window_height}")
      const height = Number(raw.stdout.trim().split("\n")[0])
      if (!height) return

      const rawPanes = await this.client.cmd("list-panes", "-t", `${sessionName}:0`, "-F", "#{pane_index} #{pane_id}")
      const rightPanes: string[] = []
      for (const line of rawPanes.stdout.trim().split("\n")) {
        const [idx, id] = line.trim().split(/\s+/)
        if (idx !== "0") rightPanes.push(id)
      }
      if (rightPanes.length === 0) return

      const eachHeight = Math.max(1, Math.floor(height * 0.98 / rightPanes.length))
      for (const pid of rightPanes) {
        try {
          const pane = new Pane(this.client, pid)
          await pane.resize({ height: eachHeight })
        } catch {
          await this.client.cmd("resize-pane", "-t", pid, "-y", String(eachHeight)).catch(() => {})
        }
      }
    } catch {
    }
  }

  async cmd(...args: string[]): Promise<{ returnCode: number; stdout: string; stderr: string }> {
    if (!this.client) throw new Error("RMUX not connected")
    try {
      return await this.client.cmd(...(args as [string, ...string[]]))
    } catch {
      throw new Error(`RMUX command failed: ${args.join(" ")}`)
    }
  }

  async listPaneMetas(): Promise<PaneMeta[]> {
    if (!this.client) throw new Error("RMUX not connected")
    const raw = await this.client.cmd(
      "list-panes", "-a", "-F",
      "#{session_name}|#{window_index}|#{pane_index}|#{pane_id}|" +
      "#{pane_active}|#{pane_width}|#{pane_height}|#{pane_left}|#{pane_top}|" +
      "#{pane_dead}|#{pane_dead_status}|#{pane_pid}|#{pane_title}|#{pane_current_command}"
    )
    return raw.stdout.trim().split("\n")
      .filter(Boolean)
      .map(line => this.parsePaneMetaLine(line))
  }

  async findPanes(query: FindPanesQuery): Promise<PaneMeta[]> {
    const all = await this.listPaneMetas()
    return all.filter(pane =>
      Object.entries(query).every(([key, val]) => {
        if (val === undefined || val === null) return true
        const paneVal = (pane as unknown as Record<string, unknown>)[key]
        if (typeof val === "string" && typeof paneVal === "string") {
          return paneVal.toLowerCase().includes(val.toLowerCase())
        }
        return paneVal === val
      })
    )
  }

  async getPaneMeta(target: string): Promise<PaneMeta> {
    if (!this.client) throw new Error("RMUX not connected")
    const raw = await this.client.cmd(
      "display-message", "-p", "-t", target, "-F",
      "#{session_name}|#{window_index}|#{pane_index}|#{pane_id}|" +
      "#{pane_active}|#{pane_width}|#{pane_height}|#{pane_left}|#{pane_top}|" +
      "#{pane_dead}|#{pane_dead_status}|#{pane_pid}|#{pane_title}|#{pane_current_command}"
    )
    return this.parsePaneMetaLine(raw.stdout.trim())
  }

  async getSessionMetas(): Promise<SessionMeta[]> {
    if (!this.client) throw new Error("RMUX not connected")
    const raw = await this.client.cmd(
      "list-sessions", "-F",
      "#{session_name}|#{session_windows}|#{session_attached}|" +
      "#{session_width}|#{session_height}"
    )
    return raw.stdout.trim().split("\n")
      .filter(Boolean)
      .map(line => {
        const [name, windows, attached, width, height] = line.split("|")
        return {
          name, windows: Number(windows), attached: Number(attached),
          width: Number(width), height: Number(height),
        }
      })
  }

  async getCurrentSessionName(): Promise<string | null> {
    if (!this.client) return null
    try {
      const raw = await this.client.cmd("display-message", "-p", "#{session_name}")
      const trimmed = raw.stdout.trim()
      if (trimmed !== "") return trimmed
    } catch {
    }
    try {
      const raw = await this.client.cmd(
        "list-sessions", "-F",
        "#{session_name}|#{session_attached}"
      )
      const lines = raw.stdout.trim().split("\n").filter(Boolean)
      const attached = lines.find(l => l.split("|")[1] !== "0")
      if (attached) return attached.split("|")[0]
      if (lines.length > 0) return lines[0].split("|")[0]
      return null
    } catch {
      return null
    }
  }

  async getCurrentCommand(target: string): Promise<string | null> {
    if (!this.client) return null
    try {
      const raw = await this.client.cmd(
        "display-message", "-p", "-t", target, "-F", "#{pane_current_command}"
      )
      return raw.stdout.trim() || null
    } catch {
      return null
    }
  }

  paneFromTarget(target: string): Pane | null {
    if (!this.client) return null
    return new Pane(this.client, target)
  }

  async splitPane(sessionName: string, splitSize?: string, direction?: "horizontal" | "vertical", target?: string): Promise<Pane> {
    if (!this.client) throw new Error("RMUX not connected")
    const session = await this.getSession(sessionName)
    if (!session) throw new Error(`Session not found: ${sessionName}`)

    if (target || direction) {
      const dirFlag = direction === "vertical" ? "-v" : "-h"
      const size = splitSize ?? "30%"
      const targetPane = target ?? session.window(0)?.pane(0)?.target
      if (!targetPane) throw new Error("No target pane available")
      const args: string[] = [
        "split-window", "-d", "-P", "-F", "#{pane_id}",
        dirFlag, "-l", size, "-t", targetPane,
      ]
      const run = await this.client.cmd(...(args as [string, ...string[]]))
      return new Pane(this.client, run.stdout.trim())
    }

    return await this.createAgentPane(session, undefined, splitSize)
  }

  async selectLayout(sessionName: string, layout: string, windowIndex?: number): Promise<void> {
    if (!this.client) throw new Error("RMUX not connected")
    const idx = windowIndex ?? 0
    await this.client.cmd("select-layout", "-t", `${sessionName}:${idx}`, layout)
  }

  async findTargetByCriteria(criteria: {
    sessionName?: string
    title?: string
    command?: string
    position?: string
    active?: boolean
  }): Promise<string | null> {
    const all = await this.listPaneMetas()
    let filtered = all

    if (criteria.sessionName) {
      filtered = filtered.filter(p => p.sessionName === criteria.sessionName)
    }
    if (criteria.title) {
      const t = criteria.title.toLowerCase()
      filtered = filtered.filter(p => p.title.toLowerCase().includes(t))
    }
    if (criteria.command) {
      const c = criteria.command.toLowerCase()
      filtered = filtered.filter(p => p.currentCommand.toLowerCase().includes(c))
    }
    if (criteria.active !== undefined) {
      filtered = filtered.filter(p => p.active === criteria.active)
    }
    if (criteria.position) {
      const pos = criteria.position.toLowerCase()
      const perWindow = new Map<string, PaneMeta[]>()
      for (const p of filtered) {
        const key = `${p.sessionName}:${p.windowIndex}`
        if (!perWindow.has(key)) perWindow.set(key, [])
        perWindow.get(key)!.push(p)
      }
      filtered = filtered.filter(p => {
        const group = perWindow.get(`${p.sessionName}:${p.windowIndex}`)!
        const minLeft = Math.min(...group.map(x => x.paneLeft))
        const maxLeft = Math.max(...group.map(x => x.paneLeft))
        const minTop = Math.min(...group.map(x => x.paneTop))
        const maxTop = Math.max(...group.map(x => x.paneTop))
        if (pos === "left" || pos === "top-left") return p.paneLeft === minLeft
        if (pos === "top") return p.paneTop === minTop
        if (pos === "right") return p.paneLeft > minLeft
        if (pos === "bottom") return p.paneTop === maxTop && group.length > 1
        return false
      })
    }

    if (filtered.length === 0) return null
    const p = filtered[0]
    return `${p.sessionName}:${p.windowIndex}.${p.paneIndex}`
  }

  async closeTarget(target: string): Promise<void> {
    if (!this.client) return
    try { await this.paneFromTarget(target)?.close() } catch {}
  }

  private parsePaneMetaLine(line: string): PaneMeta {
    const parts = line.split("|")
    if (parts.length < 14) {
      return {
        sessionName: parts[0] ?? "", windowIndex: 0, paneIndex: 0,
        paneId: parts[3] ?? "%0", active: false, width: 0, height: 0,
        paneLeft: 0, paneTop: 0, dead: true, deadStatus: null, pid: null,
        title: "", currentCommand: "",
      }
    }
    return {
      sessionName: parts[0],
      windowIndex: Number(parts[1]),
      paneIndex: Number(parts[2]),
      paneId: parts[3],
      active: parts[4] === "1" || parts[4] === "true",
      width: Number(parts[5]),
      height: Number(parts[6]),
      paneLeft: Number(parts[7]),
      paneTop: Number(parts[8]),
      dead: parts[9] === "1" || parts[9] === "true",
      deadStatus: parts[10] !== "" ? Number(parts[10]) : null,
      pid: parts[11] !== "" ? Number(parts[11]) : null,
      title: parts[12] ?? "",
      currentCommand: parts[13] ?? "",
    }
  }
}
