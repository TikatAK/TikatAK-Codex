# Changelog

所有版本的更新记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [1.5.3] - 2026-04-04

### 重构 / 代码质量
- **新增 `src/utils/platform.ts`**：统一导出 `IS_WINDOWS`，消除 `BashTool` 与 `CronTool` 中的重复定义
- **新增 `src/utils/resolvePath.ts`**：提取 `resolvePath(inputPath, cwd)` 工具函数，替换 `FileReadTool`、`FileEditTool`、`FileWriteTool`、`GlobTool`、`GrepTool`、`LSTool` 中重复的路径解析模式（共 6 处）
- **新增 `src/utils/jsonStorage.ts`**：提取 `readJson<T>` 与 `writeJson<T>` 工具函数，替换 `TodoWriteTool`、`CronTool` 中各自实现的 JSON 读写逻辑

### 修复
- **`FileEditTool`**：移除不必要的 `await import('fs')` 动态导入，改用顶层静态导入的 `mkdirSync`
- **`claude.ts`**：修复 `sendMessage` / `sendMessageStream` 中 `resolveTools(opts)` 被调用两次的问题（提取到局部变量，消除重复计算）
- **`TodoWriteTool`**：将重复 ID 检测从 O(n²) 改为 O(n)（`indexOf` 遍历 → `Set` 查找）
- **`base.ts`**：为 `zodTypeToJsonSchema` 补充 `ZodUnion` 与嵌套 `ZodOptional` 的处理，避免未知类型回退为 `string`

---

## [1.5.2] - 2026-04-03

### 新增
- **CronCreate / CronDelete / CronList 工具**：轻量定时任务管理。支持 `@every 30s/5m/1h/2d`、`@hourly`、`@daily`、`@weekly` 调度格式，任务持久化到 `~/.tikat-codex/crons.json`，REPL 启动时自动恢复
- **Skill / SkillList / SkillCreate 工具**：用户自定义技能系统。技能为 `~/.tikat-codex/skills/<name>.md` Markdown 文件，执行时内容以指令块形式返回给模型执行

### 技术
- REPL 启动时调用 `restoreJobs(cwd)` 重新注册所有持久化 cron jobs
- `setInterval` timer 调用 `.unref()` 确保不阻止 Node 进程退出

---

## [1.5.1] - 2026-04-03

### 新增
- **EnterWorktree / ExitWorktree 工具**：在临时 git worktree 隔离分支上工作，不影响主工作区。ExitWorktree 支持可选合并（`merge: true`）和删除分支（`delete_branch: true`）

### 技术
- `SessionState` 新增 `worktreePath`、`worktreeBranch`、`worktreeMainCwd` 字段
- 导出 `resolveWorktreePath()` 工具函数供文件工具使用

---

## [1.5.0] - 2026-04-03

### 新增
- **EnterPlanMode / ExitPlanMode 工具**：进入计划模式后，Bash、Write、Edit 工具被禁用，模型只能使用只读工具（FileRead、Glob、Grep、LS）进行分析，呈现完整计划后再调用 ExitPlanMode 执行

### 技术
- `ToolContext` 新增 `sessionState?: SessionState`，包含 `planMode: boolean` 标志
- `SessionState` 对象在 `runAgentLoop` 内创建，通过 `executeTools` 透传，在同一次循环的所有工具调用间共享
- BashTool、FileWriteTool、FileEditTool 检查 `context.sessionState?.planMode`，为 true 时拒绝执行

---

## [1.4.9] - 2026-04-03

### 新增
- **TodoUpdate 工具**：按 ID 更新单条 Todo（状态/内容/优先级），无需重写整个列表
- **TodoDelete 工具**：按 ID 删除单条 Todo

### 改进
- `TodoWrite` 描述更新，提示模型先用 `TodoRead` 读取后再修改

---

## [1.4.8] - 2026-04-03

