import { tool, type ToolContext } from "@opencode-ai/plugin"
import { RMUXManager } from "./rmux.js"
import { MonitorManager } from "./monitor.js"

interface ToolArgs {
  [key: string]: any
}

function formatSessionList(rmux: RMUXManager) {
  return tool({
    description: "List all running RMUX sessions with metadata (windows, attached clients, dimensions)",
    args: {},
    async execute(_args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const metas = await rmux.getSessionMetas()
        if (metas.length === 0) {
          return "No RMUX sessions found."
        }
        return metas.map(m =>
          `- ${m.name} (${m.windows} windows, ${m.attached} attached, ${m.width}x${m.height})`
        ).join("\n")
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
        let metaInfo = ""
        try {
          const metas = await rmux.getSessionMetas()
          const meta = metas.find(m => m.name === args.name)
          if (meta) metaInfo = ` (${meta.windows} windows, ${meta.attached} attached, ${meta.width}x${meta.height})`
        } catch {}
        let msg = `Created RMUX session "${args.name}"${metaInfo}`
        if (args.command) {
          const pane = session.window(0).pane(0)
          await rmux.sendTextToPane(pane, args.command + "\n")
          msg += ` and running command: ${args.command}`
        }
        return msg
      } catch (error) {
        return `Error creating RMUX session: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatSendKeys(rmux: RMUXManager) {
  return tool({
    description: "Type a command into a pane as if typing at a keyboard. Use 'Enter' at the end to run it.",
    args: {
      target: tool.schema.string(),
      keys: tool.schema.string().describe("The exact text to type. Append 'Enter' to execute (e.g. 'npm install Enter'). Do NOT cd into a directory first — the pane has its own working directory. Do NOT add 'pause', '&&', or any extra wrapping. Type ONLY what the user asked to run."),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        await rmux.sendKeys(args.target, args.keys)
        return `Sent keys to ${args.target}: ${args.keys}`
      } catch (error) {
        return `Error sending keys: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatCapture(rmux: RMUXManager) {
  return tool({
    description: "Capture pane screen content as text (target as single string, e.g. 'demo:0.0' or '%1')",
    args: {
      target: tool.schema.string(),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const output = await rmux.captureTarget(args.target)
        return output || "(empty pane)"
      } catch (error) {
        return `Error capturing pane: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatWaitForText(rmux: RMUXManager) {
  return tool({
    description: "Wait for a text pattern to appear in a pane (target as single string)",
    args: {
      target: tool.schema.string(),
      pattern: tool.schema.string(),
      timeout: tool.schema.number().optional().default(30),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const pane = rmux.paneFromTarget(args.target)
        if (!pane) return `Cannot resolve pane from target: ${args.target}`
        const monitor = new MonitorManager()
        const matched = await monitor.waitForPattern(pane, args.pattern, { timeout: args.timeout })
        if (matched !== null) {
          return `Found pattern "${args.pattern}" in pane ${args.target}: "${matched}"`
        }
        return `Timeout waiting for pattern "${args.pattern}" in pane ${args.target}`
      } catch (error) {
        return `Error waiting for text: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatFindPanes(rmux: RMUXManager) {
  return tool({
    description: "Find panes by session name, command, title, or status",
    args: {
      sessionName: tool.schema.string().optional(),
      currentCommand: tool.schema.string().optional(),
      title: tool.schema.string().optional(),
      active: tool.schema.boolean().optional(),
      dead: tool.schema.boolean().optional(),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const query: Record<string, unknown> = {}
        for (const key of ["sessionName", "currentCommand", "title", "active", "dead"] as const) {
          if (args[key] !== undefined) query[key] = args[key]
        }
        const panes = await rmux.findPanes(query)
        if (panes.length === 0) return "No panes found matching the query."
        const lines = panes.map(p =>
          `${p.sessionName}:${p.windowIndex}.${p.paneIndex} (id:${p.paneId}, cmd:${p.currentCommand}, pid:${p.pid})`
        )
        return `Found ${panes.length} pane(s):\n${lines.join("\n")}`
      } catch (error) {
        return `Error finding panes: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatPaneInfo(rmux: RMUXManager) {
  return tool({
    description: "Get detailed pane metadata (PID, command, dimensions)",
    args: {
      target: tool.schema.string(),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const meta = await rmux.getPaneMeta(args.target)
        const usableTarget = `${meta.sessionName}:${meta.windowIndex}.${meta.paneIndex}`
        const lines = [
          `Session: ${meta.sessionName}`,
          `Pane: ${usableTarget}  (pane ID: ${meta.paneId})`,
          `Active: ${meta.active}  Dead: ${meta.dead}${meta.deadStatus !== null ? ` (status ${meta.deadStatus})` : ""}`,
          `Size: ${meta.width}x${meta.height}`,
          `PID: ${meta.pid ?? "N/A"}`,
          `Title: ${meta.title || "(empty)"}`,
          `Command: ${meta.currentCommand || "(none)"}`,
        ]
        return lines.join("\n")
      } catch (error) {
        return `Error getting pane info: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatObserve(rmux: RMUXManager) {
  return tool({
    description: "Subscribe to pane output stream, block and return collected lines",
    args: {
      target: tool.schema.string(),
      timeout: tool.schema.number().optional().default(15),
      maxLines: tool.schema.number().optional().default(100),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const pane = rmux.paneFromTarget(args.target)
        if (!pane) return `Cannot resolve pane from target: ${args.target}`
        const monitor = new MonitorManager()
        const result = await monitor.collectLines(pane, {
          timeout: args.timeout,
          maxLines: args.maxLines,
        })
        return JSON.stringify({
          lines: result.lines,
          stoppedReason: result.stoppedReason,
          totalLines: result.lines.length,
        }, null, 2)
      } catch (error) {
        return `Error observing pane: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

function formatObserveMulti(rmux: RMUXManager) {
  return tool({
    description: "Subscribe to multiple pane streams simultaneously",
    args: {
      panes: tool.schema.array(tool.schema.object({
        sessionName: tool.schema.string(),
        target: tool.schema.string(),
      })),
      timeout: tool.schema.number().optional().default(15),
      maxLinesPerPane: tool.schema.number().optional().default(50),
    },
    async execute(args: ToolArgs, _context: ToolContext) {
      try {
        if (!rmux.isConnected()) {
          return "RMUX daemon is not connected. Ensure the rmux binary is installed and running."
        }
        const paneList = args.panes as Array<{ sessionName: string; target: string }>
        if (!paneList || paneList.length === 0) {
          return "No panes specified."
        }
        const monitor = new MonitorManager()
        const tasks = paneList.map(async p => {
          const fullTarget = p.target.includes(":") ? p.target : `${p.sessionName}:${p.target}`
          const pane = rmux.paneFromTarget(fullTarget)
          if (!pane) return { target: p.target, error: "Cannot resolve pane" }
          const result = await monitor.collectLines(pane, {
            timeout: args.timeout,
            maxLines: args.maxLinesPerPane,
          })
          return { target: p.target, lines: result.lines, stoppedReason: result.stoppedReason }
        })
        const results = await Promise.all(tasks)
        return JSON.stringify(results, null, 2)
      } catch (error) {
        return `Error observing multiple panes: ${error instanceof Error ? error.message : String(error)}`
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
    rmux_find_panes: formatFindPanes(rmux),
    rmux_pane_info: formatPaneInfo(rmux),
    rmux_observe: formatObserve(rmux),
    rmux_observe_multi: formatObserveMulti(rmux),
  }
}
