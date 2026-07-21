# opencode-rmux

在 Opencode 右侧实时查看子代理的工作内容，并让 AI 直接控制 RMUX 终端。

---

## 一、这是什么？

Opencode 插件。装了这个插件后：

- **子代理面板** — Opencode 创建子代理时，自动在 RMUX 右侧开一个面板，实时显示子代理在做什么
- **AI 控制工具** — AI 可以自己查看 RMUX 会话、创建新会话、发送按键、捕获屏幕内容

支持 Windows / macOS / Linux。

---

## 二、前置依赖

在安装插件之前，你需要先装好两个东西：

### 1. Opencode

```bash
npm install -g opencode-ai
```

验证安装：

```bash
opencode --version
```

### 2. RMUX

| 系统 | 安装命令 |
|------|----------|
| Windows | `winget install rmux` |
| macOS | `brew install rmux` |
| Linux | `curl -fsSL https://rmux.io/install.sh \| sh` |

验证安装：

```bash
rmux --version
```

---

## 三、安装插件

### 方式一：自动安装（推荐）

编辑 Opencode 配置文件：

**Windows**: `%USERPROFILE%\.config\opencode\opencode.jsonc`
**macOS/Linux**: `~/.config/opencode/opencode.json`

```jsonc
{
  "plugin": ["opencode-rmux"],
  // ... 其他配置
}
```

重启 Opencode，它会自动下载安装。

### 方式二：手动安装（开发用）

```bash
# 下载源码
git clone https://github.com/ShiYouming/opencode-rmux.git
cd opencode-rmux

# 安装依赖并构建
npm install
npm run build

# Windows：复制到插件目录
copy dist\index.js "%USERPROFILE%\.config\opencode\plugins\rmux.js"

# macOS/Linux：创建软链接
ln -sf "$PWD/dist/index.js" ~/.config/opencode/plugins/rmux.js
```

然后在 `opencode.jsonc` 中配置（**不要**再用 `plugin` 字段，否则会重复加载）：

```jsonc
{
  // 不需要 "plugin" 字段
}
```

---

## 四、启动方式

**必须**使用 `--port` 参数启动 Opencode，子代理面板才能正常工作：

```bash
opencode --port 0
```

`--port 0` 表示自动分配端口，每次启动端口都不同，但插件会自动发现。

如果你想固定端口：

```bash
opencode --port 14096
```

---

## 五、配置

配置文件位置：

**Windows**: `%USERPROFILE%\.config\opencode\opencode-rmux.json`
**macOS/Linux**: `~/.config/opencode/opencode-rmux.json`

文件不存在时全部使用默认值，即装即用，**零配置**。

### 全部选项

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
| `splits` | boolean | `true` | 开启后才会创建子代理面板 |
| `splitSize` | string | `"30%"` | 右侧面板宽度。例：`"30%"` `"50%"` `"300px"` |
| `keepPaneOnIdle` | boolean | `false` | 子代理完成后是否保留面板，不自动关闭 |
| `maxPanes` | number | `4` | 右侧最多几个面板，超了回收最旧的那个 |
| `debug` | boolean | `false` | 开启后插件日志输出到 stderr，排查问题用 |
| `notifications.done` | boolean | `true` | 子代理完成时状态栏提示 |
| `notifications.permission` | boolean | `true` | Opencode 请求权限时状态栏提示 |
| `notifications.question` | boolean | `true` | AI 提问时状态栏提示 |
| `notifications.error` | boolean | `true` | 出错时状态栏提示 |

### 常用配置示例

**只想看面板，不要通知打扰：**

```json
{
  "splits": true,
  "notifications": { "done": false }
}
```

**右侧宽一点，面板保留不关：**

```json
{
  "splits": true,
  "splitSize": "50%",
  "keepPaneOnIdle": true
}
```

---

## 六、效果说明

启动 Opencode 后，窗口布局如下：

```
+----------+------+
|          | 代理1 |
|  主对话   |------|
|  区域     | 代理2 |
|  70%     |------|
|          | 代理3 |
+----------+------+
```

- 创建子代理 → 右侧自动开一个面板
- 子代理在做什么 → 右侧面板实时显示
- 子代理完成 → 面板自动关闭（如果 `keepPaneOnIdle` 为 `false`）
- 子代理太多 → 自动回收最旧的（由 `maxPanes` 控制）

---

## 七、常见问题

### 右侧面板没有出现？

1. 确认你是用 `opencode --port 0` 启动的
2. 确认配置文件里 `"splits": true`
3. 确认 RMUX 已经运行（`rmux list-sessions` 有输出）

### 面板显示 `Unable to connect`？

- 确认你用 `--port` 参数启动了 Opencode
- 如果用了 `--port 0`，插件会自动发现端口，等几秒再试

### 不想用面板了？

```json
{ "splits": false }
```

---

## 八、开发相关

```bash
npm install            # 安装依赖
npm run typecheck      # 类型检查
npm run build          # 构建
npm test               # 运行测试
```

## 协议

MIT
