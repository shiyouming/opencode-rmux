# opencode-rmux

[![Built on RMUX](https://img.shields.io/badge/built%20on-RMUX-000000?style=flat-square)](https://rmux.io)

**唯一一个跨平台支持 Windows 原生运行的 Opencode 终端复用器插件。** 不需要 WSL，Windows / macOS / Linux 原生运行。

在 Opencode 右侧实时查看子代理的工作内容，并让 AI 直接控制 RMUX 终端。

---

## 与同类插件对比

|                | opencode-cmux | opencode-tmux | **opencode-rmux** |
|----------------|:---:|:---:|:---:|
| **Windows**    | ❌  | ⚠️ 需 WSL | ✅ 原生 |
| **macOS**      | ✅  | ✅ | ✅ 原生 |
| **Linux**      | ❌  | ✅ | ✅ 原生 |
| **TypeScript SDK** | ❌ 命令行 | ❌ 命令行 | ✅ @rmux/sdk |
| **子代理面板**  | ✅  | ✅ | ✅ |
| **AI 控制工具** | ❌  | ⚠️ 有限 | ✅ 5 个 |

## 功能

- **子代理面板** — Opencode 创建子代理时，自动在 RMUX 右侧开一个面板，实时显示子代理在做什么
- **AI 控制工具** — 5 个工具让 AI 直接控制 RMUX
- **跨平台** — Windows / macOS / Linux 原生运行

---

## 环境要求

- [Opencode](https://opencode.ai) ≥ 1.0
- [RMUX](https://rmux.io) 已安装并在 `$PATH` 中

安装 Opencode：

```bash
npm install -g opencode-ai
opencode --version
```

安装 RMUX：

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

验证：`rmux --version`

---

## 安装

### 自动安装（推荐）

编辑 Opencode 配置文件（Windows: `%USERPROFILE%\.config\opencode\opencode.jsonc`，macOS/Linux: `~/.config/opencode/opencode.json`）：

```jsonc
{
  "plugin": ["opencode-rmux"]
}
```

重启 Opencode，自动下载安装。

### 手动安装（开发用）

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

## 启动方式

**必须**使用 `--port` 参数启动 Opencode：

```bash
opencode --port 0
```

`--port 0` 自动分配端口，插件会自动发现。也可指定固定端口：

```bash
opencode --port 14096
```

---

## 配置

配置文件：`~/.config/opencode/opencode-rmux.json`

文件不存在或格式错误时全部使用默认值，**零配置即可使用**。

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

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `splits` | boolean | `true` | 启用子代理面板创建 |
| `splitSize` | string | `"30%"` | 右侧面板宽度，如 `"30%"` `"50%"` `"300px"` |
| `keepPaneOnIdle` | boolean | `false` | 子代理完成后保留面板，不自动关闭 |
| `maxPanes` | number | `4` | 右侧面板上限，超限回收最旧的 |
| `debug` | boolean | `false` | 调试日志到 stderr |
| `notifications.done` | boolean | `true` | 子代理完成通知 |
| `notifications.permission` | boolean | `true` | 权限请求通知 |
| `notifications.question` | boolean | `true` | AI 提问通知 |
| `notifications.error` | boolean | `true` | 错误通知 |

### 常用示例

**关闭完成通知，保留面板：**
```json
{ "splits": true, "keepPaneOnIdle": true, "notifications": { "done": false } }
```

**更宽的右侧面板：**
```json
{ "splits": true, "splitSize": "50%" }
```

---

## 布局

```
+----------+------+
|          | 代理1 |
|  主区域   |------|
|  70%     | 代理2 |
|          |------|
|          | 代理3 |
+----------+------+
```

- 首个代理：水平分屏（右侧面板，默认 30%）
- 后续代理：右侧垂直堆叠，高度自动平衡
- 达到 `maxPanes` 上限：回收最旧面板
- `keepPaneOnIdle: false`：子代理完成自动关闭

---

## 工具列表

| 工具 | 说明 |
|------|------|
| `rmux_list_sessions` | 列出所有 RMUX 会话 |
| `rmux_create_session` | 创建新会话（可选启动命令） |
| `rmux_send_keys` | 向面板发送按键 |
| `rmux_capture` | 捕获面板文字内容 |
| `rmux_wait_for_text` | 等待面板中出现指定文本 |

---

## 工作原理

| 事件 | 行为 |
|------|------|
| `session.created` + parentID | 创建右侧面板，运行 `opencode attach` |
| `session.status` busy | 状态栏通知 "working" |
| `session.status` idle | 关闭面板，状态栏通知 "done" |
| `session.error` | 关闭面板，提示错误 |
| `permission.asked` / `permission.replied` | 权限等待状态追踪 |
| `question.asked` / `question.replied` / `question.rejected` | 提问等待状态追踪 |

---

## 常见问题

### 右侧面板没有出现？

1. 确认用 `opencode --port 0` 启动
2. 确认 `"splits": true`
3. 确认 RMUX 在运行（`rmux list-sessions` 有输出）

### 面板显示 `Unable to connect`？

- 确认用了 `--port` 参数
- `--port 0` 时插件需要几秒发现端口

### 禁用面板？

```json
{ "splits": false }
```

---

## 开发

```bash
npm install            # 安装依赖
npm run typecheck      # 类型检查
npm run build          # 构建
npm test               # 运行测试
```

## 协议

MIT

---

## 关于本项目

这个插件的每一行代码都由 AI 编程助手编写 —— [Opencode](https://opencode.ai) + **DeepSeek V4 Flash**。AI 子代理在编写代码的过程中，它们的每一个动作都被这个插件自己实时管理着。这是一个"自举"的元展示项目。

**为什么写 `opencode-rmux`？** 终端复用器插件生态长期被平台割裂——`opencode-cmux` 仅限 macOS，各类 tmux 插件在 Windows 上只能通过 WSL 运行。`opencode-rmux` 用现代的 TypeScript SDK，在 Windows、macOS、Linux 上提供一致的子代理面板体验，让每一位 Opencode 用户不再受操作系统限制。
