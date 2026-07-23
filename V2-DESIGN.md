# opencode-rmux v2 架构设计

Opencode 插件 v2.0 重构方案，合并代码清理与新功能（终端 AI agent 流式观测、pane 查找、pane 元数据）。

---

## 1. 总体架构

### 1.1 文件结构

```
src/
├── index.ts       # 插件入口（SessionManager 构造参数变更，传入 PermissionState/QuestionState）
├── types.ts       # 【新建】所有共享类型，从 rmux.ts/sessions.ts/config.ts 合并
├── config.ts      # 配置加载（基本不变）
├── lsof.ts        # 端口发现（不变）
├── rmux.ts        # RMUXManager — SDK 优先，cmd() 补齐只用于读取元数据
├── state.ts       # 【新建】PermissionState / QuestionState（从 SessionManager 提取）
├── sessions.ts    # SessionManager — 仅事件处理 + split 队列，委托 state.ts
├── monitor.ts     # 【新建】MonitorManager — PaneOutputStream 流管理
└── tools.ts       # 9 个工具定义（5 现有 + 4 新增）
```

### 1.2 模块依赖关系

```
index.ts
  ├── config.ts        (配置加载)
  ├── lsof.ts          (端口发现)
  ├── rmux.ts          (RMUX SDK 封装 + cmd 补齐)
  │     └── types.ts   (PaneMeta, SessionMeta, StreamEvent...)
  ├── sessions.ts      (事件驱动的子代理面板管理)
  │     ├── rmux.ts
  │     ├── state.ts   (权限/问题追踪)
  │     └── config.ts
  ├── monitor.ts       (流式观测)
  │     ├── rmux.ts
  │     └── types.ts
  └── tools.ts         (9 个自定义工具)
        ├── rmux.ts
        └── monitor.ts  (rmux_wait_for_text, rmux_observe 依赖)
```

### 1.3 数据流：cmd() 补齐读取

```
工具调用
  ↓
RMUXManager.findPanes() / getPaneMeta() / getSessionMetas()
  ↓
client.cmd("list-panes", "-F", "#{format}...")   ← TS SDK 无此功能，走 cmd
  ↓
解析竖线分隔文本为 PaneMeta[] / SessionMeta[]
  ↓
返回结构化数据给调用方
```

---

## 2. 类型系统 (`types.ts`)

### 2.1 PaneMeta（新增 — cmd() 补齐读取用）

```typescript
export interface PaneMeta {
  sessionName: string
  windowIndex: number
  paneIndex: number
  paneId: string           // 格式 "%N"
  active: boolean
  width: number
  height: number
  dead: boolean
  deadStatus: number | null
  pid: number | null       // #{pane_pid}
  title: string            // #{pane_title}
  currentCommand: string   // #{pane_current_command}
}
```

### 2.2 SessionMeta（新增 — cmd() 补齐读取用）

```typescript
export interface SessionMeta {
  name: string
  windows: number
  attached: number
  width: number
  height: number
}
```

### 2.3 StreamEvent（新增 — monitor.ts 用）

```typescript
export type StreamEventType = 'line' | 'data' | 'render'

export interface StreamEvent {
  type: StreamEventType
  data: string
  timestamp: number
  paneTarget: string
}
```

### 2.4 SplitOp（从 sessions.ts 移入）

```typescript
export interface SplitOp<T = unknown> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}
```

### 2.5 其他共享类型

```typescript
// 从 config.ts re-export（保持定义在 config.ts，types.ts 做中转）
// 这样 sessions.ts/index.ts 的 import { RMUXPluginConfig } from "./config.js" 无需改动
export type { RMUXPluginConfig } from "./config.js"

// 从 rmux.ts 移入
export interface SessionInfo {
  name: string
  created: boolean
}
// @deprecated 由 SessionMeta 替代，v2.1 移除
```

```typescript
// 新增（为未来模糊匹配预留，v2.0 未使用）
export type MatchLevel = 'exact' | 'fuzzy' | 'none'
```

---

## 3. RMUXManager 重构 (`rmux.ts`)

### 3.1 原则

