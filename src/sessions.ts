import { request } from "node:http"
import type { RMUXPluginConfig } from "./config.js"
import { RMUXManager } from "./rmux.js"
import { resolveServerUrl, resolveServerUrlWithRetry } from "./lsof.js"
import type { PermissionState, QuestionState } from "./state.js"


function serverAvailable(rawUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return Promise.resolve(false)
  }
  return new Promise(resolve => {
    const req = request(url, { method: "HEAD", timeout: 2000 }, res => {
      req.destroy()
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
  private idleBlocked = new Set<string>()
  private subagentSessions = new Set<string>()
  private splitQueue = Promise.resolve<unknown>(undefined)
  private mainSession: string | null = null
  private permission: PermissionState
  private question: QuestionState
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(rmux: RMUXManager, config: RMUXPluginConfig, permission: PermissionState, question: QuestionState) {
    this.rmux = rmux
    this.config = config
    this.permission = permission
    this.question = question
    this.startCleanupTimer()
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
        await this.onPermissionReplied(event.properties)
        break
      case "question.asked":
        this.onQuestionAsked(event.properties)
        break
      case "question.replied":
      case "question.rejected":
        await this.onQuestionReplied(event.properties)
        break
    }
  }

  hasPendingInput(): boolean {
    return this.permission.pendingCount > 0 || this.question.pendingCount > 0
  }

  private enqueueSplitOp<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.splitQueue.then(() => fn(), () => fn())
    this.splitQueue = result.then(
      () => {},
      () => {},
    )
    return result as Promise<T>
  }

  private notify(message: string): void {
    if (!this.rmux.isConnected()) return
    this.rmux.cmd("display-message", `opencode-rmux: ${message.replace(/#/g, "##")}`).catch(() => {})
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) console.error("[opencode-rmux]", ...args)
  }

  private async removeAndClose(sessionId: string, force = false): Promise<void> {
    const target = this.activeSplits.get(sessionId)
    if (!target || target === "pending") return
    if (!force && this.config.keepPaneOnIdle) {
      this.log("keepPaneOnIdle: skipping close for", sessionId.slice(0, 8))
      return
    }
    this.activeSplits.delete(sessionId)
    this.subagentSessions.delete(sessionId)
    this.idleBlocked.delete(sessionId)
    await this.rmux.closeTarget(target)
    await new Promise(r => setTimeout(r, 200))
  }

  private async findOrCreateSession(): Promise<string | null> {
    if (this.mainSession) return this.mainSession

    try {
      const name = await this.rmux.getCurrentSessionName()
      if (name) {
        this.mainSession = name
        return this.mainSession
      }
    } catch (err) {
      this.log("findOrCreateSession error:", err)
    }
    return null
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private startCleanupTimer(): void {
    this.stopCleanupTimer()
    this.cleanupTimer = setInterval(() => {
      if (!this.rmux.isConnected()) return
      this.enqueueSplitOp(async () => {
        await this.cleanupOrphanedPanes()
      })
    }, 30000)
  }

  private async cleanupOrphanedPanes(): Promise<void> {
    const toClean: Array<[string, string]> = []
    for (const [sessionId, target] of this.activeSplits) {
      if (target === "pending") continue
      toClean.push([sessionId, target])
    }
    for (const [sessionId, target] of toClean) {
      try {
        const meta = await this.rmux.getPaneMeta(target)
        if (meta.dead) {
          this.log("cleaning orphaned pane:", sessionId.slice(0, 8))
          this.activeSplits.delete(sessionId)
          this.subagentSessions.delete(sessionId)
          this.idleBlocked.delete(sessionId)
          await this.rmux.closeTarget(target)
        }
      } catch (err) {
        this.log("cleanupOrphanedPanes getPaneMeta error:", err)
      }
    }
    for (const sessionId of [...this.subagentSessions]) {
      if (!this.activeSplits.has(sessionId)) {
        this.subagentSessions.delete(sessionId)
      }
    }
  }

  private async onSessionCreated(properties: Record<string, any>): Promise<void> {
    const info = properties.info
    if (!info?.parentID || !this.config.splits) return
    if (process.env.OPENCODE_RMUX_DISABLE_SPLITS) return
    if (!this.rmux.isConnected()) return

    let rawUrl = await resolveServerUrl()
    if (!rawUrl) rawUrl = await resolveServerUrlWithRetry()
    if (!rawUrl) return
    if (!(await serverAvailable(rawUrl))) return

    let url: URL
    try { url = new URL(rawUrl) } catch { return }
    if (url.protocol !== "http:" && url.protocol !== "https:") return
    const safeUrl = url.origin

    await this.enqueueSplitOp(async () => {
      if (this.subagentSessions.has(info.parentID)) {
        this.log("skipping nested subagent:", info.id.slice(0, 8))
        this.subagentSessions.add(info.id)
        return
      }

      await this.cleanupOrphanedPanes()

      if (this.activeSplits.has(info.id)) {
        if (this.activeSplits.get(info.id) === "pending") return
        this.activeSplits.delete(info.id)
      }

      try {
        this.activeSplits.set(info.id, "pending")

        const sessionName = await this.findOrCreateSession()
        if (!sessionName) { this.activeSplits.delete(info.id); return }
        const session = await this.rmux.getSession(sessionName)
        if (!session) { this.activeSplits.delete(info.id); this.mainSession = null; return }

        const attachCmd = `opencode attach ${safeUrl} --session ${info.id}`
        const pane = await this.rmux.createAgentPane(session, attachCmd, this.config.splitSize)
        this.activeSplits.set(info.id, pane.target)
        this.subagentSessions.add(info.id)
        await this.rmux.balanceRightPanes(sessionName)
        if (this.config.notifications?.done !== false) {
          this.notify(`subagent spawned: ${info.id.slice(0, 8)}`)
        }
      } catch {
        const target = this.activeSplits.get(info.id)
        if (target && target !== "pending") {
          await this.rmux.closeTarget(target)
        }
        this.activeSplits.delete(info.id)
        this.subagentSessions.delete(info.id)
      }
    })
  }

  private onSessionDeleted(properties: Record<string, any>): void {
    const sessionId = properties.info?.id ?? properties.sessionID
    if (sessionId && this.activeSplits.has(sessionId)) {
      this.enqueueSplitOp(async () => {
        await this.removeAndClose(sessionId)
        if (this.config.notifications?.done !== false) {
          this.notify(`done: ${sessionId.slice(0, 8)}`)
        }
      })
    }
  }

  private async onSessionError(properties: Record<string, any>): Promise<void> {
    const sessionId = properties.sessionID ?? properties.info?.id
    if (sessionId && this.activeSplits.has(sessionId)) {
      await this.enqueueSplitOp(async () => {
        await this.removeAndClose(sessionId)
        if (this.config.notifications?.error !== false) {
          this.notify(`error: ${sessionId.slice(0, 8)}`)
        }
      })
    }
  }

  private async onSessionStatus(properties: Record<string, any>): Promise<void> {
    const sessionId = properties.sessionID ?? properties.info?.id
    const status = properties.status ?? properties.info?.status

    if (status?.type === "busy" && this.activeSplits.has(sessionId)) {
      this.idleBlocked.delete(sessionId)
      this.log("busy:", sessionId.slice(0, 8))
    }

    if (status?.type === "idle" && this.activeSplits.has(sessionId)) {
      if (this.hasPendingInput()) {
        this.idleBlocked.add(sessionId)
        return
      }
      this.log("idle:", sessionId.slice(0, 8), "keepPaneOnIdle:", this.config.keepPaneOnIdle)
      await this.enqueueSplitOp(async () => {
        await this.removeAndClose(sessionId)
        if (this.config.notifications?.done !== false) {
          this.notify(`done: ${sessionId.slice(0, 8)}`)
        }
      })
    }
  }

  private async onPermissionAsked(_properties: Record<string, any>): Promise<void> {
    const id = this.getPermissionRequestID(_properties)
    if (id && this.permission.track(id)) {
      if (this.config.notifications?.permission !== false) {
        this.notify(`permission needed: ${_properties.title ?? id.slice(0, 8)}`)
      }
    }
  }

  private async onPermissionReplied(_properties: Record<string, any>): Promise<void> {
    const id = this.getPermissionRequestID(_properties)
    if (id) {
      this.permission.resolve(id)
      await this.flushIdleBlocked()
    }
  }

  private onQuestionAsked(_properties: Record<string, any>): void {
    const id = this.getPermissionRequestID(_properties)
    if (id && this.question.track(id)) {
      if (this.config.notifications?.question !== false) {
        this.notify(`question: ${_properties.title ?? id.slice(0, 8)}`)
      }
    }
  }

  private async onQuestionReplied(_properties: Record<string, any>): Promise<void> {
    const id = this.getPermissionRequestID(_properties)
    if (id) {
      this.question.resolve(id)
      await this.flushIdleBlocked()
    }
  }

  private async flushIdleBlocked(): Promise<void> {
    if (this.hasPendingInput() || this.idleBlocked.size === 0) return
    const blocked = [...this.idleBlocked]
    this.idleBlocked.clear()
    for (const sessionId of blocked) {
      await this.enqueueSplitOp(async () => {
        await this.removeAndClose(sessionId)
        if (this.config.notifications?.done !== false) {
          this.notify(`done: ${sessionId.slice(0, 8)}`)
        }
      })
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