### 新增
- **WebSearch 工具**：通过 DuckDuckGo Instant Answer API 进行网络搜索，返回即时答案、摘要和相关链接，无需 API Key
- **AskUser 工具**：模型可在执行过程中向用户提问并等待回答，支持显示可选项列表。REPL 显示紫色提问框，用户输入后自动恢复 Agent 执行

### 技术
- `ToolContext` 新增 `askUser?: (question, choices?) => Promise<string>` 回调字段
- `AgentLoopOptions` 新增 `onAskUser` 回调，通过 `executeTools` 透传到工具上下文
- REPL 新增 `asking` 状态，`useInput` 在该状态下允许输入，`submit` 在该状态下解析 pending promise

---

## [1.4.7] - 2026-04-02

### 修复
- **`codex update` 无法安装新版本**：自动更新命令 `performUpdate()` 仍在使用 `github:TikatAK/Tikat-Codex` 的 git dep 方式，在 npm 11+ 上安装完立即失效（Junction 悬空）。改为通过 GitHub Releases API 动态获取最新 tarball 的下载地址，再用 `npm install -g <tarball-url>` 安装，彻底消除悬空问题
- **版本检查超时从 5s 提升到 8s**：避免网络慢时误判为无更新
- 新增 `fetchLatestRelease()` 函数，从 Releases API 获取版本号和 tarball 地址，`performUpdate()` 直接使用该地址

---

## [1.4.6] - 2026-04-02

### 修复
- **工具调用轮数达到上限时不再硬截断**：参照 Claude Code 的处理方式，在剩余 3 轮时自动向模型注入 `<system-reminder>` 提醒其收尾，让模型优雅完成当前步骤并给出最终回复，而不是被强行中断
- **轮数上限提示文字优化**：从 `⚠️ 已达到最大工具调用轮数，自动停止` 改为温和的引导提示，告知用户可继续描述下一步

---

## [1.4.5] - 2026-04-02

### 改进
- **完整复刻 Claude Code 系统提示词**：将 `BASE_SYSTEM_PROMPT` 从约 150 行的自定义版本重写为严格对照 Claude Code 生产版的 7 个章节结构：
  - `# System`：工具渲染规则、权限模式说明、`<system-reminder>` 标签处理、**提示注入警告**、自动上下文压缩说明
  - `# Doing tasks`：不读就不改、不估时间、**忠实报告**（不允许谎称测试通过）、三行代码好过过早抽象、删除而非用 hack 保持兼容
  - `# Executing actions with care`：可逆性/爆炸半径框架、第三方上传提醒、锁文件要调查不要删、"measure twice, cut once"
  - `# Using your tools`：专用工具优先、并行调用最大化、SubAgent 使用规范
  - `# Tone and style`：`file_path:line_number` 格式、`owner/repo#123` 格式、工具调用前不加冒号
  - `# Output efficiency`：原版简洁性规则
  - `# Executing actions with care`：完整的可逆性风险分级清单

### 重构
- **提取共享 Agent Loop**：新增 `src/services/agent/loop.ts`，将原本在 `main.tsx` 和 `repl/index.tsx` 中各自重复的约 100 行 agent 循环代码合并为统一的 `runAgentLoop()` 函数
  - 新增 `onTurnComplete` 回调（含每轮 `inputTokens`/`outputTokens`），在 `message_start` 事件中捕获 token 用量
  - `repl/index.tsx` 的 160 行重复循环替换为 `runSharedAgentLoop()` + 5 个语义清晰的回调（约 60 行）
  - 移除 `repl/index.tsx` 中 6 个重复 import（`sendMessageStream`、`executeTools`、`compressContext` 等）
  - 移除 `main.tsx` 中孤立的 `sendMessageStream` import

---

## [1.4.4] - 2026-04-02

