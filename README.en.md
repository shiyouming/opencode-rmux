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
<tr><td><b>Subagent Panes</b></td><td>When Opencode spawns subagents, automatically creates RMUX panes showing real-time work. First agent splits right, subsequent stack vertically with auto-balanced heights</td></tr>
<tr><td><b>AI RMUX Tools</b></td><td>5 tools for AI to control RMUX directly: list sessions, create session, send keys, capture pane, wait for text</td></tr>
<tr><td><b>Cross-Platform</b></td><td>Native Windows, macOS, Linux — no WSL required</td></tr>
<tr><td><b>TypeScript SDK</b></td><td>Built on official <code>@rmux/sdk</code> — type-safe, no CLI parsing</td></tr>
</table>

---

## Why opencode-rmux?

|                          | opencode-cmux | opencode-tmux | **opencode-rmux** |
|--------------------------|:---:|:---:|:---:|
| **Windows**              | ❌  | ⚠️ WSL | ✅ Native |
| **macOS**                | ✅  | ✅ | ✅ Native |
| **Linux**                | ❌  | ✅ | ✅ Native |
| **TypeScript SDK**       | ❌ CLI parsing | ❌ CLI parsing | ✅ Official TypeScript SDK |
| **Subagent Panes**       | ✅ 3 pane limit | ✅ Varies by plugin | ✅ Configurable limit, auto-recycle |
| **AI RMUX Tools**        | ❌  | ⚠️ Partial | ✅ 5 dedicated tools |
| **Auto-Balance Heights** | ❌  | ❌ | ✅ After every split |

---

## Installation

### Prerequisites

**Opencode**
```bash
npm install -g opencode-ai
```

**RMUX**

Windows
```bash
winget install rmux
```

macOS
```bash
brew install rmux
```

Linux
```bash
curl -fsSL https://rmux.io/install.sh | sh
```

### Plugin

Add to your Opencode config `~/.config/opencode/opencode.jsonc`:

```jsonc
{ "plugin": ["opencode-rmux"] }
```

Restart Opencode — it downloads automatically.

### Usage

```bash
opencode --port 0
```

`--port 0` assigns a random port. The plugin discovers it automatically. Use `--port 14096` for a fixed port.

---

## Configuration

File: `~/.config/opencode/opencode-rmux.json`. If missing, all options use defaults — **zero configuration required**.

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
| `splitSize` | string | `"30%"` | Right panel width (e.g. `"30%"`, `"50%"`) |
| `keepPaneOnIdle` | boolean | `false` | Keep pane after subagent completes |
| `maxPanes` | number | `4` | Max panes; oldest recycled when full |
| `debug` | boolean | `false` | Debug logging to stderr |
| `notifications.done` | boolean | `true` | Subagent completion notification |
| `notifications.permission` | boolean | `true` | Permission request notification |
| `notifications.question` | boolean | `true` | AI question notification |
| `notifications.error` | boolean | `true` | Error notification |

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

- **First subagent**: Horizontal split (right panel, default 30% width via `splitSize`)
- **Subsequent subagents**: Vertical splits from the last pane, stacking downward
- **Height balancing**: Each split triggers `resize-pane` to equalize all right-side pane heights
- **Pane recycling**: At `maxPanes` limit, oldest pane is force-closed for the new one
- **Cleanup**: With `keepPaneOnIdle: false`, panes close immediately on subagent completion

---

## Tools

| Tool | Description |
|------|-------------|
| `rmux_list_sessions` | List all RMUX sessions with window/pane info |
| `rmux_create_session` | Create a new session (optionally with startup command) |
| `rmux_send_keys` | Send keystrokes to a specified pane |
| `rmux_capture` | Capture current pane screen content as text |
| `rmux_wait_for_text` | Wait for text pattern to appear in a pane (with timeout) |

---

## How It Works

| Event | Action |
|-------|--------|
| `session.created` + parentID | Create right pane, run `opencode attach` to connect subagent session |
| `session.status` busy | Status bar notification "working" |
| `session.status` idle | Close pane, status bar notification "done" |
| `session.error` | Close pane, show error |
| `permission.asked` | Track pending permission, status bar notification |
| `permission.replied` | Clear pending permission state |
| `question.asked` | Track pending question, status bar notification |
| `question.replied` / `question.rejected` | Clear pending question state |

> Subagents don't emit `session.deleted` — cleanup relies on `session.status` idle.

---

## Troubleshooting

**Right panel missing?**
- Make sure you run `opencode --port 0`
- Check `"splits": true` in config
- Verify RMUX is running (`rmux list-sessions`)

**Unable to connect?**
- Ensure `--port` flag is used when starting Opencode
- With `--port 0`, wait a moment for port discovery

**Disable panels?**
```json
{ "splits": false }
```

---

## Development

```bash
npm install       # install dependencies
npm run typecheck # tsc --noEmit
npm test          # run tests (62 test cases)
npm run build     # build dist/
```

## License

MIT

---

<p align="center">
  Built with Opencode + DeepSeek V4 Flash<br>
  <a href="https://github.com/shiyouming/opencode-rmux">GitHub</a> · <a href="https://www.npmjs.com/package/opencode-rmux">npm</a> · <a href="https://github.com/anomalyco/opencode/pull/38052">Opencode Ecosystem</a>
</p>
