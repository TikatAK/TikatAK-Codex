import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput, useApp, render } from 'ink'
import { providerCommand } from '../commands/provider/index.js'
import { getCwd } from '../utils/cwd.js'
import { saveSession, loadSession, listSessions, deleteSession } from '../utils/sessions/index.js'
import { highlight } from '../utils/highlight/index.js'
import { buildSystemPrompt } from '../constants/prompts.js'
import { readProjectInstructions, getGitContext, getEnvContext } from '../utils/context/session.js'
import { runAgentLoop as runSharedAgentLoop } from '../services/agent/loop.js'
import { MAX_AGENT_ROUNDS } from '../constants/index.js'
import type { AnthropicMessage } from '../adapters/openai/index.js'

interface ReplOptions {
  initialPrompt?: string
  model?: string
  resumeSessionId?: string
}

export async function launchRepl(opts: ReplOptions = {}): Promise<void> {
  const { waitUntilExit } = render(React.createElement(ReplApp, opts))
  await waitUntilExit()
}

type AgentStatus =
  | { type: 'idle' }
  | { type: 'streaming' }
  | { type: 'thinking' }
  | { type: 'tool'; toolName: string }
  | { type: 'error'; message: string }

interface DisplayMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  isError?: boolean
  usage?: { input: number; output: number }
}

interface ReplState {
  history: AnthropicMessage[]
  display: DisplayMessage[]
  streamingText: string
  inputBuffer: string
  model: string | undefined
  status: AgentStatus
  info: string | null
  sessionId: string | null     // current session ID (null = not yet saved)
}

function historyToDisplay(history: AnthropicMessage[]): DisplayMessage[] {
  return history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .flatMap((m): DisplayMessage[] => {
      if (m.role === 'user') {
        const c = typeof m.content === 'string' ? m.content : '[复杂消息]'
        return [{ role: 'user', content: c }]
      }
      const blocks = Array.isArray(m.content) ? m.content : []
      const text = blocks
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
        .join('')
      return text ? [{ role: 'assistant', content: text }] : []
    })
}

