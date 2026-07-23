import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig, type RMUXPluginConfig } from "./config.js"
import { RMUXManager } from "./rmux.js"
import { SessionManager, type SessionEvent } from "./sessions.js"
import { createTools } from "./tools.js"
import { PermissionState, QuestionState } from "./state.js"

const plugin: Plugin = async () => {
  const config: RMUXPluginConfig = loadConfig()
  const rmux = new RMUXManager()
  const permission = new PermissionState()
  const question = new QuestionState()
  const sessionManager = new SessionManager(rmux, config, permission, question)

  const connected = await rmux.connect()

  if (!connected) {
    console.warn("[opencode-rmux] RMUX daemon not available — install rmux (https://rmux.io) for full functionality")
  }

  return {
    async event({ event: rawEvent }) {
      const event = rawEvent as SessionEvent
      await sessionManager.handleEvent(event)
    },

    tool: createTools(rmux),
  }
}

export default plugin