| 操作类别 | 处理方式 |
|---------|---------|
| **写入操作** (close, resize, sendKeys, split) | SDK 方法优先（底层也是 cmd，但有类型安全） |
| **读取操作** (list pane meta, find panes, get session info) | cmd() 补齐（TS SDK 无此 API） |
| **session.kill()** | SDK `session.kill()` 替换 `cmd("kill-session")` |
| **balanceRightPanes** | SDK `pane.resize()` 优先，cmd 回退保留 |

### 3.2 改动清单

| 现有方法 | 改动 |
|---------|------|
| `sendKeys(target, keys)` | 不变—SDK 层已接受单 target 字符串，仅 tools 层合并参数 |
| `captureTarget(target)` | 不变—SDK 层已接受单 target 字符串，仅 tools 层合并参数 |
| `closePane(pane)` | 已用 `pane.close()`，当前无调用方（SessionManager 改用 closeTarget），**保留以备将来直接传 Pane 对象的场景**，计划 v2.1 `@deprecated` |
| `closeTarget(target)` | **新增** — `cmd("kill-pane", "-t", target)` 直接封装，供 SessionManager 用无需 Pane 对象 |
| `paneFromTarget(target)` | **新增** — `new Pane(client, target)` 构造 Pane 对象，供 MonitorManager 用 |
| `closeSession(name)` | `cmd("kill-session")` → 优先 `session.kill()`，失败则 fallback 到 `cmd("kill-session")` |
| `balanceRightPanes()` | SDK `pane.resize()` 优先，try/catch fallback 到 `cmd("resize-pane")` |
| `cmd(...args)` | **保留** — 作为通用 cmd 接口 |

### 3.3 新增方法

#### `listPaneMetas(): Promise<PaneMeta[]>`

遍历所有 session 的所有 pane，返回完整元数据。
注意：这里直接使用 `this.client.cmd()` 而非 `this.cmd()`，因为需要 `CommandRun` 原始返回值（stdout）。`this.cmd()` 包装器在错误时 throw，不适用于格式解析场景。

```typescript
async listPaneMetas(): Promise<PaneMeta[]> {
  if (!this.client) throw new Error("RMUX not connected")
  const raw = await this.client.cmd(
    "list-panes", "-a", "-F",
    "#{session_name}|#{window_index}|#{pane_index}|#{pane_id}|" +
    "#{pane_active}|#{pane_width}|#{pane_height}|#{pane_dead}|" +
    "#{pane_dead_status}|#{pane_pid}|#{pane_title}|#{pane_current_command}"
  )
  return raw.stdout.trim().split("\n")
    .filter(Boolean)
    .map(line => this.parsePaneMetaLine(line))
}
```

#### `findPanes(query: FindPanesQuery): Promise<PaneMeta[]>`

显式定义搜索接口而非 `Partial<PaneMeta>`，只暴露对 agent 有意义的搜索字段。注意每次调用都会走 `list-panes -a` daemon 请求（无缓存），高频调用可考虑加 TTL 缓存。

```typescript
export interface FindPanesQuery {
  sessionName?: string
  currentCommand?: string
  title?: string
  active?: boolean
  dead?: boolean
}

async findPanes(query: FindPanesQuery): Promise<PaneMeta[]> {
  const all = await this.listPaneMetas()
  return all.filter(pane =>
    Object.entries(query).every(([key, val]) =>
      val === undefined || val === null || (pane as any)[key] === val
    )
  )
}
```

#### `getPaneMeta(target: string): Promise<PaneMeta>`

读单个 pane 的元数据。

```typescript
async getPaneMeta(target: string): Promise<PaneMeta> {
  if (!this.client) throw new Error("RMUX not connected")
  const raw = await this.client.cmd(
    "display-message", "-p", "-t", target, "-F",
    "#{session_name}|#{window_index}|#{pane_index}|#{pane_id}|" +
    "#{pane_active}|#{pane_width}|#{pane_height}|#{pane_dead}|" +
    "#{pane_dead_status}|#{pane_pid}|#{pane_title}|#{pane_current_command}"
  )
  return this.parsePaneMetaLine(raw.stdout.trim())
}
```

#### `getSessionMetas(): Promise<SessionMeta[]>`

