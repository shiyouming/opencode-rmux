# opencode-rmux 实施方案

Opencode 插件，桥接 AI 编码代理会话与 RMUX 终端复用器。

---

## 1. 项目概述

### 1.1 动机

- **cmux** 是 macOS 原生终端 App，已有 `opencode-cmux` 插件（桥接事件到 cmux 侧边栏/通知/分屏）
- **RMUX** 是跨平台（Win/Mac/Linux）终端复用器，tmux 兼容，拥有 TypeScript SDK（`@rmux/sdk`），但缺少 opencode 插件
- **opencode-rmux** 填补这一空白：为 opencode 用户提供 RMUX 子代理侧边栏面板

### 1.2 核心功能

1. **子代理侧边栏面板** — 事件驱动，自动在 30% 右侧面板创建/关闭子代理 pane
2. **RMUX 控制工具** — 5 个工具：列出会话、创建会话、发送按键、捕获输出、等待文本
3. **配置** — 兼容 opencode-cmux 的 JSON 配置格式

### 1.3 与 opencode-cmux 对比

| 特性 | opencode-cmux | opencode-rmux |
|------|--------------|---------------|
| 跨平台 | ❌ macOS only | ✅ Win/Mac/Linux |
| SDK 驱动 | ❌ CLI 调用 | ✅ @rmux/sdk TypeScript API |
| 子代理面板 | ✅ cmux 分屏 | ✅ RMUX 右侧面板 |
| 配置格式 | ✅ JSON | ✅ 兼容格式 |
| 通知 | ✅ cmux 原生弹窗 | ✅ rmux status bar |
| 权限追踪 | ✅ | ✅ |

---

## 2. 技术方案

### 2.1 技术栈

| 层面 | 选择 | 原因 |
|------|------|------|
| 语言 | TypeScript (strict) | 官方推荐，类型安全 |
| 构建 | `tsc` | 输出 JS |
| RMUX SDK | `@rmux/sdk` ^0.6.5 | 官方 npm 包，类型完善 |
| 插件 SDK | `@opencode-ai/plugin` (peer) | 官方插件接口定义 |
| 测试 | vitest ^4.1.10 | |
| 发布 | npm + GitHub Actions | 社区标准 |

### 2.2 项目结构

```
opencode-rmux/
├── src/
│   ├── index.ts          # 插件主入口，默认导出
│   ├── rmux.ts           # @rmux/sdk 封装（连接/会话/面板操作）
│   ├── tools.ts          # 自定义工具定义
│   ├── config.ts         # 配置读取器
│   ├── sessions.ts       # 子代理会话 → RMUX 面板管理
│   └── lsof.ts           # 端口发现（跨平台）
├── package.json
├── tsconfig.json
├── AGENTS.md
├── PLAN.md
├── README.md
├── LICENSE
├── .github/workflows/ci.yml
├── .github/workflows/release.yml
└── .github/dependabot.yml
```

### 2.3 核心模块设计

#### `src/config.ts` — 配置读取

```typescript
interface RMUXPluginConfig {
  splits: boolean
  notifications: {
    done: boolean
    permission: boolean
    question: boolean
    error: boolean
  }
}
```

读取路径（XDG 兼容）：
1. `$XDG_CONFIG_HOME/opencode/opencode-rmux.json`
2. `~/.config/opencode/opencode-rmux.json`

缺失或无效 JSON 时静默使用默认值。

#### `src/rmux.ts` — RMUX SDK 封装

关键方法：
- `connect()` — 连接 RMUX 守护进程
- `ensureSession(name, detached)` — 确保会话存在
- `getSession(name)` — 获取会话引用
- `listSessions()` — 列出所有会话
- `createAgentPane(session)` — 创建子代理 pane（首次水平分屏 30%，后续垂直堆叠）
- `sendTextToPane(pane, text)` — 发送文本到 pane
- `sendKeys(target, keys)` — 发送按键到目标
- `captureTarget(target)` — 捕获目标内容
- `closeSession(name)` — 关闭会话
- `cmd(...args)` — 执行 RMUX daemon 命令（用于 kill-pane、display-message 等）

所有调用包裹 try/catch，失败时静默降级。

#### `src/sessions.ts` — 子代理面板管理

- **操作队列**：串行化所有面板操作（`enqueueSplitOp`），避免竞态
- **布局**：首次创建时水平分屏 30%，后续子代理在右侧面板垂直堆叠
- **生命周期**：
  - `session.created` + `parentID` → 创建右侧面板 pane，`opencode attach`
  - `session.status` (idle, tracked) → 关闭 pane，通知 done
  - `session.status` (busy, tracked) → 通知 working
  - `session.deleted` (fallback) → 关闭 pane
  - `session.error` (tracked) → 关闭 pane，通知错误
- **通知**：通过 `rmux display-message` 显示在状态栏
- **权限追踪**：`pendingPermissions` / `pendingQuestions` 集合管理待处理状态

#### `src/tools.ts` — 自定义工具

5 个工具：`rmux_list_sessions`、`rmux_create_session`、`rmux_send_keys`、`rmux_capture`、`rmux_wait_for_text`

#### `src/lsof.ts` — 端口发现

跨平台实现，用于发现 opencode HTTP 服务器的实际端口：
- macOS/Linux: `lsof -nP -iTCP -sTCP:LISTEN`
- Windows: `Get-NetTCPConnection` (PowerShell)

#### `src/index.ts` — 主入口

```typescript
const plugin: Plugin = async () => {
  const config = loadConfig()
  const rmux = new RMUXManager()
  const sm = new SessionManager(rmux, config)

  await rmux.connect()

  return {
    async event({ event }) { await sm.handleEvent(event) },
    tool: createTools(rmux),
  }
}
```

