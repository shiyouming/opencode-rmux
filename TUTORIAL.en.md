# opencode-rmux — Quick Start

> No commands to learn. Install the plugin, then just tell the AI what you want.

---

## Before You Start

This plugin lets you control terminals by chatting with AI. It needs **RMUX** (a terminal multiplexer, like tmux).

**Don't have RMUX?** Ask the AI to install it:

```
Install RMUX for me
```

The AI will give you the right command for your OS (Windows / macOS / Linux).

---

## Quick Demo (2 minutes)

Make sure RMUX is running and opencode has been restarted. Then tell the AI:

```
Show me what terminal windows are running right now
```

If the AI answers (e.g. "there's one opencode session"), the plugin is working.

If the AI doesn't understand, try:

| What you want | Say this |
|--------------|----------|
| List sessions | "What terminals do I have open?" |
| Check a pane | "What's running in the right panel?" |
| Run a command | "Run npm install in that panel" |
| Wait for output | "Tell me when it finishes" |

---

## What You Can Do

### 1. See what's running

```
What's in my terminal windows?
Which panel is running npm?
```

The AI scans all windows and panels and tells you what's where.

### 2. Read a pane's content

```
What's on that panel right now?
Did my build finish?
Show me the error message
```

The AI reads the screen for you — no need to switch windows.

### 3. Run commands in other panes

```
Run npm install in the right panel
Check what's using port 3000
Deploy the latest code
```

The AI types the command and presses Enter. Focus returns to your main panel when done.

### 4. Monitor and wait

```
Start the dev server and tell me when it's ready
Wait for the build to finish
Let me know if there's an error
```

The AI starts the process, watches the output, and notifies you when something happens.

### 5. Watch multiple panes at once

```
Show me both frontend and backend logs
Why is the build slow? Show me every step
```

The AI listens to multiple panes simultaneously and reports back.

### 6. Create new sessions

```
Open a new session and run htop
Create a separate workspace for debugging
```

The AI creates a new RMUX session with whatever program you specify.

### 7. Auto-panels for subagents — fully automatic

When the AI spawns subagents to work in parallel, you'll see panels appear on the right:

```
+----------+------+
|          |subag |
|  Chat    |ent w |
|  Panel   |orking|
+----------+------+
```

Multiple subagents stack vertically. Each panel closes automatically when the subagent finishes. You just wait for results in the main panel.

---

## Real-World Scenarios

### Debugging: "My service won't start"

```
You: My web service says the port is taken, can you check?
```

The AI will:
1. Find which panel is running your service
2. Read the error message
3. Check what's using the port
4. Tell you the result and suggest a fix

You said one sentence. The AI did the rest.

### Deploy: "Deploy the latest code"

```
You: Deploy the latest code for me
```

The AI handles the whole pipeline: pull → build → start → confirm.

---

## If the AI Doesn't Understand

Try rewording:

| What you want | Say this |
|--------------|----------|
| List things | "What's in my terminals" |
| Check a pane | "Look at the right panel" |
| Run something | "Run X in that panel" |
| Wait | "Tell me when it's done" |
| Watch logs | "Watch the output for me" |

Still stuck? Describe what you want to see:

```
Show me what's on the right panel screen
```

The AI will figure out which tool to use.

---

## Configuration

The plugin works with defaults — no config needed. To customize, create:

**Windows:**
```
%USERPROFILE%\.config\opencode\opencode-rmux.json
```

**macOS / Linux:**
```
~/.config/opencode/opencode-rmux.json
```

```json
{
  "splits": true,
  "splitSize": "30%",
  "keepPaneOnIdle": false,
  "maxPanes": 4,
  "notifications": {
    "done": true,
    "error": true
  }
}
```

| Option | Default | What it does |
|--------|---------|-------------|
| `splits` | `true` | Auto-split for subagents |
| `splitSize` | `"30%"` | Width of the right panel |
| `keepPaneOnIdle` | `false` | Keep panel after subagent finishes |
| `maxPanes` | `4` | Max subagent panels at once |
| `notifications.done` | `true` | Notify on completion |
| `notifications.error` | `true` | Notify on error |

Restart opencode after changing config.