```typescript
async getSessionMetas(): Promise<SessionMeta[]> {
  if (!this.client) throw new Error("RMUX not connected")
  const raw = await this.client.cmd(
    "list-sessions", "-F",
    "#{session_name}|#{session_windows}|#{session_attached}|" +
    "#{session_width}|#{session_height}"
  )
  return raw.stdout.trim().split("\n")
    .filter(Boolean)
    .map(line => {
      const [name, windows, attached, width, height] = line.split("|")
      return {
        name, windows: Number(windows), attached: Number(attached),
        width: Number(width), height: Number(height),
      }
    })
}
```

#### `getCurrentCommand(target: string): Promise<string | null>`

快速查 pane 的前台进程（最常用的元数据查询）。

```typescript
async getCurrentCommand(target: string): Promise<string | null> {
  if (!this.client) return null
  try {
    const raw = await this.client.cmd(
      "display-message", "-p", "-t", target, "-F", "#{pane_current_command}"
    )
    return raw.stdout.trim() || null
  } catch {
    return null
  }
}
```

#### `paneFromTarget(target: string): Pane | null`

从 target 字符串构造 SDK `Pane` 对象。TS SDK 的 `PaneOutputStream.open(pane)` 和 `PaneLineStream` 构造都需要 `Pane` 对象，而工具函数只有 target 字符串，此方法桥接两者。

```typescript
import { Pane } from "@rmux/sdk"

paneFromTarget(target: string): Pane | null {
  if (!this.client) return null
  return new Pane(this.client, target)
}
```

#### `closeTarget(target: string): Promise<void>`

按 target 字符串关闭 pane（不走 Pane 对象）。SessionManager 的 `activeSplits` 存储 string 而非 Pane 对象，用此方法代替 `pane.close()`。

```typescript
async closeTarget(target: string): Promise<void> {
  if (!this.client) return
  try { await this.client.cmd("kill-pane", "-t", target) } catch {}
}
```

#### `closeSession(name: string): Promise<void>`

关闭 session。SDK 优先 + cmd fallback，见 §8.4 设计决策。

```typescript
async closeSession(name: string): Promise<void> {
  if (!this.client) return
  try {
    const session = this.client.session(name)
    await session.kill()
    return
  } catch {
    // session 对象不存在或 kill 失败 → fallback
  }
  try { await this.client.cmd("kill-session", "-t", name) } catch {}
}
```

### 3.5 parsePaneMetaLine 边界处理

所有 format 字段解析集中在一个方法，处理布尔/数字/空值边界。

```typescript
private parsePaneMetaLine(line: string): PaneMeta {
  const parts = line.split("|")
  return {
    sessionName: parts[0],
    windowIndex: Number(parts[1]),
    paneIndex: Number(parts[2]),
    paneId: parts[3],
    active: parts[4] === "1" || parts[4] === "true",    // 兼容两种格式
    width: Number(parts[5]),
    height: Number(parts[6]),
    dead: parts[7] === "1" || parts[7] === "true",
    deadStatus: parts[8] !== "" ? Number(parts[8]) : null, // 空串 → null；"0"（退出码 0）正确保留
    pid: parts[9] !== "" ? Number(parts[9]) : null,
    title: parts[10] ?? "",
    currentCommand: parts[11] ?? "",
  }
}
```

### 3.6 Format 格式参考

#### `list-panes -a -F` 完整格式串

```
#{session_name}|#{window_index}|#{pane_index}|#{pane_id}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_dead}|#{pane_dead_status}|#{pane_pid}|#{pane_title}|#{pane_current_command}
```

分隔符选 `|` 因为它在典型 pane 元数据中与字段值冲突概率低。注意 `#{pane_title}` 理论上可含 `|`，极端情况需处理。

#### `list-sessions -F` 完整格式串

```
#{session_name}|#{session_windows}|#{session_attached}|#{session_width}|#{session_height}
```

`#{session_created}` 也可用，需 `#{t:session_created}` 时间格式化修饰符。

#### `display-message -p -t <target> -F`

支持与 `list-panes` 相同的 format 变量，可以获取单个 pane 的任意字段组合。

### 3.7 SDK 方法对照表

