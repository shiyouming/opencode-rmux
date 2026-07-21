# opencode-rmux

Opencode plugin that bridges AI coding agent sessions with [RMUX](https://rmux.io) terminal multiplexer — cross-platform subagent pane management and AI-driven RMUX control tools.

## Features

### Subagent Pane Management
When OpenCode spawns subagents, `opencode-rmux` automatically creates RMUX windows so you can see what each agent is doing in real time.

### AI Custom Tools
The plugin adds 5 custom tools that let the AI control RMUX directly:

| Tool | Description |
|------|-------------|
| `rmux_list_sessions` | List all running RMUX sessions |
| `rmux_create_session` | Create a new RMUX session (optionally with startup command) |
| `rmux_send_keys` | Send keystrokes to an RMUX pane |
| `rmux_capture` | Capture pane screen content as text |
| `rmux_wait_for_text` | Wait for text pattern to appear in a pane |

### Cross-Platform
Works on **Windows**, **macOS**, and **Linux** — RMUX runs natively on all three.

## Requirements

- [OpenCode](https://opencode.ai) ≥ 1.0
- [RMUX](https://rmux.io) binary installed and on `$PATH` (install: `winget install rmux`, `brew install rmux`, or `curl -fsSL https://rmux.io/install.sh | sh`)

## Installation

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-rmux"]
}
```

OpenCode will download the package automatically on next start.

### Local / Development

```bash
git clone https://github.com/ShiYouming/opencode-rmux.git
cd opencode-rmux
npm install
npm run build
# Windows: copy to plugins dir
copy "$PWD\dist\index.js" "$env:USERPROFILE\.config\opencode\plugins\rmux.js"
# macOS/Linux: symlink
ln -sf "$PWD/dist/index.js" ~/.config/opencode/plugins/rmux.js
```

## Configuration

Create `~/.config/opencode/opencode-rmux.json`:

```json
{
  "splits": true,
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
| `splits` | boolean | `true` | Create RMUX windows for subagent sessions |
| `splitSize` | string | `"30%"` | Width of the subagent panel (`"30%"`, `"40%"`, `"300px"`, etc.) |
| `keepPaneOnIdle` | boolean | `false` | Keep the pane open after the subagent completes |
| `maxPanes` | number | `4` | Maximum number of subagent panes (older ones recycled) |
| `debug` | boolean | `false` | Enable debug logging to stderr |
| `notifications.done` | boolean | `true` | Notify when a session completes |
| `notifications.permission` | boolean | `true` | Notify when OpenCode requests a permission |
| `notifications.question` | boolean | `true` | Notify when AI asks a question |
| `notifications.error` | boolean | `true` | Notify when a session errors |

## How It Works

The plugin hooks into OpenCode's lifecycle events:

| Event | Action |
|-------|--------|
| `session.created` + parentID | Create RMUX window for subagent |
| `session.deleted` | Close corresponding RMUX pane |
| `session.status` (busy/idle) | Update RMUX window title |
| `session.error` | Clean up pane |
| `permission.asked` / `permission.replied` | Track pending state |

## Development

```bash
npm install              # install dependencies
npm run typecheck        # tsc --noEmit
npm run build            # build dist/
npm run prepublishOnly   # typecheck + test + build
```

## License

MIT