### 2.4 事件处理流程

```
session.created (parentID 存在)
  └─ 检查 splits 是否启用 && HTTP 服务器是否运行
  └─ 入队操作
  └─ 首次 → 主窗口水平分屏 30%（右侧面板）
  └─ 后续 → 最后一个 pane 垂直分割（向下堆叠）
  └─ 发送 `opencode attach --session <id>`
  └─ 记录到 activeSplits Map

session.status (busy, tracked)
  └─ status bar 显示 "working: <id>"

session.status (idle, tracked)
  └─ 有待处理权限 → 跳过
  └─ `kill-pane -t %N` 关闭 pane
  └─ status bar 显示 "done: <id>"

session.deleted (fallback)
  └─ 如 tracked → `kill-pane` 关闭

session.error (tracked)
  └─ 清理 pendingPermissions/pendingQuestions
  └─ `kill-pane` 关闭 pane
  └─ status bar 显示 "error: <id>"

permission.asked
  └─ 记录到 pendingPermissions
  └─ status bar 显示 "permission needed: <title>"

permission.replied
  └─ 从 pendingPermissions 移除
```

### 2.5 实现细节

- `session.deleted` **不触发**于子 agent 会话——清理依赖 `session.status` idle
- `Pane.close()` 在 detached session 中不可靠——改用 `cmd("kill-pane", "-t", pane.target)`
- `pane.target` 返回 `%N` 格式（pane ID），适用于 `kill-pane`
- Window pane 索引在关闭后重新排列——使用 `window.panes()` 获取实时布局

---

## 3. 实施计划

### Phase 1: 项目骨架 (v0.1.0) ✅

- [x] 项目目录结构
- [x] AGENTS.md、PLAN.md
- [x] `package.json`、`tsconfig.json`
- [x] `src/rmux.ts` — RMUX SDK 封装层
- [x] `src/config.ts` — 配置读取
- [x] `src/lsof.ts` — 端口发现
- [x] `src/sessions.ts` — 子代理管理（事件驱动）
- [x] `src/tools.ts` — 自定义工具定义
- [x] `src/index.ts` — 主入口
- [x] `README.md`、`LICENSE`

### Phase 2: 测试与完善 (v0.2.0) ✅

- [x] 添加测试（单元测试 + 集成测试）
- [x] GitHub Actions CI（typecheck + test + build）
- [x] 完善错误处理、边缘情况
- [x] E2E 本地验证（侧边栏创建/堆叠/自动清理）
- [x] 调试日志清理

### Phase 3: 发布 (v1.0.0)

- [ ] 发布到 npm
- [ ] 提交 PR 到 opencode 生态系统页面
- [ ] 编写完整使用文档

---

## 4. 项目文件清单

| 文件 | 阶段 | 说明 |
|------|------|------|
| `package.json` | v0.1.0 | 包元数据、依赖、脚本 |
| `tsconfig.json` | v0.1.0 | TypeScript 配置（strict） |
| `src/index.ts` | v0.1.0 | 插件默认导出 |
| `src/rmux.ts` | v0.1.0 | RMUX SDK 封装 |
| `src/tools.ts` | v0.1.0 | 5 个自定义工具 |
| `src/config.ts` | v0.1.0 | 配置读取器 |
| `src/sessions.ts` | v0.1.0 | 子代理面板管理 |
| `src/lsof.ts` | v0.1.0 | 端口发现 |
| `README.md` | v0.1.0 | 使用说明 |
| `LICENSE` | v0.1.0 | MIT |
| `.github/workflows/ci.yml` | v0.2.0 | PR 检查 |
| `.github/workflows/release.yml` | v0.2.0 | 发布 |
| `.github/dependabot.yml` | v0.2.0 | 依赖更新 |
| `src/__tests__/` | v0.2.0 | 测试（6 文件，62 用例） |

---

## 5. 关键设计决策

### 5.1 为什么用新建 pane 而非新建窗口？

子代理显示在主窗口右侧面板（水平分屏 30%），而非新建窗口。首个子代理创建右侧面板，后续子代理在该面板内垂直堆叠。更接近 cmux 的分屏体验。

### 5.2 为什么 cleanup 依赖 session.status idle？

`session.deleted` 事件对子 agent 会话不触发。改用 `session.status idle` + `activeSplits.has(sessionId)` 来判断子 agent 完成，执行清理。

### 5.3 为什么用 kill-pane 而非 Pane.close()？

`Pane.close()` SDK 方法在 detached session 中不可靠。改用 `cmd("kill-pane", "-t", pane.target)` 直接操作 RMUX daemon，其中 `pane.target` 返回 `%N` 格式 ID。

### 5.4 失败处理策略

- 所有 RMUX 操作包裹 try/catch
- 失败时静默降级
- 不阻塞 opencode 主流程
- 如果 RMUX 守护进程不可用，自定义工具返回友好错误信息

### 5.5 操作队列的必要性

- 事件可能并发触发（多个子代理快速创建）
- 串行化保证布局一致性
- 采用 opencode-cmux 验证过的 `enqueueSplitOp` 模式

---

## 6. 发布与开源

### npm 发布

```bash
npx tsc
npm publish
```

### GitHub 仓库准备

- 仓库名: `opencode-rmux`
- 描述: `Opencode plugin for RMUX terminal multiplexer`
- 主题: `opencode`, `opencode-plugin`, `rmux`, `terminal`, `multiplexer`
- License: MIT

### 社区贡献

- 提交到 [opencode 生态系统](https://opencode.ai/docs/ecosystem) 页面
- 在 [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) 提交