function ReplApp({ initialPrompt, model: initialModel, resumeSessionId }: ReplOptions) {
  const { exit } = useApp()
  const cwd = getCwd()

  // Build system prompt once with git context, TIKAT.md, and env info
  const systemPrompt = buildSystemPrompt({
    projectInstructions: readProjectInstructions(cwd) ?? undefined,
    gitContext: getGitContext(cwd) ?? undefined,
    envInfo: getEnvContext(),
  })

  // Optionally restore a previous session
  const restoredSession = resumeSessionId ? loadSession(resumeSessionId) : null
  const restoredDisplay = restoredSession ? historyToDisplay(restoredSession.history) : []

  const [state, setState] = useState<ReplState>({
    history: restoredSession?.history ?? [],
    display: restoredDisplay,
    streamingText: '',
    inputBuffer: '',
    model: restoredSession?.model ?? initialModel,
    status: { type: 'idle' },
    info: restoredSession ? `✅ 已恢复会话: ${restoredSession.title}` : null,
    sessionId: resumeSessionId ?? null,
  })

  const runAgentLoop = useCallback(async (userInput: string, currentState: ReplState) => {
    const initialMessages: AnthropicMessage[] = [
      ...currentState.history,
      { role: 'user', content: userInput },
    ]

    setState(s => ({
      ...s,
      history: initialMessages,
      display: [...s.display, { role: 'user', content: userInput }],
      streamingText: '',
      inputBuffer: '',
      status: { type: 'streaming' },
      info: null,
    }))

    try {
      const { messages, hitRoundLimit } = await runSharedAgentLoop({
        messages: initialMessages,
        system: systemPrompt,
        model: currentState.model,
        cwd,
        onText: chunk =>
          setState(s => ({ ...s, streamingText: s.streamingText + chunk })),
        onToolStart: toolName =>
          setState(s => ({ ...s, status: { type: 'tool', toolName } })),
        onToolResult: results =>
          setState(s => ({
            ...s,
            status: { type: 'streaming' },
            display: [
              ...s.display,
              ...results.map(r => {
                const full = r.content
                const truncated = full.length > 500
                return {
                  role: 'tool' as const,
                  content: truncated
                    ? `${full.slice(0, 500)}\n...(共 ${full.length} 字符，仅显示前 500)`
                    : full,
                  toolName: r.name,
                  isError: r.is_error,
                }
              }),
            ],
          })),
        onCompressed: est =>
          setState(s => ({ ...s, info: `🗜 上下文已压缩（约 ${est} tokens）` })),
        onTurnComplete: ({ text, inputTokens, outputTokens }) =>
          setState(s => ({
            ...s,
            streamingText: '',
            display: text
              ? [...s.display, { role: 'assistant' as const, content: text, usage: { input: inputTokens, output: outputTokens } }]
              : s.display,
          })),
      })

      const meta = saveSession(currentState.sessionId, messages, currentState.model)
      setState(s => ({
        ...s,
        history: messages,
        status: { type: 'idle' },
        sessionId: meta.id,
        ...(hitRoundLimit && {
          display: [
            ...s.display,
            { role: 'assistant' as const, content: `已完成 ${MAX_AGENT_ROUNDS} 轮工具调用。如果任务尚未完成，请继续描述下一步需要做什么。` },
          ],
        }),
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState(s => ({ ...s, streamingText: '', status: { type: 'error', message: msg } }))
    }
  }, [cwd])

  const submit = useCallback((input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return

    if (trimmed.startsWith('/')) {
      void handleSlashCommand(trimmed, state, setState, exit)
      return
    }

    if (state.status.type === 'error') {
      setState(s => ({ ...s, status: { type: 'idle' } }))
    }

    void runAgentLoop(trimmed, state)
  }, [state, runAgentLoop, exit])

  useInput((input, key) => {
    if (state.status.type !== 'idle' && state.status.type !== 'error') {
      if (key.ctrl && input === 'c') exit()
      return
    }
    if (key.return) { submit(state.inputBuffer); return }
    if (key.escape || (key.ctrl && input === 'c')) { exit(); return }
    if (key.backspace || key.delete) {
      setState(s => ({ ...s, inputBuffer: s.inputBuffer.slice(0, -1), info: null }))
      return
    }
    if (input && !key.ctrl && !key.meta) {
      setState(s => ({ ...s, inputBuffer: s.inputBuffer + input }))
    }
  })

  useEffect(() => {
    if (initialPrompt) void runAgentLoop(initialPrompt, state)
  }, [])

  const isBusy = state.status.type === 'streaming' || state.status.type === 'thinking' || state.status.type === 'tool'

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1} borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">⚡ Tikat-Codex</Text>
        {state.model && <Text color="gray">  [{state.model}]</Text>}
        <Text color="gray">  {cwd}</Text>
      </Box>

      {/* Message history */}
      {state.display.map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          {msg.role === 'user' && (
            <>
              <Text color="green" bold>▶ 你</Text>
              <Box paddingLeft={2}><Text wrap="wrap">{msg.content}</Text></Box>
            </>
          )}
          {msg.role === 'assistant' && (
            <>
              <Text color="cyan" bold>◆ Codex</Text>
              <Box paddingLeft={2}><Text wrap="wrap">{highlight(msg.content)}</Text></Box>
              {msg.usage && (
                <Box paddingLeft={2}>
                  <Text color="gray" dimColor>
                    📊 {msg.usage.input}↑ {msg.usage.output}↓ tokens
                  </Text>
                </Box>
              )}
            </>
          )}
          {msg.role === 'tool' && (
            <Box paddingLeft={2}>
              <Text color={msg.isError ? 'red' : 'yellow'} dimColor>
                {msg.isError ? '✗' : '✓'} [{msg.toolName}] {msg.content}
              </Text>
            </Box>
          )}
        </Box>
      ))}

      {/* Live streaming text */}
      {state.streamingText && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan" bold>◆ Codex</Text>
          <Box paddingLeft={2}><Text wrap="wrap">{state.streamingText}</Text></Box>
        </Box>
      )}

      {/* Status bar */}
      {state.status.type === 'streaming' && !state.streamingText && (
        <Box marginBottom={1}>
          <Text color="yellow">⏳ 思考中...</Text>
        </Box>
      )}
      {state.status.type === 'thinking' && (
        <Box marginBottom={1}>
          <Text color="yellow">⏳ 思考中...</Text>
        </Box>
      )}
      {state.status.type === 'tool' && (
        <Box marginBottom={1}>
          <Text color="yellow">🔧 调用工具: <Text bold>{state.status.toolName}</Text></Text>
        </Box>
      )}
      {state.status.type === 'error' && (
        <Box marginBottom={1} borderStyle="single" borderColor="red" paddingX={1}>
          <Text color="red">❌ {state.status.message}</Text>
        </Box>
      )}

      {/* Info */}
      {state.info && (
        <Box marginBottom={1}><Text color="gray">{state.info}</Text></Box>
      )}

      {/* Input */}
      {!isBusy ? (
        <Box>
          <Text color="green" bold>▶ </Text>
          <Text>{state.inputBuffer}</Text>
          <Text color="green" bold>█</Text>
        </Box>
      ) : (
        <Box>
          <Text color="gray" dimColor>Ctrl+C 中断</Text>
        </Box>
      )}
    </Box>
  )
}

