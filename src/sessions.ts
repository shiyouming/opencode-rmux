import { request } from "node:http"
import type { RMUXPluginConfig } from "./config.js"
import { RMUXManager } from "./rmux.js"
import { resolveServerUrlWithRetry } from "./lsof.js"


function serverAvailable(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = request(url, { method: "HEAD", timeout: 2000 }, res => {
      resolve(res.statusCode !== undefined)
    })
    req.on("error", () => resolve(false))
    req.on("timeout", () => { req.destroy(); resolve(false) })
    req.end()
  })
}


export interface SessionEvent {
  type: string
  properties: Record<string, any>
}

export class SessionManager {
  private rmux: RMUXManager
  private config: RMUXPluginConfig
  private activeSplits = new Map<string, string>()
  private pendingPermissions = new Set<string>()
  private pendingQuestions = new Set<string>()
  private splitQueue = Promise.resolve<unknown>(undefined)
  private mainSession: string | null = null

  constructor(rmux: RMUXManager, config: RMUXPluginConfig) {
    this.rmux = rmux
    this.config = config
  }

  async handleEvent(event: SessionEvent): Promise<void> {
    switch (event.type) {
      case "session.created":
        await this.onSessionCreated(event.properties)
        break
      case "session.deleted":
        this.onSessionDeleted(event.properties)
        break
      case "session.status":
        await this.onSessionStatus(event.properties)
        break
      case "session.error":
        await this.onSessionError(event.properties)
        break
      case "permission.asked":
        await this.onPermissionAsked(event.properties)
        break
      case "permission.replied":
        this.onPermissionReplied(event.properties)
        break
    }
  }

  hasPendingInput(): boolean {
    return this.pendingPermissions.size > 0 || this.pendingQuestions.size > 0
  }

  private enqueueSplitOp<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.splitQueue.then(fn, fn)
    this.splitQueue = result.then(
      () => {},
      () => {},
    )
    return result as Promise<T>
  }

  private notify(message: string): void {
    if (!this.rmux.isConnected()) return
    this.rmux.cmd("display-message", `opencode-rmux: ${message}`).catch(() => {})
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) console.error("[opencode-rmux]", ...args)
  }

  private removeAndClose(sessionId: string, force = false): void {
    const target = this.activeSplits.get(sessionId)
    if (!target) return
    if (!force && this.config.keepPaneOnIdle) {
      this.log("keepPaneOnIdle: skipping close for", sessionId.slice(0, 8))
      return
    }
    this.activeSplits.delete(sessionId)
    this.rmux.cmd("kill-pane", "-t", target).catch(() => {})
  }

  private async findOrCreateSession(): Promise<string | null> {
    if (this.mainSession) return this.mainSession

    try {
      const sessions = await this.rmux.listSessions()
      if (sessions.length > 0) {
        this.mainSession = sessions[0].name
        return this.mainSession
      }
    } catch {
    }
    return null
  }

  private async onSessionCreated(properties: Record<string, any>): Promise<void> {
    const info = properties.info
    if (!info?.parentID || !this.config.splits) return

    const url = await resolveServerUrlWithRetry()
    if (!url) return
    if (!(await serverAvailable(url))) return

    await this.enqueueSplitOp(async () => {
      if (this.activeSplits.has(info.id)) return

      try {
        if (this.activeSplits.size >= this.config.maxPanes) {
          const oldestId = this.activeSplits.keys().next().value
          if (oldestId) {
            this.log("maxPanes reached, recycling:", oldestId.slice(0, 8))
            this.removeAndClose(oldestId, true)
          }
        }

        const sessionName = await this.findOrCreateSession()
        if (!sessionName) return
        const session = await this.rmux.getSession(sessionName)
        if (!session) return

        const attachCmd = `opencode attach ${url} --session ${info.id}`
        const pane = await this.rmux.createAgentPane(session, attachCmd, this.config.splitSize)
        this.activeSplits.set(info.id, pane.target)
        await this.rmux.balanceRightPanes(sessionName)
        session.window(0).pane(0).select().catch(() => {})
        if (this.config.notifications?.done !== false) {
          this.notify(`subagent spawned: ${info.id.slice(0, 8)}`)
        }
      } catch {
      }
    })
  }

  private onSessionDeleted(properties: Record<string, any>): void {
    const sessionId = properties.info?.id ?? properties.sessionID
    if (sessionId && this.activeSplits.has(sessionId)) {
      this.removeAndClose(sessionId)
      if (this.config.notifications?.done !== false) {
        this.notify(`done: ${sessionId.slice(0, 8)}`)
      }
    }
  }

  private async onSessionError(properties: Record<string, any>): Promise<void> {
    this.pendingPermissions.clear()
    this.pendingQuestions.clear()

    const sessionId = properties.sessionID ?? properties.info?.id
    if (sessionId && this.activeSplits.has(sessionId)) {
      this.removeAndClose(sessionId)
      if (this.config.notifications?.error !== false) {
        this.notify(`error: ${sessionId.slice(0, 8)}`)
      }
    }
  }

  private async onSessionStatus(properties: Record<string, any>): Promise<void> {
    const sessionId = properties.sessionID ?? properties.info?.id
    const status = properties.status ?? properties.info?.status

    if (status?.type === "busy" && this.activeSplits.has(sessionId)) {
      this.log("busy:", sessionId.slice(0, 8))
      if (this.config.notifications?.done !== false) {
        this.notify(`working: ${sessionId.slice(0, 8)}`)
      }
    }

    if (status?.type === "idle" && this.activeSplits.has(sessionId)) {
      if (this.hasPendingInput()) return
      this.log("idle:", sessionId.slice(0, 8), "keepPaneOnIdle:", this.config.keepPaneOnIdle)
      this.removeAndClose(sessionId)
      if (this.config.notifications?.done !== false) {
        this.notify(`done: ${sessionId.slice(0, 8)}`)
      }
    }
  }

  private async onPermissionAsked(_properties: Record<string, any>): Promise<void> {
    const id = this.getPermissionRequestID(_properties)
    if (id && !this.pendingPermissions.has(id)) {
      this.pendingPermissions.add(id)
      if (this.config.notifications?.permission !== false) {
        this.notify(`permission needed: ${_properties.title ?? id.slice(0, 8)}`)
      }
    }
  }

  private onPermissionReplied(_properties: Record<string, any>): void {
    const id = this.getPermissionRequestID(_properties)
    if (id) {
      this.pendingPermissions.delete(id)
    }
  }

  private getPermissionRequestID(source: any): string | undefined {
    if (!source) return undefined
    const rawID = source.id ?? source.requestID ?? source.permissionID
    if (typeof rawID !== "string") return undefined
    const trimmed = rawID.trim()
    return trimmed === "" ? undefined : trimmed
  }
}
