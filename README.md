# Tikat-Codex

**一个支持任意 OpenAI 兼容提供商的 AI 编程助手 CLI**

> 基于 Claude Code 2.1.88 的架构理念重写，支持 DeepSeek、OpenAI、Kimi、通义千问、GLM、Mistral、Gemini、Ollama 等任意兼容 OpenAI API 的提供商。

[![GitHub release](https://img.shields.io/github/v/release/TikatAK/Tikat-Codex)](https://github.com/TikatAK/Tikat-Codex/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Beta](https://img.shields.io/badge/status-beta-orange)

> ⚠️ **Beta 版本**：核心功能已可用，但仍处于早期阶段，可能存在未知问题。欢迎提 [Issue](https://github.com/TikatAK/Tikat-Codex/issues) 反馈。

---

## 快速开始

### 安装

```bash
# 方式一：从 GitHub 全局安装（推荐）
npm install -g github:TikatAK/Tikat-Codex

# 方式二：克隆源码本地安装
git clone https://github.com/TikatAK/Tikat-Codex.git
cd Tikat-Codex
npm install && npm run build
npm install -g .
```

### 首次配置

```bash
# 启动后自动引导配置提供商
codex

# 或手动进入配置界面
codex provider set
```

### 使用环境变量（免配置，适合 CI/脚本）

```bash
export CODEX_BASE_URL=https://api.deepseek.com/v1
export CODEX_API_KEY=sk-xxxx
export CODEX_MODEL=deepseek-chat

codex
```

---

## 支持的提供商

| 提供商 | Base URL |
|--------|----------|
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Groq（超快推理）| `https://api.groq.com/openai/v1` |
| 硅基流动 SiliconFlow | `https://api.siliconflow.cn/v1` |
| OpenRouter（多模型聚合）| `https://openrouter.ai/api/v1` |
| Kimi (月之暗面) | `https://api.moonshot.cn/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` |
| Mistral | `https://api.mistral.ai/v1` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Ollama (本地) | `http://localhost:11434/v1` |
| LM Studio (本地) | `http://localhost:1234/v1` |
| 自定义端点 | 任意 URL |

---

## 使用方法

```bash
# 交互式 REPL
codex

# 带初始提示启动
codex "帮我重构 src/auth.ts"

# 非交互式（输出结果后退出）
codex -p "解释这段代码"

# 指定模型
codex -m deepseek-coder-v2

# 恢复上次会话
codex -r <session-id>

# 管理提供商
codex provider set       # 可视化配置
codex provider status    # 查看当前配置
codex provider test      # 测试连接
codex provider list      # 列出所有预设

# 诊断工具（检查网络/配置/模型连接）
codex diagnose

# 检查并更新版本
codex update
```

### REPL 内斜杠命令

| 命令 | 说明 |
|------|------|
| `/provider [set\|status\|test\|list]` | 管理提供商 |
| `/model <model-id>` | 切换模型 |
| `/sessions` | 列出历史会话 |
| `/resume <id>` | 恢复历史会话 |
| `/save` | 手动保存当前会话 |
| `/delete <id>` | 删除会话 |
| `/update` | 检查是否有新版本 |
| `/clear` | 清除当前对话上下文 |
| `/help` | 显示帮助 |
| `/exit` | 退出 |

---

## 项目级行为定制（TIKAT.md）

在项目根目录创建 `TIKAT.md` 文件，Tikat-Codex 启动时会自动读取并注入系统提示，让 AI 遵守项目专属规范：

```markdown
# TIKAT.md 示例

## 项目规范
- 所有代码使用 TypeScript，禁止 any
- 函数命名使用 camelCase，组件使用 PascalCase
- 测试文件放在 src/__tests__/ 目录

## 提交规范
- 使用 Conventional Commits 格式
- 提交前必须运行 npm test

## 代码风格
- 缩进使用 2 个空格
- 优先使用函数式写法
```

支持的文件名：`TIKAT.md`（首选）、`CODEX.md`、`.tikat.md`

---

## 工具能力

AI 在回答时可自动调用以下工具：

| 工具 | 功能 |
|------|------|
| `Bash` | 执行 shell 命令（Windows/Unix 自适应）|
| `FileRead` | 读取文件（支持分页，大文件保护）|
| `FileEdit` | 精确字符串替换编辑文件 |
| `FileWrite` | 写入/覆盖整个文件 |
| `Grep` | 正则搜索代码（无需安装 rg）|
| `Glob` | 文件模式匹配 |
| `LS` | 列出目录结构 |
| `WebFetch` | 抓取网页内容 |
| `TodoWrite/Read` | 任务跟踪 |
| `SubAgent` | 派发子任务给独立 Agent |

---

## 版本管理

```bash
# 检查是否有新版本（也会在每次启动时后台自动检查）
codex update

# 开发者发布新版本
npm run release:patch   # bug 修复  x.x.0 → x.x.1
npm run release:minor   # 新功能    x.0.x → x.1.x
npm run release:major   # 大版本    0.x.x → 1.x.x
```

---

## 架构

```
src/
├── main.tsx              # CLI 入口
├── repl/                 # 交互式 REPL (React + Ink TUI)
├── providers/            # 提供商抽象层
│   ├── types.ts          # ProviderConfig 接口
│   ├── registry.ts       # 内置预设列表
│   ├── client.ts         # OpenAI SDK 工厂
│   └── activeProvider.ts # 加载当前配置
├── adapters/openai/      # 消息格式转换
│   ├── requestAdapter.ts # Anthropic → OpenAI
│   ├── responseAdapter.ts# OpenAI → Anthropic
│   └── streamAdapter.ts  # SSE 流转换
├── services/api/         # API 调用层
│   ├── claude.ts         # sendMessage / sendMessageStream
│   ├── toolExecutor.ts   # 工具并行执行（带超时保护）
│   └── withRetry.ts      # 指数退避重试
├── tools/                # 工具实现
├── commands/             # CLI 子命令
├── components/           # Ink UI 组件
└── utils/                # 工具函数（含 updater）
```

---

## 配置文件位置

- 设置: `~/.tikat-codex/settings.json`
- API Key: `~/.tikat-codex/apikey`（权限 0600，仅当前用户可读）
- 历史会话: `~/.tikat-codex/sessions/`

---

## 开发

```bash
npm run build       # 生产构建
npm run dev         # 监听模式构建
npm run typecheck   # TypeScript 类型检查

# 本地测试（不影响全局 codex）
node dist/cli.js
```

---

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

---

## License

MIT