| 操作 | TS SDK 方法 | 底层实际命令 | v2 是否使用 |
|------|-----------|------------|-----------|
| sendKeys | `server.sendKeys(target, keys)` | `send-keys -t <target> <keys>` | ✅ SDK |
| sendText | `sendTextToPane(pane, text)` 封装 `pane.sendText(text)` | `send-keys -t <target> <text>` | ✅ SDK |
| capture | `pane.captureText()` | `capture-pane -t <target> -p` | ✅ SDK |
| split | `pane.split({direction})` | `split-window -P -F "#{pane_id}"` | ✅ SDK |
| close | `pane.close()` | `kill-pane -t <target>` | ✅ SDK |
| resize | `pane.resize({height})` | `resize-pane -t <target> -y <height>` | ✅ SDK (回退 cmd) |
| kill session | `session.kill()` | `kill-session -t <target>` | ✅ SDK |
| list sessions | `server.listSessions()` | `list-sessions` | ✅ SDK |
| **closeTarget** | ❌ 无 | `cmd("kill-pane", "-t", target)` | **新增 cmd 封装** |
| **paneFromTarget** | ❌ 无 | `new Pane(client, target)` 构造 | **新增 SDK 构造** |
| **list pane meta** | ❌ 无 | `list-panes -a -F "..."` | **cmd() 补齐** |
| **find panes** | ❌ 无 | `list-panes -a -F "..."` + JS 过滤 | **cmd() 补齐** |
| **pane.info()** | ❌ 无 | `display-message -p -t -F "..."` | **cmd() 补齐** |
| **pane.currentCommand** | ❌ 无 | `display-message -p -t -F "#{pane_current_command}"` | **cmd() 补齐** |
| **session.info()** | ❌ 无 | `list-sessions -F "..."` | **cmd() 补齐** |

### 3.8 现有方法兼容说明

| 方法 | 兼容处理 |
|------|---------|
| `listSessions()` | 对 SDK 返回的 session 对象用 `s.session_name ?? s.name` 兼容不同 SDK 版本的字段名差异 |
| `getSessionMetas()`（新增） | 绕过 SDK listSessions 改用 `client.cmd("list-sessions", "-F", ...)`，格式由我们控制，无需 shim |

---

## 4. 状态管理 (`state.ts`) — NEW

从 SessionManager 提取权限/问题追踪，职责单一、可测试。

```typescript
export class PermissionState {
  private pending = new Set<string>()

  track(id: string): boolean     // 返回是否是新记录
  resolve(id: string): void
  isPending(id: string): boolean
  get pendingCount(): number
  clear(): void
}

export class QuestionState {
  private pending = new Set<string>()

  track(id: string): boolean
  resolve(id: string): void
  isPending(id: string): boolean
  get pendingCount(): number
  clear(): void
}
```

---

## 5. SessionManager 清理 (`sessions.ts`)

### 5.1 移除 & 内部迁移

| 项 | 变更 |
|----|------|
| `pendingPermissions: Set<string>` | → `state.ts PermissionState` |
| `pendingQuestions: Set<string>` | → `state.ts QuestionState` |
| `hasPendingInput()` public 方法 | **保留**，内部实现改为 `(permission.pendingCount + question.pendingCount) > 0`；tests 依赖此方法 |
| `cmd("kill-pane")` | → `rmux.closeTarget(target)` — 保持 string 存储不变，不存 Pane 对象 |

### 5.2 保留内容

- 事件监听派发（`handleEvent`）
- split 队列（`enqueueSplitOp`）
- 通知（`notify`）
- 布局管理（`onSessionCreated` 委托 rmux.createAgentPane() + 调用 rmux.balanceRightPanes()）

### 5.3 简化后结构

```typescript
export class SessionManager {
  private permission: PermissionState
  private question: QuestionState

  constructor(
    rmux: RMUXManager,
    config: RMUXPluginConfig,
    permission: PermissionState,
    question: QuestionState,
  ) {
    this.rmux = rmux
    this.config = config
    this.permission = permission
    this.question = question
  }
  // ... rest unchanged
}
```

---

## 6. MonitorManager (`monitor.ts`) — NEW

### 6.1 设计

使用 TS SDK 的 `PaneOutputStream` / `PaneLineStream` / `PaneRenderStream`（`streams.d.ts`）。

### 6.2 API