### 修复
- **npm 11+ 全局安装后 `dist/cli.js` 缺失（根治）**：npm 11 将 GitHub git dep 安装为指向临时目录的符号链接/Junction，安装完成后临时目录被清理，链接悬空导致 `Cannot find module dist/cli.js`。改为通过 GitHub Release tarball 安装（`npm install -g https://github.com/.../tikat-codex-x.x.x.tgz`），tarball 包含完整文件，不依赖临时目录
- 新增 `files` 字段至 `package.json`，明确指定 `["dist/", "README.md", "CHANGELOG.md"]` 随包发布
- 更新 README 安装命令为 tarball 方式

---

## [1.4.3] - 2026-04-02

### 修复
- **Windows 安装 ENOTEMPTY / EPERM 错误根治**：将所有运行时依赖从 `dependencies` 移至 `devDependencies`。由于 `dist/cli.js` 是 esbuild 完整打包的单文件（所有依赖已内嵌），全局安装时不再需要 `node_modules`，彻底消除 Windows 路径过长导致的 `ENOTEMPTY`/`EPERM` 错误和大量 `TAR_ENTRY_ERROR` 警告
- 新增 `.npmignore` 文件，避免 `gitignore-fallback` 警告并减小安装包体积

---

## [1.4.2] - 2026-04-02

### 修复
- **Windows 更新 EPERM 错误**：`codex update` 在 Windows 上会因当前进程占用 `dist/cli.js` 导致 npm 报 EPERM (-4048) 权限错误。修复方案：改为将 npm install 命令以完全独立的后台进程启动（延迟 3 秒等待当前进程退出释放文件锁），然后当前进程立即退出。更新界面新增"后台更新已启动"提示状态
- **内部命名残留清理**：`prompts.ts` 参数名 `claudeMd` → `projectInstructions`；注释中 "CLAUDE.md" → "TIKAT.md"；`TodoWriteTool` 目录路径 `.Tikat-Codex` → `.tikat-codex`（小写，跨平台一致）

---

## [1.4.1] - 2026-04-02

### 改进
- **项目指令文件更名**：`CLAUDE.md` → `TIKAT.md`（Tikat-Codex 自有品牌命名），保留 `CODEX.md` 和 `.tikat.md` 作为备选文件名

---

## [1.4.0] - 2026-04-02

### 新增
- **完整行为规范系统提示词**：从 4 行扩展为 ~150 行专业级提示词，覆盖 Claude Code 核心行为原则：
  - 工具使用优先级（专用工具 > Bash，读取后再编辑）
  - 并行工具调用规范
  - 破坏性操作确认清单（删除文件、force-push、推送到远端等）
  - Git 安全协议（不跑 --no-verify、不 force-push main、分级 stage 文件等）
  - 代码风格原则（不过度工程化、不添加未请求的注释/重构）
  - 输出简洁性规范（直奔要点、不废话）
  - 安全边界（防注入、不硬编码 key）
- **TIKAT.md 项目级指令支持**：启动时自动读取工作目录中的 `TIKAT.md`、`CODEX.md` 或 `.tikat.md`，注入系统提示，实现项目专属行为定制
- **Git 上下文注入**：自动检测当前目录的 git 状态（分支名、未提交变更、最近 5 条提交），注入系统提示，让 AI 知道当前代码库状态
- **环境信息注入**：自动注入平台（Windows/macOS/Linux）、OS 版本、Node.js 版本、当前日期，让 AI 回答平台相关问题时更准确

### 改进
- SubAgent 现在也使用完整行为规范提示词，不再是精简版
- 系统提示词提取到 `src/constants/prompts.ts` 统一管理，`buildSystemPrompt()` 接受可选的额外上下文片段

---

## [1.3.4] - 2026-04-02

### 代码质量
- **消除 SYSTEM_PROMPT 重复定义**：`repl/index.tsx` 和 `main.tsx` 中相同的 4 行系统提示词提取到 `src/constants/prompts.ts`，统一从一处维护

