# opencode-rmux

Opencode plugin that bridges AI coding agent sessions with RMUX terminal multiplexer — cross-platform subagent pane management and RMUX control tools.

## Project Overview

- **npm package**: `opencode-rmux`
- **Plugin type**: Opencode plugin (JS/TS module, npm-published)
- **Target platform**: Windows / macOS / Linux
- **Dependencies**:
  - `@opencode-ai/plugin` (peer) — plugin SDK
  - `@rmux/sdk` — RMUX TypeScript SDK for daemon control
- **Build**: tsc (`npx tsc`)
- **License**: MIT

## Architecture

```
opencode-rmux/
├── src/
│   ├── index.ts         # Plugin entry point — default export
│   ├── rmux.ts          # RMUX SDK wrapper (connect, session, pane ops)
│   ├── tools.ts         # Custom tool definitions (rmux_list_sessions, etc.)
│   ├── config.ts        # Config reader (~/.config/opencode/opencode-rmux.json)
│   ├── sessions.ts      # Subagent session → RMUX pane management
│   └── lsof.ts          # Port discovery (cross-platform)
├── package.json
├── tsconfig.json
├── AGENTS.md
├── PLAN.md
├── README.md
├── LICENSE
├── .github/workflows/release.yml
└── .github/dependabot.yml
```

## Core Features

### 1. Subagent Pane Management (Event-driven)

When a subagent spawns (`session.created` with `parentID`), the plugin:
1. Splits the current RMUX window horizontally (30% right panel)
2. Runs `opencode attach` in the new pane
3. Subsequent subagents stack vertically below in the same right panel

On `session.status` idle (subagent completes), the pane is automatically closed via `kill-pane`.

| Event | Action |
|-------|--------|
| `session.created` + parentID | Create right-sidebar pane, `opencode attach` |
| `session.status` (idle, tracked) | Close pane, notify done |
| `session.status` (busy, tracked) | Notify working |
| `session.deleted` (fallback) | Close pane |
| `session.error` (tracked) | Close pane, notify error |
| `permission.asked` / `permission.replied` | Toggle pending-permission state |

Note: `session.deleted` does NOT fire for subagent sessions — cleanup relies on `session.status` idle.

### 2. RMUX Control Tools

| Tool | Description |
|------|-------------|
| `rmux_list_sessions` | List all running RMUX sessions |
| `rmux_create_session` | Create a new RMUX session (optionally with startup command) |
| `rmux_send_keys` | Send keystrokes to an RMUX pane |
| `rmux_capture` | Capture pane screen content as text |
| `rmux_wait_for_text` | Wait for text pattern to appear in a pane |

### 3. Configuration

File: `~/.config/opencode/opencode-rmux.json` (XDG-compatible)

```json
{
  "splits": true,
  "splitSize": "30%",
  "keepPaneOnIdle": false,
  "debug": false,
  "notifications": {
    "done": true,
    "permission": true,
    "question": true,
    "error": true
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `splits` | boolean | `false` | Enable subagent pane creation |
| `splitSize` | string | `"30%"` | Subagent pane width (`"30%"`, `"40%"`, `"300px"`) |
| `keepPaneOnIdle` | boolean | `false` | Keep pane open when subagent completes |
| `maxPanes` | number | `4` | Max subagent panes (oldest recycled when full) |
| `debug` | boolean | `false` | Debug logging to stderr |
| `notifications.*` | boolean | `true` | Per-notification toggles (done/permission/question/error) |

### 4. Layout

```
+----------+------+
|          | ag1  |
|  Main    |------|
|  Area    | ag2  |
|  70%     |------|
|          | ag3  |
+----------+------+
```

When `maxPanes` is reached, the oldest pane is recycled (force-closed) to make room for the new subagent, ensuring the right panel never exceeds the limit. With `keepPaneOnIdle: false` (default), panes auto-close on `session.status` idle before reaching the limit.

## Implementation Notes

- Cleanup is driven by `session.status` idle (not `session.deleted`), since subagents don't emit delete events
- `Pane.close()` from SDK doesn't work reliably in detached sessions — uses `cmd("kill-pane", "-t", pane.target)` instead
- `pane.target` returns pane ID format (`%N`) which works with `kill-pane`
- Window pane indices are volatile (re-indexed after close) — uses `window.panes()` for always-current layout
- All RMUX SDK calls wrapped in try/catch with graceful fallback
- Serialized via `enqueueSplitOp` to avoid race conditions

## Code Conventions

- **TypeScript only**, strict mode
- No comments in source code
- Use `import type` for type-only imports
- Async/await throughout
- Named exports for modules, default export for plugin entry
- All RMUX SDK calls wrapped in try/catch with graceful fallback

## Build & Test

```bash
bun install                    # install dependencies
npx tsc --noEmit               # typecheck
npx vitest run                 # test
npx tsc                        # build dist/
```

## npm Publishing

```bash
npx tsc
npm publish
```

Package is registered as `opencode-rmux` on npm.

## GitHub Repository

- Repo: `https://github.com/<user>/opencode-rmux`
- Issues: bug reports, feature requests
- CI: GitHub Actions runs typecheck + test + build on PR
- Release: tag triggers publish workflow

## Important Links

- [RMUX Docs](https://rmux.io)
- [RMUX TypeScript SDK](https://www.npmjs.com/package/@rmux/sdk)
- [Opencode Plugin Docs](https://opencode.ai/docs/plugins)
- [Opencode SDK Docs](https://opencode.ai/docs/sdk)
- [Reference: opencode-cmux](https://github.com/0xCaso/opencode-cmux)
