# Changelog

所有版本的更新记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [1.0.3] - 2026-04-01

### 修复
- **`codex update` 后 `codex` 命令消失**：从 GitHub 安装时 `dist/` 不在仓库中，安装后无可执行文件。新增 `prepare` 脚本，`npm install` 时自动触发构建
- **`DEP0190` 安全警告**：`shell:true` 方式改为 `cmd.exe /c npm`，消除 Node.js 安全警告

---

## [1.0.2] - 2026-04-01

### 修复
- **Windows 自动更新失败**：`codex update` 报 `spawn npm ENOENT`。原因是 Windows 上 npm 是批处理脚本 `npm.cmd`，无法直接被 `execFile` 调用。现已自动识别平台，Windows 使用 `npm.cmd`，Linux/macOS 使用 `npm`

---

## [1.0.1] - 2026-04-01

### 新增
- `codex update` 命令：交互式检查并更新到最新版本（Y/N 提示，不强制）
- 启动时后台静默检查版本，有新版本显示一行提示，不阻断使用
- REPL 内 `/update` 斜杠命令：在会话中查看版本状态
- 发布脚本：`npm run release:patch / release:minor / release:major`，一条命令完成构建 + 升版本 + 推送 + 全局同步

### 修复
- **REPL 卡死**：工具调用达到 20 轮上限后状态卡在"思考中"，现在自动退出并显示提示
- **错误状态不清除**：报错后再发新消息，错误提示不消失，现在发新消息自动清除
- **内存泄漏**：工具执行超时的 `setTimeout` 在 Promise 完成后未清除，现已修复
- **重复 block**：Stream 适配器中相同工具调用 `idx` 在多个 chunk 里重复创建 content block
- **工具 ID 冲突**：同名工具并发调用时生成相同 ID，现在加计数器确保唯一
- **API Key 星号显示**：输入界面星号数量上限错误地限制为 20 个，现已修复为真实长度
- **BaseURL 无验证**：自定义端点输入框接受任意字符串，现在校验 URL 格式并提示错误
- **输出超限提示不清晰**：Bash 工具输出超过 200KB 时错误信息模糊，现在明确提示

### 改进
- `FileReadTool`：读取前先检查文件大小，超过 10MB 直接拒绝，防止内存溢出
- 工具输出截断提示从 `...` 改为 `共 X 字符，仅显示前 500`，信息更清晰
- 从仓库移除内部开发文档，保持公开仓库整洁

---

## [0.1.0] - 2026-04-01

### 新增（初始版本）
- 支持任意 OpenAI 兼容提供商（DeepSeek、OpenAI、Kimi、通义千问、GLM、Mistral、Gemini、Ollama、LM Studio）
- 可视化提供商配置 TUI（方向键选择、脱敏 API Key 输入、连接测试）
- 交互式 REPL（React + Ink TUI），支持多轮 Agentic 工具调用循环
- 10 个内置工具：Bash、FileRead、FileEdit、FileWrite、Grep、Glob、LS、WebFetch、TodoWrite、SubAgent
- Windows / Unix 双平台兼容（Bash 工具自动选择 cmd.exe 或 bash）
- Grep 工具纯 Node.js 实现，无需安装 ripgrep
- 环境变量覆盖支持（CODEX_BASE_URL / CODEX_API_KEY / CODEX_MODEL）
- 非交互模式（`codex -p "prompt"`）
- REPL 斜杠命令：`/provider` `/model` `/clear` `/help` `/exit`
- 工具执行 30 秒超时保护
- 指数退避自动重试
