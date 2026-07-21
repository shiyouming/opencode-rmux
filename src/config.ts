import { readFileSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"

export interface RMUXNotifications {
  done: boolean
  permission: boolean
  question: boolean
  error: boolean
}

export interface RMUXPluginConfig {
  splits: boolean
  splitSize: string
  keepPaneOnIdle: boolean
  maxPanes: number
  debug: boolean
  notifications: RMUXNotifications
}

const DEFAULT_CONFIG: RMUXPluginConfig = {
  splits: true,
  splitSize: "30%",
  keepPaneOnIdle: false,
  maxPanes: 4,
  debug: false,
  notifications: {
    done: true,
    permission: true,
    question: true,
    error: true,
  },
}

const SPLIT_SIZE_RE = /^\d+(%|px)$/

function resolveConfigDir(): string {
  if (platform() === "win32") {
    return process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
}

function readConfig(): RMUXPluginConfig {
  const configDir = resolveConfigDir()
  const configPath = join(configDir, "opencode", "opencode-rmux.json")

  try {
    const raw = readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(raw)

    const config: RMUXPluginConfig = {
      splits: DEFAULT_CONFIG.splits,
      splitSize: DEFAULT_CONFIG.splitSize,
      keepPaneOnIdle: DEFAULT_CONFIG.keepPaneOnIdle,
      maxPanes: DEFAULT_CONFIG.maxPanes,
      debug: DEFAULT_CONFIG.debug,
      notifications: { ...DEFAULT_CONFIG.notifications },
    }

    if (typeof parsed.splits === "boolean") {
      config.splits = parsed.splits
    }

    if (typeof parsed.splitSize === "string" && SPLIT_SIZE_RE.test(parsed.splitSize)) {
      config.splitSize = parsed.splitSize
    }

    if (typeof parsed.keepPaneOnIdle === "boolean") {
      config.keepPaneOnIdle = parsed.keepPaneOnIdle
    }

    if (typeof parsed.maxPanes === "number" && Number.isInteger(parsed.maxPanes) && parsed.maxPanes >= 1) {
      config.maxPanes = parsed.maxPanes
    }

    if (typeof parsed.debug === "boolean") {
      config.debug = parsed.debug
    }

    const n = parsed.notifications
    if (n !== null && typeof n === "object" && !Array.isArray(n)) {
      for (const key of ["done", "permission", "question", "error"] as const) {
        if (typeof n[key] === "boolean") {
          config.notifications[key] = n[key]
        }
      }
    }

    return config
  } catch {
    return DEFAULT_CONFIG
  }
}

let cachedConfig: RMUXPluginConfig | null = null

export function loadConfig(): RMUXPluginConfig {
  if (!cachedConfig) {
    cachedConfig = readConfig()
  }
  return cachedConfig
}
