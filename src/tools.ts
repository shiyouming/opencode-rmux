import { tool, type ToolContext } from "@opencode-ai/plugin"
import { RMUXManager } from "./rmux.js"

interface ToolArgs {
  [key: string]: any
}

function formatSessionList(rmux: RMUXManager) {
  return tool({
    description: "List all running RMUX sessions with their window and pane information",
    args: {},
    async execute(_args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const sessions = await rmux.listSessions()
        if (sessions.length === 0) {
          return "No RMUX sessions found."
        }
        return sessions.map((s: any) => `- ${s.name}`).join("\n")
      } catch (error) {
        return `Error listing RMUX sessions: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatCreateSession(rmux: RMUXManager) {
  return tool({
    description: "Create a new detached RMUX session, optionally with a startup command or shell",
    args: {
      name: tool.schema.string(),
      command: tool.schema.string().optional(),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const session = await rmux.ensureSession(args.name, true)
        if (args.command) {
          const pane = session.window(0).pane(0)
          await rmux.sendTextToPane(pane, args.command + "\n")
        }
        return `Created RMUX session "${args.name}"` + (args.command ? ` and running command: ${args.command}` : "")
      } catch (error) {
        return `Error creating RMUX session: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatSendKeys(rmux: RMUXManager) {
  return tool({
    description: "Send keystrokes to a specific RMUX pane identified by session and target",
    args: {
      session: tool.schema.string(),
      target: tool.schema.string(),
      keys: tool.schema.string(),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const target = `${args.session}:${args.target}`
        await rmux.sendKeys(target, args.keys)
        return `Sent keys to ${target}: ${args.keys}`
      } catch (error) {
        return `Error sending keys: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatCapture(rmux: RMUXManager) {
  return tool({
    description: "Capture the current screen content of an RMUX pane as text",
    args: {
      session: tool.schema.string(),
      target: tool.schema.string(),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const target = `${args.session}:${args.target}`
        const output = await rmux.captureTarget(target)
        return output || "(empty pane)"
      } catch (error) {
        return `Error capturing pane: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatWaitForText(rmux: RMUXManager) {
  return tool({
    description: "Wait for a text pattern to appear in a pane's output",
    args: {
      session: tool.schema.string(),
      target: tool.schema.string(),
      pattern: tool.schema.string(),
      timeout: tool.schema.number().optional().default(30),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const targetKey = `${args.session}:${args.target}`
        const deadline = Date.now() + (args.timeout as number) * 1000
        while (Date.now() < deadline) {
          const output = await rmux.captureTarget(targetKey)
          if (output && output.includes(args.pattern as string)) {
            return `Found pattern "${args.pattern}" in pane ${targetKey}`
          }
          await new Promise(r => setTimeout(r, 500))
        }
        return `Timeout waiting for pattern "${args.pattern}" in pane ${targetKey}`
      } catch (error) {
        return `Error waiting for text: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export interface ToolRegistry {
  [key: string]: ReturnType<typeof tool>
}

export function createTools(rmux: RMUXManager): ToolRegistry {
  return {
    rmux_list_sessions: formatSessionList(rmux),
    rmux_create_session: formatCreateSession(rmux),
    rmux_send_keys: formatSendKeys(rmux),
    rmux_capture: formatCapture(rmux),
    rmux_wait_for_text: formatWaitForText(rmux),
  }
}
