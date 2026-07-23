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
<tr><td><b>子代理面板</b></td><td>Opencode 创建子代理时自动在 RMUX 右侧开面板，实时显示工作内容。首个水平分屏，后续垂直堆叠，高度自动平衡</td></tr>
<tr><td><b>AI 控制工具</b></td><td>9 个工具让 AI 直接控制 RMUX：查面板、看详情、发按键、捕获内容、等文本、流式监听等</td></tr>
<tr><td><b>跨平台</b></td><td>Windows / macOS / Linux 原生运行，无需 WSL</td></tr>
<tr><td><b>TypeScript SDK</b></td><td>基于官方 <code>@rmux/sdk</code>，类型安全，非命令行解析</td></tr>
</table>

<p align="center">
  <video src="demo.mp4" width="720" controls>
    Your browser does not support the video tag.
  </video>
  <br>
  <em>以上只是冰山一角。<a href="TUTORIAL.md">查看完整玩法 →</a></em>
</p>

---

- [为什么选择 opencode-rmux](#为什么选择-opencode-rmux)
- [安装](#安装)
- [快速上手](#快速上手)
- [配置](#配置)
- [布局](#布局)
- [工具](#工具)
- [事件与响应](#事件与响应)
- [常见问题](#常见问题)
- [开发](#开发)
- [协议](#协议)

---

## 为什么选择 opencode-rmux？

|                | opencode-cmux | opencode-tmux | **opencode-rmux** |
|----------------|:---:|:---:|:---:|
| **Windows**    | ❌  | ⚠️ 需 WSL | ✅ 原生 |
| **macOS**      | ✅  | ✅ | ✅ 原生 |
| **Linux**      | ❌  | ✅ | ✅ 原生 |
| **TypeScript SDK** | ❌ 命令行解析 | ❌ 命令行解析 | ✅ 官方 TypeScript SDK |
| **子代理面板**  | ✅ 3 面板上限 | ✅ 无限制 | ✅ 可配置上限，自动回收 |
| **AI 控制工具** | ❌  | ⚠️ 部分 | ✅ **9 个专有工具** |
| **面板元数据**  | ❌  | ❌ | ✅ PID/命令/尺寸等详情 |
| **面板搜索**    | ❌  | ❌ | ✅ 按会话/命令/状态筛选 |
| **流式监听**    | ❌  | ❌ | ✅ 单面板/多面板实时输出流 |
| **面板自动平衡** | ❌  | ❌ | ✅ 每次 split 后等高重排 |

---

## 安装

### 环境要求

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

### 安装插件

两种方式任选一种：

**方式一：CLI 命令（推荐）**
```bash
opencode plugin opencode-rmux -g
```
自动下载 npm 包并写入全局配置。

**方式二：手动配置**
编辑 `~/.config/opencode/opencode.jsonc`，添加：
```jsonc
{ "plugin": ["opencode-rmux"] }
```

无论哪种方式，重启 Opencode 后自动从 npm 下载安装。

> **注意：插件不会自动更新。** Opencode 永久缓存 npm 插件，不会在启动时检查新版本。
> 更新方法见下方「更新插件」。

### 启动

```bash
opencode --port 0
```

`--port 0` 自动分配端口。插件自动发现并连接。也可指定固定端口如 `--port 14096`。

### 更新插件

Opencode **不会**自动检查或更新 npm 插件，且 `opencode plugin <模块名> -f` 的 `-f` 仅强制更新配置文件条目，**不会重新下载 npm 包**。唯一可靠的更新方式：清除缓存后重启。

```bash
# Linux / macOS
rm -rf ~/.cache/opencode/packages/opencode-rmux

# Windows PowerShell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\opencode\cache\packages\opencode-rmux"
```

重启 Opencode 后自动重新下载最新版。

> 如尚未在 `opencode.jsonc` 中配置插件，清除缓存后执行 `opencode plugin opencode-rmux -g` 添加配置，再重启。

---

## 快速上手

装好了？对 opencode 里的 AI 说一句话试试：

```
帮我看看现在终端里有哪些窗口在跑
```

如果 AI 回答了你，说明插件已生效。详细玩法看 [入门指南](TUTORIAL.md)。

---

## 配置

文件：`~/.config/opencode/opencode-rmux.json`。文件不存在时全部使用默认值，**零配置即可使用**。

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
| `keepPaneOnIdle` | boolean | `false` | 子代理完成后保留面板（不自动关闭） |
| `maxPanes` | number | `4` | 面板上限，超限自动回收最旧的那个 |
| `debug` | boolean | `false` | 调试日志输出到 stderr |
| `notifications.done` | boolean | `true` | 子代理完成通知 |
| `notifications.permission` | boolean | `true` | 权限请求通知 |
| `notifications.question` | boolean | `true` | AI 提问通知 |
| `notifications.error` | boolean | `true` | 错误通知 |

---

## 布局

```
+----------+------+
|          | 代理A |
|  主区域   |------|
|  70%     | 代理B |
|          |------|
|          | 代理C |
+----------+------+
```

- **首个子代理**：水平分屏，右侧面板（默认 30% 宽度，可通过 `splitSize` 调整）
- **后续子代理**：从最后一个面板垂直分割，向下堆叠
- **高度平衡**：每次新分裂后自动用 `resize-pane` 将所有右侧面板设为等高
- **自动回收**：达到 `maxPanes` 上限时，强制关闭最旧的面板，新面板替代其位置
- **完成清理**：`keepPaneOnIdle: false` 时，子代理完成立即关闭面板

---

## 工具

| 工具 | 说明 |
|------|------|
| `rmux_list_sessions` | 列出所有 RMUX 会话及其窗口/面板信息 |
| `rmux_create_session` | 创建新 RMUX 会话，可选附带启动命令 |
| `rmux_find_panes` | 按会话名、命令、标题或状态搜索面板 |
| `rmux_pane_info` | 查看面板详细信息（PID、命令、尺寸等） |
| `rmux_send_keys` | 向指定面板发送按键（连 AI 也能控制终端） |
| `rmux_capture` | 捕获面板当前屏幕文字内容 |
| `rmux_wait_for_text` | 等待面板中出现指定文本（支持超时） |
| `rmux_observe` | 流式收集面板输出，返回收集到的行 |
| `rmux_observe_multi` | 同时流式监听多个面板的输出 |

---

## 事件与响应

插件自动响应以下事件，无需人工干预：

| 发生了什么 | 插件会怎么做 |
|-----------|------------|
| 子代理被创建 | 右侧自动开面板，显示子代理工作 |
| 子代理在工作 | 调试日志记录 |
| 子代理完成了 | 自动关闭面板，通知 "done" |
| 子代理出错 | 关闭面板，显示错误 |
| AI 请求权限 | 通知你，等待处理 |
| AI 提问 | 通知你，等待回复 |

---

## 常见问题

**右侧面板没有出现？**
- 确认 `opencode --port 0` 启动
- 确认配置文件里 `"splits": true`
- 确认 RMUX 在运行（`rmux list-sessions` 有输出）

**面板显示 Unable to connect？**
- 确认用了 `--port` 参数启动 opencode
- `--port 0` 时插件需要几秒自动发现端口

**发命令后没有执行（"Enter" 被当成文字打了）？**
- 如果你是 v1 升级上来的，确认用的是最新版
- 命令格式应该像 `npm install Enter`，其中 `Enter` 会被识别为回车键

**AI 说找不到面板？**
- 确保你用的面板地址格式正确，如 `opencode:0.1`
- 可以先让 AI 用 `rmux_find_panes` 搜一下有哪些面板

**如何禁用面板？**
在 `opencode-rmux.json` 中添加：
```json
{ "splits": false }
```

**如何更新到最新版？**
Opencode 不会自动检查插件更新。需手动删除缓存后重启：
```bash
# Linux / macOS
rm -rf ~/.cache/opencode/packages/opencode-rmux

# Windows PowerShell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\opencode\cache\packages\opencode-rmux"
```

---

## 开发

```bash
npm install       # 安装依赖
npm run typecheck # tsc --noEmit
npm test          # 运行测试（97 个用例）
npm run build     # 构建 dist/
```

## 协议

MIT

---

<p align="center">
  本项目由 Opencode + DeepSeek V4 Flash 辅助编写<br>
  <a href="https://github.com/shiyouming/opencode-rmux">GitHub</a> · <a href="https://www.npmjs.com/package/opencode-rmux">npm</a> · <a href="https://github.com/anomalyco/opencode/pull/38052">Opencode 生态</a>
</p>
