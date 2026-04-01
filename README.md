# TikatAK-Codex

**一个支持任意 OpenAI 兼容提供商的 AI 编程助手 CLI**

> 基于 Claude Code 2.1.88 的架构理念重写，支持 DeepSeek、OpenAI、Kimi、通义千问、GLM、Mistral、Gemini、Ollama 等任意兼容 OpenAI API 的提供商。

---

## 快速开始

### 安装

```bash
# 方式一：从源码构建
git clone <this-repo>
cd TikatAK-Codex
npm install
npm run build

# 全局安装（可选）
npm install -g .
```

### 首次配置

```bash
# 启动后自动引导配置提供商
node dist/cli.js

# 或手动配置
node dist/cli.js provider set
```

### 直接使用环境变量（免配置）

```bash
export CODEX_BASE_URL=https://api.deepseek.com/v1
export CODEX_API_KEY=sk-xxxx
export CODEX_MODEL=deepseek-coder

node dist/cli.js
```

---

## 支持的提供商

| 提供商 | ID | Base URL |
|--------|-----|----------|
| DeepSeek | `deepseek` | `https://api.deepseek.com/v1` |
| OpenAI | `openai` | `https://api.openai.com/v1` |
| Kimi (月之暗面) | `kimi` | `https://api.moonshot.cn/v1` |
| 通义千问 | `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 智谱 GLM | `glm` | `https://open.bigmodel.cn/api/paas/v4` |
| Mistral | `mistral` | `https://api.mistral.ai/v1` |
| Gemini | `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Ollama (本地) | `ollama` | `http://localhost:11434/v1` |
| LM Studio (本地) | `lmstudio` | `http://localhost:1234/v1` |
| 自定义端点 | `custom` | 任意 URL |

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

# 管理提供商
codex provider set       # 可视化配置
codex provider status    # 查看当前配置
codex provider test      # 测试连接
codex provider list      # 列出所有预设
```

### REPL 内斜杠命令

| 命令 | 说明 |
|------|------|
| `/provider [set\|status\|test\|list]` | 管理提供商 |
| `/model <model-id>` | 切换模型 |
| `/clear` | 清除对话历史 |
| `/help` | 显示帮助 |
| `/exit` | 退出 |

---

## 工具能力

AI 在回答时可自动调用以下工具：

| 工具 | 功能 |
|------|------|
| `Bash` | 执行 shell 命令 |
| `FileRead` | 读取文件（支持分页） |
| `FileEdit` | 精确字符串替换编辑文件 |
| `FileWrite` | 写入/覆盖整个文件 |
| `Grep` | 正则搜索代码 |
| `Glob` | 文件模式匹配 |
| `LS` | 列出目录结构 |
| `WebFetch` | 抓取网页内容 |
| `TodoWrite/Read` | 任务跟踪 |
| `SubAgent` | 派发子任务给独立 Agent |

---

## 架构

```
src/
├── main.tsx              # CLI 入口
├── repl/                 # 交互式 REPL (React + Ink TUI)
├── providers/            # 提供商抽象层
│   ├── types.ts          # ProviderConfig 接口
│   ├── registry.ts       # 9 个内置预设
│   ├── client.ts         # OpenAI SDK 工厂
│   └── activeProvider.ts # 加载当前配置
├── adapters/openai/      # 消息格式转换
│   ├── requestAdapter.ts # Anthropic → OpenAI
│   ├── responseAdapter.ts# OpenAI → Anthropic
│   └── streamAdapter.ts  # SSE 流转换
├── services/api/         # API 调用层
│   ├── claude.ts         # sendMessage / sendMessageStream
│   ├── toolExecutor.ts   # 工具并行执行
│   └── withRetry.ts      # 指数退避重试
├── tools/                # 工具实现
├── commands/provider/    # /provider 命令
├── components/           # Ink UI 组件
└── utils/                # 工具函数
```

---

## 配置文件位置

- 设置: `~/.tikatak-codex/settings.json`
- API Key: `~/.tikatak-codex/apikey` (权限 0600)

---

## 开发

```bash
npm run dev       # 监听模式构建
npm run typecheck # 类型检查
npm run build     # 生产构建
```

---

## License

MIT
