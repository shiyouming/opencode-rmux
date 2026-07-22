<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/Lang-中文-red?style=for-the-badge" alt="中文"></a>
  <a href="https://rmux.io"><img src="https://img.shields.io/badge/built%20on-RMUX-000000?style=for-the-badge" alt="Built on RMUX"></a>
  <a href="https://www.npmjs.com/package/opencode-rmux"><img src="https://img.shields.io/npm/v/opencode-rmux?style=for-the-badge" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT"></a>
  <a href="https://github.com/shiyouming/opencode-rmux"><img src="https://img.shields.io/github/stars/shiyouming/opencode-rmux?style=for-the-badge" alt="Stars"></a>
</p>

# opencode-rmux

<p align="center">
  Opencode plugin for RMUX terminal multiplexer · Real-time subagent pane management · AI-driven RMUX control tools<br>
  <b>The only cross-platform plugin that runs natively on Windows, macOS, and Linux</b>
</p>

<table>
<tr><td><b>Subagent Panes</b></td><td>Auto-creates RMUX panes to display subagent work in real-time. First agent splits right, subsequent stack vertically with auto-balanced heights</td></tr>
<tr><td><b>AI RMUX Tools</b></td><td>5 tools for AI to control RMUX directly: list sessions, create session, send keys, capture pane, wait for text</td></tr>
<tr><td><b>Cross-Platform</b></td><td>Native Windows, macOS, Linux — no WSL required</td></tr>
<tr><td><b>TypeScript SDK</b></td><td>Built on official <code>@rmux/sdk</code> — type-safe, no CLI parsing</td></tr>
</table>

---

## Installation

### Prerequisites

- [Opencode](https://opencode.ai) ≥ 1.0: `npm install -g opencode-ai`
- [RMUX](https://rmux.io): see below

**Windows**
```bash
winget install rmux
```

**macOS**
```bash
brew install rmux
```

**Linux**
```bash
curl -fsSL https://rmux.io/install.sh | sh
```

### Plugin

Add to your Opencode config (`~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "plugin": ["opencode-rmux"]
}
```

Restart Opencode — it downloads automatically.

### Usage

```bash
opencode --port 0
```

`--port 0` assigns a random port. The plugin discovers it automatically. Use `--port 14096` for a fixed port.

---

## Configuration

File: `~/.config/opencode/opencode-rmux.json`. If missing, all options use defaults — zero config required.

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
| `splitSize` | string | `"30%"` | Right panel width (e.g. `"30%"`, `"50%"` |
| `keepPaneOnIdle` | boolean | `false` | Keep pane after subagent completes |
| `maxPanes` | number | `4` | Max panes; oldest recycled when full |
| `debug` | boolean | `false` | Debug logging to stderr |
| `notifications.*` | boolean | `true` | Per-type notification toggles |

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

---

## Why opencode-rmux?

|                          | opencode-cmux | opencode-tmux | **opencode-rmux** |
|--------------------------|:---:|:---:|:---:|
| **Windows**              | ❌  | ⚠️ WSL | ✅ Native |
| **macOS**                | ✅  | ✅ | ✅ Native |
| **Linux**                | ❌  | ✅ | ✅ Native |
| **TypeScript SDK**       | ❌ CLI | ❌ CLI | ✅ @rmux/sdk |
| **Subagent Panes**       | ✅  | ✅ | ✅ |
| **AI RMUX Tools**        | ❌  | ⚠️ Limited | ✅ 5 tools |

---

## Tools

| Tool | Description |
|------|-------------|
| `rmux_list_sessions` | List all RMUX sessions |
| `rmux_create_session` | Create a new session |
| `rmux_send_keys` | Send keystrokes to a pane |
| `rmux_capture` | Capture pane screen content |
| `rmux_wait_for_text` | Wait for text pattern in pane |

---

## How It Works

| Event | Action |
|-------|--------|
| `session.created` + parentID | Create right pane, run `opencode attach` |
| `session.status` busy | Status bar notification |
| `session.status` idle | Close pane |
| `session.error` | Close pane, notify error |
| `permission.asked` / `replied` | Track pending state |
| `question.asked` / `replied` / `rejected` | Track pending state |

---

## Troubleshooting

**Right panel missing?** Make sure you run `opencode --port 0`, `"splits": true`, and RMUX is running.

**Unable to connect?** Ensure `--port` flag is used. With `--port 0`, wait a moment for port discovery.

**Disable panels?** `{ "splits": false }`

---

## Development

```bash
npm install       # install dependencies
npm run typecheck # tsc --noEmit
npm run build     # build dist/
npm test          # run tests
```

## License

MIT

---

<p align="center">
  Built with Opencode + DeepSeek V4 Flash<br>
  <a href="https://github.com/shiyouming/opencode-rmux">GitHub</a> · <a href="https://www.npmjs.com/package/opencode-rmux">npm</a> · <a href="https://github.com/anomalyco/opencode/pull/38052">opencode Ecosystem</a>
</p>