```typescript
export interface StreamHandle {
  id: string
  stop(): Promise<void>
}

export class MonitorManager {
  private streams = new Map<string, AbortController>()

  // 启动流式监听，返回句柄
  async startLineStream(pane: Pane, opts: {
    onLine?: (line: string) => void
    onError?: (err: Error) => void
  }): Promise<StreamHandle>

  async startRawStream(pane: Pane, opts: {
    onData?: (chunk: PaneOutputChunk) => void
    onError?: (err: Error) => void
  }): Promise<StreamHandle>

  async startRenderStream(pane: Pane, opts: {
    onRender?: (snapshot: PaneSnapshot) => void
    onError?: (err: Error) => void
  }): Promise<StreamHandle>

  // 停止流
  stopStream(id: string): Promise<void>
  stopAll(): Promise<void>

  // 阻塞等待模式（给 rmux_observe 工具用）
  async collectLines(
    pane: Pane,
    opts: { timeout: number; maxLines: number }
  ): Promise<{ lines: string[]; stoppedReason: "timeout" | "maxLines" | "streamEnd" | "error" }>

  // 等待文本模式匹配
  async waitForPattern(
    pane: Pane,
    pattern: string | RegExp,
    opts?: { timeout?: number }
  ): Promise<string | null>
}
```

### 6.3 实现细节

SDK 的 `PaneLineStream` 没有静态 `.open()` 方法。正确用法：
```typescript
const output = await PaneOutputStream.open(pane)
const stream = new PaneLineStream(output)
```

`PaneOutputStream.next(timeout)` 的超时行为无保证（返回类型不含 nullable），必须外层 `Promise.race` 兜底：

```typescript
interface CollectLinesResult {
  lines: string[]
  stoppedReason: "timeout" | "maxLines" | "streamEnd" | "error"
}

async collectLines(pane: Pane, opts: { timeout: number; maxLines: number }): Promise<CollectLinesResult> {
  const output = await PaneOutputStream.open(pane)
  const stream = new PaneLineStream(output)
  const lines: string[] = []
  let stoppedReason: CollectLinesResult["stoppedReason"] = "timeout"
  const deadline = Date.now() + opts.timeout * 1000

  try {
    while (Date.now() < deadline && lines.length < opts.maxLines) {
      const remaining = Math.max(0, deadline - Date.now())
      const line = await Promise.race([
        stream.next(1),
        new Promise<string | null>(resolve =>
          setTimeout(() => resolve(null), remaining)
        ),
      ])
      if (line === null) { stoppedReason = "streamEnd"; break }
      lines.push(line)
    }
    if (lines.length >= opts.maxLines) stoppedReason = "maxLines"
  } catch {
    stoppedReason = "error"
  } finally {
    await stream.close().catch(() => {})
  }

  return { lines, stoppedReason }
}
```

注意：`PaneLineStream` 构造函数在 `streams.d.ts:21-22` 定义为：
```typescript
constructor(output: PaneOutputStream)
```
`PaneOutputStream` 使用静态工厂 `PaneOutputStream.open(pane: Pane)`。

### 6.4 工具接口

`rmux_observe` 返回格式（块式返回，timeout 或 maxLines 触发停止）：

```json
{
  "lines": [...],
  "stoppedReason": "timeout" | "maxLines" | "streamEnd" | "error",
  "totalLines": 42
}
```

### 6.5 测试策略

**单元测试**（无需 RMUX daemon）：
- Mock `PaneOutputStream.open = vi.fn().mockResolvedValue(mockOutput)` 返回可控 stream
- Mock `PaneLineStream.next()` 依次返回预设行序列，配合 `vi.useFakeTimers()` 测试 timeout
- `collectLines` 必测路径：正常累积 → maxLines 截断 → timeout → streamEnd（next 返回 null）→ catch 异常

**集成测试**（需 RMUX daemon/复杂 mock）列为 future work，Phase 2 不实现。

---

## 7. 工具集 (`tools.ts`) — 9 个工具

### 7.1 工具总表

