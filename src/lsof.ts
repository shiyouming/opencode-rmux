import { execSync } from "node:child_process"
import { platform } from "node:os"

const LSOF_LISTEN_RE = /:(?<port>\d+)\b/

function findPortViaLsof(pid: number): string | null {
  try {
    const out = execSync(
      `lsof -nP -a -p ${pid} -iTCP -sTCP:LISTEN 2>/dev/null`,
      { encoding: "utf-8", timeout: 3000 },
    )
    for (const line of out.split("\n")) {
      const match = line.match(LSOF_LISTEN_RE)
      if (match?.groups?.port) {
        return match.groups.port
      }
    }
    return null
  } catch {
    return null
  }
}

function findPortViaNetstat(pid: number): string | null {
  try {
    const out = execSync(
      `netstat -ano -p TCP 2>nul`,
      { encoding: "utf-8", timeout: 3000 },
    )
    for (const line of out.split("\n")) {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 5 && parts[4] === pid.toString()) {
        const addr = parts[1]
        const portMatch = addr.match(/:(\d+)$/)
        if (portMatch) return portMatch[1]
      }
    }
    return null
  } catch {
    return null
  }
}

function findPortViaPowerShell(pid: number): string | null {
  try {
    const script = `Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -First 1`
    const out = execSync(
      `powershell -NoProfile -Command "${script}"`,
      { encoding: "utf-8", timeout: 5000 },
    )
    const trimmed = out.trim()
    if (trimmed && /^\d+$/.test(trimmed)) {
      return trimmed
    }
    return null
  } catch {
    return null
  }
}

function findPort(pid: number): string | null {
  if (platform() === "win32") {
    return findPortViaPowerShell(pid) || findPortViaNetstat(pid)
  }
  return findPortViaLsof(pid)
}

let cachedUrl: string | null | undefined

function tryResolve(): string | null {
  if (process.env.OPENCODE_SERVER_URL) {
    try {
      const parsed = new URL(process.env.OPENCODE_SERVER_URL)
      if (parsed.hostname === "0.0.0.0" || parsed.hostname === "[::]" || parsed.hostname === "127.0.0.1") {
        parsed.hostname = "localhost"
      }
      return parsed.toString().replace(/\/$/, "")
    } catch {
    }
  }

  const port = findPort(process.pid) || findPort(process.ppid)
  if (port) return `http://localhost:${port}`

  return null
}

export function resolveServerUrl(): string | null {
  if (cachedUrl !== undefined) return cachedUrl
  cachedUrl = tryResolve() ?? null
  return cachedUrl
}

export async function resolveServerUrlWithRetry(maxAttempts = 5, delayMs = 500): Promise<string | null> {
  const immediate = resolveServerUrl()
  if (immediate) return immediate

  clearServerUrlCache()
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    const result = tryResolve()
    if (result) {
      cachedUrl = result
      return result
    }
  }
  cachedUrl = null
  return null
}

export function clearServerUrlCache(): void {
  cachedUrl = undefined
}
