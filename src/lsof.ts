import { execFile } from "node:child_process"
import { platform } from "node:os"

const LSOF_LISTEN_RE = /:(?<port>\d+)\b/

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      resolve(err ? "" : stdout)
    })
  })
}

async function findPortViaLsof(pid: number): Promise<string | null> {
  const out = await run("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"], 3000)
  for (const line of out.split("\n")) {
    const match = line.match(LSOF_LISTEN_RE)
    if (match?.groups?.port) {
      return match.groups.port
    }
  }
  return null
}

async function findPortViaNetstat(pid: number): Promise<string | null> {
  const out = await run("netstat", ["-ano", "-p", "TCP"], 3000)
  for (const line of out.split("\n")) {
    const parts = line.trim().split(/\s+/)
    if (parts.length >= 5 && parts[3] === "LISTENING" && parts[4] === pid.toString()) {
      const addr = parts[1]
      const portMatch = addr.match(/:(\d+)$/)
      if (portMatch) return portMatch[1]
    }
  }
  return null
}

async function findPortViaPowerShell(pid: number): Promise<string | null> {
  const script = `Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -First 1`
  for (const shell of ["pwsh", "powershell"]) {
    const out = await run(shell, ["-NoProfile", "-Command", script], 5000)
    const trimmed = out.trim()
    if (trimmed && /^\d+$/.test(trimmed)) {
      return trimmed
    }
  }
  return null
}

async function findPort(pid: number): Promise<string | null> {
  if (platform() === "win32") {
    const netstat = await findPortViaNetstat(pid)
    if (netstat) return netstat
    return findPortViaPowerShell(pid)
  }
  return findPortViaLsof(pid)
}

let cachedUrl: string | null | undefined
let cachedAt = 0
const CACHE_TTL = 60_000

async function tryResolve(): Promise<string | null> {
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

  const port = (await findPort(process.pid)) ?? (await findPort(process.ppid))
  if (port) return `http://localhost:${port}`

  return null
}

export async function resolveServerUrl(): Promise<string | null> {
  if (cachedUrl !== undefined && Date.now() - cachedAt < CACHE_TTL) return cachedUrl
  cachedUrl = (await tryResolve()) ?? null
  cachedAt = Date.now()
  return cachedUrl
}

export async function resolveServerUrlWithRetry(maxAttempts = 5, delayMs = 500): Promise<string | null> {
  const immediate = await resolveServerUrl()
  if (immediate) return immediate

  clearServerUrlCache()
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    const result = await tryResolve()
    if (result) {
      cachedUrl = result
      cachedAt = Date.now()
      return result
    }
  }
  cachedUrl = null
  cachedAt = Date.now()
  return null
}

export function clearServerUrlCache(): void {
  cachedUrl = undefined
  cachedAt = 0
}