| 工具 | 类别 | 依赖 | 说明 |
|------|------|------|------|
| `rmux_list_sessions` | 现有 | SDK `listSessions()` | 增强：返回 `name (N windows, M attached, WxH)` 格式 |
| `rmux_create_session` | 现有 | SDK `ensureSession()` | 增强：返回 `Created session "name" (N windows, M attached)` |
| `rmux_send_keys` | 现有 | SDK `sendKeys()` | target 改为单字符串（原 session+target 合并） |
| `rmux_capture` | 现有 | SDK `captureTarget()` | target 改为单字符串（原 session+target 合并） |
| `rmux_wait_for_text` | 现有 | `waitForPattern()` | target 改为单字符串 + MonitorManager 流式匹配重写，替代轮询 capture |
| `rmux_find_panes` | **新** | RMUXManager.findPanes() | 按 session/pane/命令等搜索 |
| `rmux_pane_info` | **新** | RMUXManager.getPaneMeta() | 单个 pane 完整元数据 |
| `rmux_observe` | **新** | MonitorManager.collectLines() | 订阅 pane 输出，块式返回 |
| `rmux_observe_multi` | **新** | MonitorManager 多实例 | 多面板同时订阅 |

### 7.2 工具接口设计

v2 统一所有工具的 target 参数为单字符串格式（如 `"demo:%1"` 或 `"%1"`），不再 split `session` + `target`。`rmux_send_keys` 和 `rmux_capture` 随之更新。

#### `rmux_send_keys` (更新)

```
输入:
  target: string       — pane target（如 "%1" 或 "demo:0.1"）
  keys: string         — 要发送的按键序列

输出:
  string               — 操作结果确认
```

#### `rmux_capture` (更新)

```
输入:
  target: string       — pane target（如 "%1" 或 "demo:0.1"）

输出:
  string               — pane 文本内容
```

#### `rmux_wait_for_text` (更新)

```
输入:
  target: string       — pane target（如 "%1" 或 "demo:0.1"）
  pattern: string      — 要等待的文本模式
  timeout?: number     — 超时秒数（默认 30）

输出:
  string               — 匹配结果或超时提示
```

#### `rmux_find_panes`

```
输入:
  sessionName?: string  — 按 session 筛选
  currentCommand?: string — 按前台进程名筛选（如 "claude", "python"）
  title?: string       — 按 pane 标题筛选
  active?: boolean     — 是否只返回活跃 pane
  dead?: boolean       — 是否只返回已退出的 pane

输出:
  panes: PaneMeta[]    — 匹配的所有 pane
  count: number
```

用途：agent 可以搜索指定名字的 session 下运行特定命令的 pane。

#### `rmux_pane_info`

```
输入:
  target: string       — pane target（如 "%1" 或 "demo:0.1"）

输出:
  PaneMeta             — 完整 pane 元数据
```

#### `rmux_observe`

```
输入:
  target: string       — pane target（如 "%1" 或 "demo:0.1"）
  timeout?: number     — 等待超时秒数（默认 15，注意 opencode tool 执行可能有超时上限）
  maxLines?: number    — 最大返回行数（默认 100）

输出:
  lines: string[]
  stoppedReason: "timeout" | "maxLines" | "streamEnd" | "error"
  totalLines: number
```

块式返回而非流式推送。agent 调用后阻塞，累积到 timeout 或 maxLines 后一次性返回。

#### `rmux_observe_multi`

```
输入:
  panes: Array<{ sessionName: string; target: string }>   // sessionName 为信息性提示，target 全局唯一
  timeout?: number     — 等待超时秒数（默认 15）
  maxLinesPerPane?: number

输出:
  results: Record<string, string[]>  — target → lines[]
```

实现：工具 handler 中并行调用多个 `MonitorManager.collectLines()`（`Promise.all`），不新增专用 MonitorManager 方法。

---

## 8. 关键设计决策

### 8.1 为什么 cmd() 补齐而非 Rust SDK

| 方案 | 代价 | 收益 |
|------|------|------|
| napi-rs 包装 Rust SDK | 跨平台编译、CI 多平台构建、包体积膨胀 | 类型安全（但 format 字段也同样有类型） |
| cmd() 补齐 | 字符串解析 | 零依赖、零编译、与 SDK 并行 |

RMUX format 变量是线性分隔的字符串，解析成本极低。cmd() 补齐覆盖了 95% 的元数据需求。其余 5%（如 `stateEvents`、`ownedSession` 等 Rust 专属特性）在我们的场景中无实际用途。

### 8.2 为什么块式返回而非流式推送

`PaneOutputStream.next()` 本身就是 pull-based API（`streams.d.ts:17`）。块式返回：
- 不需要额外停止命令（无资源泄漏风险）
- 与 `waitForText` 模式一致
- agent 获取完整输出一次分析，更适合 AI 场景
- timeout 自然终止，无需清理

