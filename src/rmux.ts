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
        created: false,
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
      const panes = await mainWindow.panes()
      const size = splitSize ?? "30%"
      if (panes.length <= 1) {
        return await mainWindow.pane(0).split({
          direction: "h", size, ...(shellCommand ? { shellCommand } : {}),
        })
      }
      const rightPanes = await mainWindow.panes()
      return await rightPanes[rightPanes.length - 1].split({
        direction: "v", ...(shellCommand ? { shellCommand } : {}),
      })
    } catch {
      throw new Error("Failed to create agent pane")
    }
  }

  async sendKeys(target: string, keys: string): Promise<void> {
    if (!this.client) throw new Error("RMUX not connected")
    try {
      await this.client.sendKeys(target, keys)
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

  async closePane(pane: Pane): Promise<void> {
    try {
      await pane.close()
    } catch {
    }
  }

  async closeSession(name: string): Promise<void> {
    if (!this.client) return
    try {
      const session = this.client.session(name)
      await session.kill()
      return
    } catch {
    }
    try { await this.client.cmd("kill-session", "-t", name) } catch {}
  }

  async balanceRightPanes(sessionName: string): Promise<void> {
    if (!this.client) return
    try {
      const raw = await this.client.cmd("list-windows", "-t", sessionName, "-F", "#{window_height}")
      const height = Number(raw.stdout.trim())
      if (!height) return

      const rawPanes = await this.client.cmd("list-panes", "-t", sessionName, "-F", "#{pane_index} #{pane_id}")
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
      "#{pane_active}|#{pane_width}|#{pane_height}|#{pane_dead}|" +
      "#{pane_dead_status}|#{pane_pid}|#{pane_title}|#{pane_current_command}"
    )
    return raw.stdout.trim().split("\n")
      .filter(Boolean)
      .map(line => this.parsePaneMetaLine(line))
  }

  async findPanes(query: FindPanesQuery): Promise<PaneMeta[]> {
    const all = await this.listPaneMetas()
    return all.filter(pane =>
      Object.entries(query).every(([key, val]) =>
        val === undefined || val === null ||       (pane as unknown as Record<string, unknown>)[key] === val
      )
    )
  }

  async getPaneMeta(target: string): Promise<PaneMeta> {
    if (!this.client) throw new Error("RMUX not connected")
    const raw = await this.client.cmd(
      "display-message", "-p", "-t", target, "-F",
      "#{session_name}|#{window_index}|#{pane_index}|#{pane_id}|" +
      "#{pane_active}|#{pane_width}|#{pane_height}|#{pane_dead}|" +
      "#{pane_dead_status}|#{pane_pid}|#{pane_title}|#{pane_current_command}"
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

  async closeTarget(target: string): Promise<void> {
    if (!this.client) return
    try { await this.client.cmd("kill-pane", "-t", target) } catch {}
  }

  private parsePaneMetaLine(line: string): PaneMeta {
    const parts = line.split("|")
    return {
      sessionName: parts[0],
      windowIndex: Number(parts[1]),
      paneIndex: Number(parts[2]),
      paneId: parts[3],
      active: parts[4] === "1" || parts[4] === "true",
      width: Number(parts[5]),
      height: Number(parts[6]),
      dead: parts[7] === "1" || parts[7] === "true",
      deadStatus: parts[8] !== "" ? Number(parts[8]) : null,
      pid: parts[9] !== "" ? Number(parts[9]) : null,
      title: parts[10] ?? "",
      currentCommand: parts[11] ?? "",
    }
  }
}
