<p align="center">
  <a href="README.en.md"><img src="https://img.shields.io/badge/Lang-English-blue?style=for-the-badge" alt="English"></a>
  <a href="https://rmux.io"><img src="https://img.shields.io/badge/built%20on-RMUX-000000?style=for-the-badge" alt="Built on RMUX"></a>
  <a href="https://www.npmjs.com/package/opencode-rmux"><img src="https://img.shields.io/npm/v/opencode-rmux?style=for-the-badge" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT"></a>
  <a href="https://github.com/shiyouming/opencode-rmux"><img src="https://img.shields.io/github/stars/shiyouming/opencode-rmux?style=for-the-badge" alt="Stars"></a>
</p>

# opencode-rmux

<p align="center">
  Opencode 插件 · 在 RMUX 右侧实时查看子代理工作 · AI 直接控制终端<br>
  <b>唯一跨平台原生支持 Windows/macOS/Linux 的终端复用器插件</b>
</p>

<table>
<tr><td><b>子代理面板</b></td><td>自动创建 RMUX 右侧面板，实时显示子代理的工作内容。首个水平分屏，后续垂直堆叠，高度自动平衡</td></tr>
<tr><td><b>AI 控制工具</b></td><td>5 个工具让 AI 直接控制 RMUX：列出会话、创建会话、发送按键、捕获内容、等待文本</td></tr>
<tr><td><b>跨平台</b></td><td>Windows / macOS / Linux 原生运行，无需 WSL</td></tr>
<tr><td><b>TypeScript SDK</b></td><td>基于官方 <code>@rmux/sdk</code>，非命令行解析，类型安全</td></tr>
</table>

---

## 安装

### 环境要求

- [Opencode](https://opencode.ai) ≥ 1.0：`npm install -g opencode-ai`
- [RMUX](https://rmux.io)：见下方

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

### 安装插件

在 Opencode 配置文件（`~/.config/opencode/opencode.jsonc`）中添加：

```jsonc
{
  "plugin": ["opencode-rmux"]
}
```

重启 Opencode，自动下载安装。

### 启动

```bash
opencode --port 0
```

`--port 0` 自动分配端口，插件自动发现。也可指定固定端口如 `--port 14096`。

---

## 配置

文件：`~/.config/opencode/opencode-rmux.json`，不存在时全部使用默认值，零配置即可使用。

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
| `splits` | boolean | `true` | 启用子代理面板 |
| `splitSize` | string | `"30%"` | 右侧面板宽度，如 `"30%"` `"50%"` `"300px"` |
| `keepPaneOnIdle` | boolean | `false` | 子代理完成后保留面板 |
| `maxPanes` | number | `4` | 面板上限，超限回收最旧 |
| `debug` | boolean | `false` | 调试日志到 stderr |
| `notifications.done` | boolean | `true` | 完成通知 |
| `notifications.permission` | boolean | `true` | 权限请求通知 |
| `notifications.question` | boolean | `true` | AI 提问通知 |
| `notifications.error` | boolean | `true` | 错误通知 |

---

## 布局

```
+----------+------+
|          | ag1  |
|  Main    |------|
|  Area    | ag2  |
|  70%     |------|
|          | ag3  |
+----------+------+
```

首个代理水平分屏，后续垂直堆叠，高度自动平衡。达到 `maxPanes` 上限时回收最旧面板。

---

## vs 同类插件

|                | opencode-cmux | opencode-tmux | **opencode-rmux** |
|----------------|:---:|:---:|:---:|
| **Windows**    | ❌  | ⚠️ WSL | ✅ 原生 |
| **macOS**      | ✅  | ✅ | ✅ 原生 |
| **Linux**      | ❌  | ✅ | ✅ 原生 |
| **TypeScript SDK** | ❌ CLI | ❌ CLI | ✅ @rmux/sdk |
| **AI 控制工具** | ❌  | ⚠️ 有限 | ✅ 5 个 |

---

## 工具

| 工具 | 说明 |
|------|------|
| `rmux_list_sessions` | 列出所有会话 |
| `rmux_create_session` | 创建新会话（可选启动命令） |
| `rmux_send_keys` | 向面板发送按键 |
| `rmux_capture` | 捕获面板文字 |
| `rmux_wait_for_text` | 等待文本出现 |

---

## 工作原理

| 事件 | 行为 |
|------|------|
| `session.created` + parentID | 创建右侧面板，运行 `opencode attach` |
| `session.status` busy | 状态栏通知 |
| `session.status` idle | 关闭面板 |
| `session.error` | 关闭面板，提示错误 |
| `permission.asked` / `replied` | 权限追踪 |
| `question.asked` / `replied` / `rejected` | 提问追踪 |

---

## 常见问题

**右侧面板没出现？** 确认 `opencode --port 0` 启动，`"splits": true`，RMUX 在运行。

**显示 Unable to connect？** 确认用了 `--port` 参数，`--port 0` 时等几秒让插件发现端口。

**禁用面板？** `{ "splits": false }`

---

## 开发

```bash
npm install       # 安装依赖
npm run typecheck # 类型检查
npm run build     # 构建
npm test          # 运行测试
```

## 协议

MIT

---

<p align="center">
  本项目由 Opencode + DeepSeek V4 Flash 辅助编写<br>
  <a href="https://github.com/shiyouming/opencode-rmux">GitHub</a> · <a href="https://www.npmjs.com/package/opencode-rmux">npm</a> · <a href="https://github.com/anomalyco/opencode/pull/38052">opencode 生态</a>
</p>
