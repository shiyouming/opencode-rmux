# opencode-rmux

**The only cross-platform opencode plugin for terminal multiplexer subagent pane management.** Works on **Windows**, **macOS**, and **Linux** — natively, no WSL required.

Bridges AI coding agent sessions with [RMUX](https://rmux.io) terminal multiplexer — real-time subagent pane management and AI-driven RMUX control tools.

---

## Why opencode-rmux?

|                          | opencode-cmux | opencode-tmux plugins | **opencode-rmux** |
|--------------------------|:---:|:---:|:---:|
| **Windows**              | ❌  | ⚠️ WSL | ✅ Native |
| **macOS**                | ✅  | ✅ | ✅ Native |
| **Linux**                | ❌  | ✅ | ✅ Native |
| **TypeScript SDK**       | ❌ CLI | ❌ CLI | ✅ @rmux/sdk |
| **Subagent Pane Mgmt**   | ✅  | ✅ | ✅ |
| **AI Control Tools**     | ❌  | ⚠️ Limited | ✅ 5 tools |

---

## Features

- **Subagent Pane Management** — When Opencode spawns subagents, automatically creates RMUX panes on the right side showing real-time subagent work
- **AI Custom Tools** — 5 tools that let the AI control RMUX directly
- **Cross-Platform** — Native support for **Windows**, **macOS**, and **Linux**

---

## Requirements

- [Opencode](https://opencode.ai) ≥ 1.0
- [RMUX](https://rmux.io) binary installed and on `$PATH`

Install Opencode:

```bash
npm install -g opencode-ai
```

Verify:

```bash
opencode --version
```

Install RMUX:

| Platform | Command |
|----------|---------|
| Windows | `winget install rmux` |
| macOS | `brew install rmux` |
| Linux | `curl -fsSL https://rmux.io/install.sh \| sh` |

Verify:

```bash
rmux --version
```

---

## Installation

### Automatic (recommended)

Add to your Opencode config file (`~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "plugin": ["opencode-rmux"],
  // ... other config
}
```

Restart Opencode — it will download the package automatically.

### Manual (development)

```bash
git clone https://github.com/ShiYouming/opencode-rmux.git
cd opencode-rmux
npm install
npm run build

# Windows
copy dist\index.js "%USERPROFILE%\.config\opencode\plugins\rmux.js"

# macOS/Linux
ln -sf "$PWD/dist/index.js" ~/.config/opencode/plugins/rmux.js
```

---

## Usage

Start Opencode **with `--port`** flag — required for subagent pane management:

```bash
opencode --port 0
```

`--port 0` assigns a random available port. The plugin discovers it automatically.

To use a fixed port:

```bash
opencode --port 14096
```

---

## Configuration

Config file: `~/.config/opencode/opencode-rmux.json`

If the file is missing or invalid, all options use defaults — **zero configuration required**.

```json
{
  "splits": true,
  "splitSize": "30%",
  "keepPaneOnIdle": false,
  "maxPanes": 4,
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
| `splits` | boolean | `true` | Enable subagent pane creation |
| `splitSize` | string | `"30%"` | Right panel width (e.g. `"30%"`, `"50%"`, `"300px"`) |
| `keepPaneOnIdle` | boolean | `false` | Keep pane open after subagent completes |
| `maxPanes` | number | `4` | Max subagent panes; oldest recycled when full |
| `debug` | boolean | `false` | Debug logging to stderr |
| `notifications.done` | boolean | `true` | Notify on subagent completion |
| `notifications.permission` | boolean | `true` | Notify on permission request |
| `notifications.question` | boolean | `true` | Notify on AI question |
| `notifications.error` | boolean | `true` | Notify on error |

### Example configs

**Disable notifications, keep panes**:

```json
{
  "splits": true,
  "keepPaneOnIdle": true,
  "notifications": { "done": false }
}
```

**Wider panel**:

```json
{
  "splits": true,
  "splitSize": "50%"
}
```

---

## Layout

```
+----------+------+
|          | ag1  |
|  Main    |------|
|  Area    | ag2  |
|  70%     |------|
|          | ag3  |
+----------+------+
```

- First subagent: horizontal split (right panel, default 30%)
- Subsequent subagents: stack vertically on the right
- Heights are automatically balanced
- At `maxPanes` limit: oldest pane is recycled
- With `keepPaneOnIdle: false` panes close automatically on completion

---

## Custom Tools

| Tool | Description |
|------|-------------|
| `rmux_list_sessions` | List all running RMUX sessions |
| `rmux_create_session` | Create a new RMUX session (optionally with startup command) |
| `rmux_send_keys` | Send keystrokes to an RMUX pane |
| `rmux_capture` | Capture pane screen content as text |
| `rmux_wait_for_text` | Wait for text pattern to appear in a pane |

---

## How It Works

| Event | Action |
|-------|--------|
| `session.created` + parentID | Create right pane, run `opencode attach` |
| `session.status` busy | Status bar notification "working" |
| `session.status` idle | Close pane, status bar notification "done" |
| `session.error` | Close pane, show error |
| `permission.asked` | Status bar notification |
| `permission.replied` | Clear pending state |

---

## Troubleshooting

### Right panel doesn't appear?

1. Make sure you started Opencode with `--port 0` (or a fixed port)
2. Check `"splits": true` in config
3. Verify RMUX is running (`rmux list-sessions`)

### Panel shows `Unable to connect`?

- Make sure Opencode was started with `--port`
- With `--port 0`, the plugin needs a moment to discover the port

### Disable panels?

```json
{ "splits": false }
```

---

## Development

```bash
npm install            # install dependencies
npm run typecheck      # tsc --noEmit
npm run build          # build dist/
npm test               # run tests
npm run prepublishOnly # typecheck + test + build
```

## License

MIT

---

## About This Project

This plugin was built entirely through AI pair programming — [Opencode](https://opencode.ai) + **DeepSeek V4 Flash**. Every line of code was written by AI agents, and their work was managed in real-time by the plugin itself. It's a meta showcase of the tool it provides.

**Why `opencode-rmux`?** The terminal multiplexer plugin ecosystem for Opencode has been fragmented by platform — `opencode-cmux` is macOS-only, tmux plugins exclude Windows users without WSL. `opencode-rmux` unifies the experience across Windows, macOS, and Linux with a modern TypeScript SDK, giving every Opencode user the same subagent pane management regardless of their operating system.