### 8.3 Pane.close() 可靠性纠正

**v1.x AGENTS.md 说法有误**：`Pane.close()` 在 `pane.js:77-80` 的实现就是 `this.server.cmd("kill-pane", "-t", this.target, { check: true })`，与直接调用 `cmd("kill-pane")` 完全相同。RMUX daemon 管理所有 session，detached 不影响 `kill-pane`。

v2 统一使用 SDK 方法：直接操作 Pane 对象时用 `pane.close()`；SessionManager 保持 string 存储，用 `rmux.closeTarget(target)`。不再直接写 `this.rmux.cmd("kill-pane", ...)`。

### 8.4 closeSession 使用 session.kill()

`session.d.ts:15` 有 `kill(): Promise<CommandRun>`，与 `cmd("kill-session")` 效果相同但类型安全。v2 优先使用 `session.kill()`，如果 session 对象不可用则 fallback 到 `cmd("kill-session")`。

### 8.5 balanceRightPanes 双路径

遍历窗口右侧 pane（index > 0），计算目标高度 = `Math.floor(windowHeight * 0.98 / rightPaneCount)`，逐个调用 SDK `pane.resize({height})`。若 SDK 抛异常则 fallback 到 `cmd("resize-pane", "-t", target, "-y", String(eachHeight))` + debug log。边缘情况：单 pane 时跳过（无需平衡）、eachHeight < 1 时设为 1（RMUX 最小 pane 高度）。

SDK `pane.resize({height})` → CLI `resize-pane -t <target> -y <height>` fallback + debug log。保证升级安全。

---

## 9. 对齐 AGENTS.md 改动汇总

| 章节 | 改动 |
|------|------|
| Architecture | 新增 `types.ts`, `state.ts`, `monitor.ts` |
| Core Features 1 | 无变化 |
| Core Features 2 | 新增 4 个工具：`rmux_find_panes`, `rmux_pane_info`, `rmux_observe`, `rmux_observe_multi` |
| Implementation Notes | 删除 `Pane.close()` 不可靠描述；`closeSession` 改用 SDK；`state.ts` 状态提取；`monitor.ts` 流式模式；Pane 对象构造和 target 路径共存；所有工具 target 统一为单字符串 |

---

## 10. 实施顺序

```
Phase 1: 基础设施 + 清理（合并，保证每次 commit 代码可运行）
  ├── types.ts              — 所有共享类型
  ├── state.ts              — Permission/QuestionState（纯提取，零风险）
  ├── rmux.ts 更新          — 新增 listPaneMetas / findPanes / getPaneMeta /
                               getSessionMetas / closeTarget / paneFromTarget
  ├── rmux.ts 更新          — closeSession 双路径（SDK session.kill + cmd fallback）
  ├── rmux.ts 更新          — balanceRightPanes 双路径（SDK resize + CLI fallback）
  ├── sessions.ts 简化      — 委托 state.ts，removeAndClose 改用 closeTarget
  ├── 更新测试              — state.test.ts（Permission/QuestionState 单元测试）；
  │                           rmux.ts mock 增加 cmd 管道格式数据（"sess|0|0|%1|1|80|24|0||1234|zsh|zsh"）；
  │                           sessions.test.ts 适配新构造签名（传 mock PermissionState/QuestionState）
  └── 验证                  — lint + typecheck + test

Phase 2: 新功能
  ├── monitor.ts            — MonitorManager + 流式实现
  ├── tools.ts 扩展          — 4 个新工具注册
  └── 新增测试              — monitor.test.ts（mock PaneOutputStream/PaneLineStream，无需 daemon）；
                              工具 handler 单元测试（mock rmux + monitor 返回值）

Phase 3: 文档同步（随 Phase 1+2 渐进更新，非隔离阶段）
  ├── AGENTS.md             — 新结构 + 新工具 + 纠正（Phase 1 完成时同步）
  ├── PLAN.md               — 更新实施计划（Phase 1 完成时同步）
  ├── README.md             — 中文版（仓库首页）
  └── README.en.md          — 英文版（npm 包页面展示，由 package.json `files` 字段指定发布）
```
