# opencode-rmux

Opencode 插件，桥接 AI 编码代理会话与 [RMUX](https://rmux.io) 终端复用器 —— 跨平台子代理面板管理和 AI 驱动的 RMUX 控制工具。

## 功能

### 子代理面板管理
当 Opencode 创建子代理时，`opencode-rmux` 自动在 RMUX 右侧创建面板，实时显示每个子代理的工作内容。

### AI 自定义工具
插件提供 5 个工具，让 AI 直接控制 RMUX：

| 工具 | 功能 |
|------|------|
| `rmux_list_sessions` | 列出所有运行中的 RMUX 会话 |
| `rmux_create_session` | 创建新 RMUX 会话（可选启动命令） |
| `rmux_send_keys` | 向 RMUX 面板发送按键 |
| `rmux_capture` | 捕获面板文字内容 |
| `rmux_wait_for_text` | 等待面板中出现指定文本 |

### 跨平台
支持 **Windows**、**macOS** 和 **Linux**——RMUX 原生支持三个平台。

## 环境要求

- [Opencode](https://opencode.ai) ≥ 1.0
- [RMUX](https://rmux.io) 已安装并在 `$PATH` 中（安装命令：`winget install rmux`、`brew install rmux` 或 `curl -fsSL https://rmux.io/install.sh | sh`）

## 安装

在 `opencode.json` 中添加：

```json
{
  "plugin": ["opencode-rmux"]
}
```

Opencode 下次启动时自动下载。

### 本地开发

```bash
git clone https://github.com/ShiYouming/opencode-rmux.git
cd opencode-rmux
npm install
npm run build

# Windows：复制到插件目录
copy dist\index.js "%USERPROFILE%\.config\opencode\plugins\rmux.js"

# macOS/Linux：创建软链接
ln -sf "$PWD/dist/index.js" ~/.config/opencode/plugins/rmux.js
```

## 启动方式

运行 Opencode 时需要使用 `--port` 参数启动 HTTP 服务，才能启用子代理面板：

```bash
opencode --port 0
```

`--port 0` 表示自动分配端口，插件会自动发现并连接。

## 配置

配置文件：`~/.config/opencode/opencode-rmux.json`

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
| `keepPaneOnIdle` | boolean | `false` | 子代理完成后保留面板（不自动关闭） |
| `maxPanes` | number | `4` | 右侧面板上限，超限回收最旧的 |
| `debug` | boolean | `false` | 调试日志输出到 stderr |
| `notifications.done` | boolean | `true` | 子代理完成通知 |
| `notifications.permission` | boolean | `true` | 权限请求通知 |
| `notifications.question` | boolean | `true` | AI 提问通知 |
| `notifications.error` | boolean | `true` | 错误通知 |

配置文件不存在或格式错误时，全部使用默认值，即装即用无需配置。

## 工作原理

插件监听 Opencode 生命周期事件：

| 事件 | 行为 |
|------|------|
| `session.created` + parentID | 创建右侧面板，运行 `opencode attach` 连接子代理 |
| `session.status` busy | 状态栏通知「工作中」 |
| `session.status` idle | 关闭面板，状态栏通知「已完成」 |
| `session.error` | 关闭面板，提示错误 |
| `permission.asked` | 状态栏通知「需要权限」 |
| `permission.replied` | 清除权限等待状态 |

## 面板布局

```
+----------+------+
|          | 代理1 |
|  主区域   |------|
|  70%     | 代理2 |
|          |------|
|          | 代理3 |
+----------+------+
```

- 首个代理：水平分屏，右侧 30%（可配置）
- 后续代理：右侧垂直堆叠，高度自动均衡
- 达到 `maxPanes` 上限时：回收最旧的面板
- `keepPaneOnIdle: false` 时：子代理完成后自动关闭面板

## 开发

```bash
npm install            # 安装依赖
npm run typecheck      # 类型检查
npm run build          # 构建 dist/
npm test               # 运行测试
npm run prepublishOnly # 类型检查 + 测试 + 构建
```

## 协议

MIT