async function handleSlashCommand(
  cmd: string,
  _state: ReplState,
  setState: React.Dispatch<React.SetStateAction<ReplState>>,
  exit: () => void,
): Promise<void> {
  const parts = cmd.trim().split(/\s+/)
  const command = parts[0]!
  const args = parts.slice(1)
  setState(s => ({ ...s, inputBuffer: '', info: null, status: { type: 'idle' as const } }))

  switch (command) {
    case '/exit': case '/quit': exit(); break
    case '/clear':
      setState(s => ({ ...s, history: [], display: [], streamingText: '', info: '✓ 上下文已清除', sessionId: null }))
      break
    case '/model':
      if (args[0]) setState(s => ({ ...s, model: args[0], info: `模型已切换: ${args[0]}` }))
      else setState(s => ({ ...s, info: `当前模型: ${s.model ?? '(提供商默认)'}` }))
      break
    case '/provider':
      await providerCommand(args[0])
      break
    case '/update':
      setState(s => ({ ...s, info: '⏳ 正在检查更新...' }))
      {
        const { checkForUpdates } = await import('../utils/updater.js')
        const VERSION = process.env['TIKAT_VERSION'] ?? '0.1.0'
        const info = await checkForUpdates(VERSION)
        if (!info.hasUpdate) {
          setState(s => ({ ...s, info: `✅ 已是最新版本 v${info.latestVersion}` }))
        } else {
          setState(s => ({
            ...s,
            info: `💡 新版本可用 v${info.currentVersion} → v${info.latestVersion}，退出后运行 codex update 更新`,
          }))
        }
      }
      break
    case '/diagnose':
      setState(s => ({ ...s, info: '🔍 请切换到终端查看诊断结果，或在新终端运行 codex diagnose' }))
      // Print diagnose output directly (outside ink render)
      setTimeout(async () => {
        const { diagnoseCommand } = await import('../commands/diagnose/index.js')
        await diagnoseCommand()
      }, 100)
      break
    case '/sessions': {
      const sessions = listSessions()
      if (sessions.length === 0) {
        setState(s => ({ ...s, info: '暂无保存的会话' }))
      } else {
        const lines = sessions.slice(0, 10).map((s, i) =>
          `${i + 1}. [${s.id}] ${s.title} (${s.messageCount} 条消息, ${s.updatedAt.slice(0, 10)})`
        )
        setState(s => ({ ...s, info: lines.join('\n') }))
      }
      break
    }
    case '/resume': {
      const sid = args[0]
      if (!sid) {
        setState(s => ({ ...s, info: '用法: /resume <session-id>，用 /sessions 查看列表' }))
        break
      }
      const sess = loadSession(sid)
      if (!sess) {
        setState(s => ({ ...s, info: `找不到会话: ${sid}` }))
        break
      }
      setState(s => ({
        ...s,
        history: sess.history,
        display: historyToDisplay(sess.history),
        streamingText: '',
        sessionId: sess.id,
        model: sess.model ?? s.model,
        info: `✅ 已恢复会话: ${sess.title}`,
      }))
      break
    }
    case '/save': {
      // Force-save current session
      setState(s => {
        if (s.history.length === 0) return { ...s, info: '没有可保存的对话' }
        const meta = saveSession(s.sessionId, s.history, s.model)
        return { ...s, sessionId: meta.id, info: `✅ 已保存: [${meta.id}] ${meta.title}` }
      })
      break
    }
    case '/delete': {
      const did = args[0]
      if (!did) { setState(s => ({ ...s, info: '用法: /delete <session-id>' })); break }
      const ok = deleteSession(did)
      setState(s => ({ ...s, info: ok ? `✅ 已删除会话: ${did}` : `找不到会话: ${did}` }))
      break
    }
    case '/help':
      setState(s => ({
        ...s,
        info: [
          '/provider [set|status|test|list]  — 管理 AI 提供商',
          '/model <id>                       — 切换模型',
          '/sessions                         — 列出历史会话',
          '/resume <id>                      — 恢复历史会话',
          '/save                             — 手动保存当前会话',
          '/delete <id>                      — 删除会话',
          '/clear                            — 清除当前对话',
          '/diagnose                         — 诊断网络/配置/模型连接',
          '/update                           — 检查版本更新',
          '/exit                             — 退出',
        ].join('\n'),
      }))
      break
    default:
      setState(s => ({ ...s, info: `未知命令: ${command}，输入 /help 查看帮助` }))
  }
}
