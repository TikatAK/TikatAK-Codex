import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput, useApp, render } from 'ink'
import { sendMessageStream } from '../services/api/claude.js'
import { executeTools } from '../services/api/toolExecutor.js'
import { providerCommand } from '../commands/provider/index.js'
import { getCwd } from '../utils/cwd.js'
import { saveSession, loadSession, listSessions, deleteSession } from '../utils/sessions/index.js'
import { compressContext, estimateTokens } from '../utils/context/index.js'
import { highlight } from '../utils/highlight/index.js'
import type { AnthropicMessage, AnthropicBlock } from '../adapters/openai/index.js'
import type { AnthropicToolUseBlock, AnthropicTextBlock } from '../adapters/openai/responseAdapter.js'

const MAX_TOOL_ROUNDS = 50
const SYSTEM_PROMPT = `You are Tikat-Codex, an expert AI coding assistant.
You have access to tools to read files, write files, run bash commands, search code, and browse the web.
Always use tools to actually perform tasks rather than just describing what to do.
Current working directory will be provided in each request.`

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

function ReplApp({ initialPrompt, model: initialModel, resumeSessionId }: ReplOptions) {
  const { exit } = useApp()
  const cwd = getCwd()

  // Optionally restore a previous session
  const restoredSession = resumeSessionId ? loadSession(resumeSessionId) : null
  const restoredDisplay: DisplayMessage[] = restoredSession
    ? restoredSession.history
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
    : []

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
    const userMsg: AnthropicMessage = { role: 'user', content: userInput }
    let messages: AnthropicMessage[] = [...currentState.history, userMsg]

    setState(s => ({
      ...s,
      history: messages,
      display: [...s.display, { role: 'user', content: userInput }],
      streamingText: '',
      inputBuffer: '',
      status: { type: 'streaming' },
      info: null,
    }))

    let loopCompleted = false
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      try {
        // ── Context compression ───────────────────────────────────────────
        const { messages: compressedMessages, compressed } = compressContext(messages)
        if (compressed) {
          const est = estimateTokens(compressedMessages)
          setState(s => ({ ...s, info: `🗜 上下文已压缩（约 ${est} tokens）` }))
        }

        // ── Consume stream and reconstruct response ──────────────────────
        const streamGen = sendMessageStream({
          messages: compressedMessages,
          system: `${SYSTEM_PROMPT}\nWorking directory: ${cwd}`,
          model: currentState.model,
        })

        let textContent = ''
        let inputTokens = 0
        let outputTokens = 0
        let stopReason: string = 'end_turn'
        const toolAccumulator = new Map<number, { id: string; name: string; argsJson: string }>()

        for await (const event of streamGen) {
          if (event.type === 'message_start') {
            inputTokens = event.usage.input_tokens
          } else if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const text = event.delta.text
            textContent += text
            setState(s => ({ ...s, streamingText: s.streamingText + text }))
          } else if (
            event.type === 'content_block_start' &&
            event.content_block.type === 'tool_use'
          ) {
            const tb = event.content_block
            toolAccumulator.set(event.index, { id: tb.id, name: tb.name, argsJson: '' })
            setState(s => ({ ...s, status: { type: 'tool', toolName: tb.name } }))
          } else if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'input_json_delta'
          ) {
            const acc = toolAccumulator.get(event.index)
            if (acc) acc.argsJson += event.delta.partial_json
          } else if (event.type === 'message_delta') {
            stopReason = event.delta.stop_reason
            outputTokens = event.usage.output_tokens
          }
        }

        // ── Commit streamed text to display ──────────────────────────────
        if (textContent) {
          setState(s => ({
            ...s,
            streamingText: '',
            display: [
              ...s.display,
              {
                role: 'assistant' as const,
                content: textContent,
                usage: { input: inputTokens, output: outputTokens },
              },
            ],
          }))
        } else {
          setState(s => ({ ...s, streamingText: '' }))
        }

        // ── Build content blocks ─────────────────────────────────────────
        const contentBlocks: AnthropicBlock[] = []
        if (textContent) {
          contentBlocks.push({ type: 'text', text: textContent } satisfies AnthropicTextBlock)
        }
        const toolUseBlocks: AnthropicToolUseBlock[] = []
        for (const [, acc] of toolAccumulator) {
          let parsedInput: unknown = {}
          try { parsedInput = JSON.parse(acc.argsJson || '{}') } catch { parsedInput = {} }
          const tb: AnthropicToolUseBlock = { type: 'tool_use', id: acc.id, name: acc.name, input: parsedInput }
          contentBlocks.push(tb)
          toolUseBlocks.push(tb)
        }

        // ── No tools — done ───────────────────────────────────────────────
        if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
          messages = [...messages, { role: 'assistant', content: contentBlocks }]
          // Auto-save session after each complete turn
          const meta = saveSession(currentState.sessionId, messages, currentState.model)
          setState(s => ({ ...s, history: messages, status: { type: 'idle' }, sessionId: meta.id }))
          loopCompleted = true
          break
        }

        // ── Execute tools in parallel ────────────────────────────────────
        const results = await executeTools(toolUseBlocks, { cwd, signal: undefined })

        for (const result of results) {
          const full = result.content
          const truncated = full.length > 500
          const displayContent = truncated
            ? `${full.slice(0, 500)}\n...(共 ${full.length} 字符，仅显示前 500)`
            : full
          setState(s => ({
            ...s,
            display: [
              ...s.display,
              { role: 'tool' as const, content: displayContent, toolName: result.name, isError: result.is_error },
            ],
          }))
        }

        // ── Build next round messages ─────────────────────────────────────
        const assistantMsg: AnthropicMessage = { role: 'assistant', content: contentBlocks }
        const toolResultMsg: AnthropicMessage = {
          role: 'user',
          content: results.map(r => ({
            type: 'tool_result' as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          })),
        }
        messages = [...messages, assistantMsg, toolResultMsg]
        setState(s => ({ ...s, history: messages, status: { type: 'streaming' } }))

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState(s => ({ ...s, streamingText: '', status: { type: 'error', message: msg } }))
        loopCompleted = true
        break
      }
    }

    if (!loopCompleted) {
      setState(s => ({
        ...s,
        history: messages,
        streamingText: '',
        status: { type: 'idle' },
        display: [
          ...s.display,
          { role: 'assistant', content: `⚠️ 已达到最大工具调用轮数 (${MAX_TOOL_ROUNDS})，自动停止执行。` },
        ],
      }))
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
      const restoredDisp: DisplayMessage[] = sess.history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .flatMap((m): DisplayMessage[] => {
          if (m.role === 'user') {
            const c = typeof m.content === 'string' ? m.content : '[复杂消息]'
            return [{ role: 'user', content: c }]
          }
          const blocks = Array.isArray(m.content) ? m.content : []
          const text = blocks
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map(b => b.text).join('')
          return text ? [{ role: 'assistant', content: text }] : []
        })
      setState(s => ({
        ...s,
        history: sess.history,
        display: restoredDisp,
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
