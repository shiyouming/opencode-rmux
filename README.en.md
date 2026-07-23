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
<tr><td><b>AI RMUX Tools</b></td><td>9 tools for AI to control RMUX directly: list/find panes, inspect pane details, send keys, capture, wait for text, stream observe, and more</td></tr>
<tr><td><b>Cross-Platform</b></td><td>Native Windows, macOS, Linux — no WSL required</td></tr>
<tr><td><b>TypeScript SDK</b></td><td>Built on official <code>@rmux/sdk</code> — type-safe, no CLI parsing</td></tr>
</table>

<p align="center">
  <video src="demo.mp4" width="720" controls>
    Your browser does not support the video tag.
  </video>
  <br>
  <em>Just the tip of the iceberg. <a href="TUTORIAL.en.md">See full tutorial →</a></em>
</p>

---

- [Why opencode-rmux](#why-opencode-rmux)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Layout](#layout)
- [Tools](#tools)
- [Events & Responses](#events--responses)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

---

## Why opencode-rmux?

|                          | opencode-cmux | opencode-tmux | **opencode-rmux** |
|--------------------------|:---:|:---:|:---:|
| **Windows**              | ❌  | ⚠️ WSL | ✅ Native |
| **macOS**                | ✅  | ✅ | ✅ Native |
| **Linux**                | ❌  | ✅ | ✅ Native |
| **TypeScript SDK**       | ❌ CLI parsing | ❌ CLI parsing | ✅ Official TypeScript SDK |
| **Subagent Panes**       | ✅ 3 pane limit | ✅ Unlimited | ✅ Configurable limit, auto-recycle |
| **AI RMUX Tools**        | ❌  | ⚠️ Partial | ✅ **9 dedicated tools** |
| **Pane Metadata**        | ❌  | ❌ | ✅ PID/command/size details |
| **Pane Search**          | ❌  | ❌ | ✅ Filter by session/command/status |
| **Stream Observe**       | ❌  | ❌ | ✅ Single/multi-pane real-time output |
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

Choose one of two methods:

**CLI command (recommended)**
```bash
opencode plugin opencode-rmux -g
```
Downloads the npm package and updates global config automatically.

**Manual config**
Add to your `~/.config/opencode/opencode.jsonc`:
```jsonc
{ "plugin": ["opencode-rmux"] }
```

Either way, restart Opencode — it downloads the plugin from npm automatically.

> **Note: the plugin does NOT auto-update.** Opencode caches npm plugins permanently and never checks for newer versions on startup.
> See "Updating" below for how to upgrade.

### Usage

```bash
opencode --port 0
```

`--port 0` assigns a random port. The plugin discovers it automatically. Use `--port 14096` for a fixed port.

### Updating

Opencode does **not** auto-update npm plugins, and the `-f` flag on `opencode plugin <module> -f` only forces config entry replacement — it does **not** re-download the npm package. The only reliable way: clear cache, then restart.

```bash
# Linux / macOS
rm -rf ~/.cache/opencode/packages/opencode-rmux

# Windows PowerShell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\opencode\cache\packages\opencode-rmux"
```

Restart Opencode — it re-downloads the latest version.

> If you haven't added the plugin to `opencode.jsonc` yet, run `opencode plugin opencode-rmux -g` after clearing cache, then restart.

---

## Quick Start

Installed? Try telling the AI in opencode:

```
Show me what terminal windows are running right now
```

If the AI answers you, the plugin is working. For more, check the [Tutorial](TUTORIAL.en.md).

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
| `rmux_find_panes` | Find panes by session name, command, title, or status |
| `rmux_pane_info` | Get detailed pane metadata (PID, command, dimensions) |
| `rmux_send_keys` | Send keystrokes to a specified pane |
| `rmux_capture` | Capture current pane screen content as text |
| `rmux_wait_for_text` | Wait for text pattern to appear in a pane (with timeout) |
| `rmux_observe` | Subscribe to pane output stream, return collected lines |
| `rmux_observe_multi` | Subscribe to multiple pane streams simultaneously |

---

## Events & Responses

The plugin responds automatically to these events — no manual action needed:

| What happens | What the plugin does |
|-------------|---------------------|
| Subagent created | Opens a right-side pane showing its work |
| Subagent working | Debug logging |
| Subagent completes | Closes pane, notifies "done" |
| Subagent errors | Closes pane, shows error |
| AI asks for permission | Notifies you, waits |
| AI has a question | Notifies you, waits for reply |

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

**Command sent but didn't execute ("Enter" typed as text)?**
- Make sure you're on the latest version (v1 had this bug)
- Format your command like `npm install Enter` — `Enter` is recognized as the Enter key

**AI can't find a pane?**
- Make sure the pane target format is correct, e.g. `opencode:0.1`
- Ask AI to run `rmux_find_panes` to list available panes first

**Disable panels?**
Add to your `opencode-rmux.json`:
```json
{ "splits": false }
```

**How to update to the latest version?**
Opencode does not auto-update plugins. Delete the cache directory and restart:
```bash
# Linux / macOS
rm -rf ~/.cache/opencode/packages/opencode-rmux

# Windows PowerShell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\opencode\cache\packages\opencode-rmux"
```

---

## Development

```bash
npm install       # install dependencies
npm run typecheck # tsc --noEmit
npm test          # run tests (98 test cases)
npm run build     # build dist/
```

Issues and Pull Requests welcome. Licensed under MIT — see [LICENSE](LICENSE).

## License

MIT

---

<p align="center">
  Built with Opencode + DeepSeek V4 Flash<br>
  <a href="https://github.com/shiyouming/opencode-rmux">GitHub</a> · <a href="https://www.npmjs.com/package/opencode-rmux">npm</a> · <a href="https://github.com/anomalyco/opencode/pull/38052">Opencode Ecosystem</a>
</p>