### 修复
- **`FileEditTool` 行数统计符号错误**：`Math.abs()` 导致删除行时也显示 `+N lines`，改为显示实际增减（`+N` 或 `-N`）
- **`FileReadTool` 传入目录路径崩溃**：传入目录路径时 `readFile` 抛出 `EISDIR` 错误，现在提前检测并返回友好提示（建议使用 LS 工具）
- **非交互模式工具输出错位**：`-p` 模式下工具名（`🔧 Name...`）和结果符号（`✓/✗`）分开写入，多工具并发时输出顺序混乱；现在每行完整展示 `🔧 Name... ✓`

---

## [1.3.3] - 2026-04-02

### 修复
- **`codex -p` 非交互模式无法执行工具调用**：原实现只打印流式文字，AI 说「让我来做...」后即退出。现已改为完整的 Agentic 循环（最多 50 轮），支持工具调用（文件读写、bash、搜索等），终端显示工具调用进度（🔧 工具名... ✓）

---

## [1.3.2] - 2026-04-02

### 修复
- **git 远端 URL**：本地仓库远端地址更新为 `https://github.com/TikatAK/Tikat-Codex.git`（与 GitHub 更名同步）
- **`diagnose` 配置目录大小写错误**：`src/commands/diagnose/index.ts` 中配置目录为 `.Tikat-Codex`，已修正为 `.tikat-codex`，与 settings 和 sessions 模块保持一致
- **README 配置目录文档错误**：`配置文件位置` 章节中的路径已修正为 `~/.tikat-codex/`，并补充 `sessions/` 目录说明
- **package.json name 大小写**：修正为全小写 `tikat-codex`，符合 npm 包名规范
- **`SLASH_COMMANDS` 不完整**：补充 v1.1.0 和 v1.2.0 新增的 `/sessions`、`/resume`、`/save`、`/delete`、`/diagnose`、`/update`
- **测试临时目录命名**：`sessions.test.ts` 中 `tikatak-test-home` 同步更名为 `tikat-test-home`

### 新增
- **自动迁移旧配置**：首次启动 v1.3.x 时，自动将 `~/.tikatak-codex/` 的配置文件静默复制到 `~/.tikat-codex/`，已有用户无需手动迁移

---

## [1.3.0] - 2026-04-02

### 重大变更
- **项目更名**：`TikatAK-Codex` → `Tikat-Codex`
  - npm 包名：`tikatak-codex` → `tikat-codex`
  - 配置目录：`~/.tikatak-codex` → `~/.tikat-codex`
  - 二进制别名：`tikatak-codex` → `tikat-codex`（主命令 `codex` 不变）
  - 环境变量：`TIKATAK_VERSION` → `TIKAT_VERSION`
  - GitHub 仓库链接同步更新为 `TikatAK/Tikat-Codex`

> **升级注意**：如已配置 API Key，请将 `~/.tikatak-codex/` 目录内容复制到 `~/.tikat-codex/`，或重新运行 `codex provider set`。

---

## [1.2.2] - 2026-04-02

### 修复
- **弃用警告**：shebang 改为 `#!/usr/bin/env node --no-deprecation`，彻底消除第三方依赖（openai SDK、commander）产生的 `DEP0040`（punycode）和 `DEP0169`（url.parse）警告，输出更干净

---

## [1.2.1] - 2026-04-02

### 新增
- **自动化测试套件**：引入 `vitest`，覆盖 7 个核心模块，共 38 个测试用例（100% 通过）
  - `highlight`、`context`、`sessions`、`withRetry`、`streamAdapter`、`requestAdapter`、`responseAdapter`

### 修复
- **`generateId()` 同毫秒碰撞 bug**：`sessions` ID 生成精度从秒级（`slice(0,19)`）提升到毫秒级（`slice(0,23)`），防止同一秒内创建多个会话时 ID 重复覆盖

---

## [1.2.0] - 2026-04-02

### 新增
- **代码语法高亮**：AI 回复中的代码块（\`\`\`lang）自动着色，支持 JS/TS/Python/Go/Rust/Bash 等
- **Markdown 加粗渲染**：`**文字**` 和 `*文字*` 在终端中正确显示
- **`codex diagnose` 命令**：一键诊断 Node.js 版本、提供商配置、API 端点可达性、模型推理可用性
- **`/diagnose` REPL 斜杠命令**：在会话中快速调用诊断
- **上下文自动压缩**：对话超过 40 条消息时自动压缩早期历史（保留最近 10 条），防止 token 溢出，压缩时显示估算 token 数
- **新增提供商预设**：
  - Groq（超快推理）：llama-3.3-70b, llama-3.1-8b, deepseek-r1-distill, qwen-qwq-32b 等
  - 硅基流动 SiliconFlow：DeepSeek-V3/R1、Qwen3-235B、Qwen2.5-Coder-32B 等
  - OpenRouter（多模型聚合）：可访问 Claude/GPT/Gemini/DeepSeek 等数百个模型

### 改进
- `/help` 命令新增 `/diagnose` 条目

---

## [1.1.0] - 2026-04-02

### 新增
- **流式输出**：AI 回复现在实时逐字显示，不再等待完整响应才渲染，体验大幅提升
- **Token 用量显示**：每条 AI 消息下方显示输入/输出 token 数（📊 XXX↑ YYY↓ tokens）
- **会话持久化**：对话结束后自动保存至 `~/.Tikat-Codex/sessions/`，最多保留 20 条历史
- **会话管理命令**：`/sessions`（列表）、`/resume <id>`（恢复）、`/save`（手动保存）、`/delete <id>`（删除）
- **`-r / --resume` 启动参数**：`codex -r <session-id>` 直接从命令行恢复历史会话
- **`/help` 优化**：命令说明更完整，每条命令附带用途描述

### 改进
- 状态栏逻辑优化：流式传输中若已有文字则不显示"思考中"提示，减少闪烁

---

## [1.0.7] - 2026-04-01

### 修复
- **工具调用轮数上限过低**：主 REPL 从 20 轮提高到 50 轮，SubAgent 从 10 轮提高到 20 轮，处理复杂任务时不再过早中断

---

## [1.0.6] - 2026-04-01

### 新增
- 补充缺失的 `commander` 运行时依赖，确保从 GitHub 直接安装时不报模块缺失错误

### 修复
- **FileEditTool**：`String.replace()` 对含 `$&`、`$$`、`` $` `` 等特殊字符的替换内容行为错误，改用回调函数规避
- **FileWriteTool**：写入超过 5 MB 的内容时返回友好错误而非冻结 TUI
- **TodoWriteTool**：写入异常未捕获导致崩溃；新增重复 ID 检测
- **WebFetchTool**：非 http/https URL 抛出内部异常，改为提前做协议白名单校验
- **LSTool**：目录不存在时静默返回空，现返回明确错误信息
- **claude.ts**：`sendMessageStream` 流创建未经重试，现包裹 `withRetry()` 保护
- **withRetry.ts**：新增 HTTP 504 Gateway Timeout 为可重试错误
- **client.ts**：`apiKey`/`baseURL` 为空时提前抛出友好错误，不再依赖 SDK 内部神秘报错
- **settings/index.ts**：`deleteApiKey` 原用空字符串覆写，敏感 key 残留磁盘；改用文件删除

---

## [1.0.5] - 2026-04-01

### 修复
- **版本号始终显示 0.1.0**：`main.tsx` 和 `repl/index.tsx` 读取的环境变量名 `npm_package_version` 与 `build.mjs` 注入的 `TIKAT_VERSION` 不一致，导致 fallback 到硬编码的 `0.1.0`。现统一使用 `TIKAT_VERSION`

---

## [1.0.4] - 2026-04-01

### 修复
- **`codex update` 构建失败**：`prepare` 脚本在 npm 临时目录中找不到 `esbuild`（devDependency 未安装）导致安装失败。改为将预构建的 `dist/` 直接提交到仓库，安装即用，无需用户端编译
- 移除 `prepare` 脚本，消除安装时不必要的构建步骤

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
