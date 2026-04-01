import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput, useApp, render } from 'ink'
import { sendMessage } from '../services/api/claude.js'
import { executeTools } from '../services/api/toolExecutor.js'
import { providerCommand } from '../commands/provider/index.js'
import { getCwd } from '../utils/cwd.js'
import type { AnthropicMessage, AnthropicBlock } from '../adapters/openai/index.js'
import type { AnthropicToolUseBlock } from '../adapters/openai/responseAdapter.js'

const MAX_TOOL_ROUNDS = 20
const SYSTEM_PROMPT = `You are TikatAK-Codex, an expert AI coding assistant.
You have access to tools to read files, write files, run bash commands, search code, and browse the web.
Always use tools to actually perform tasks rather than just describing what to do.
Current working directory will be provided in each request.`

interface ReplOptions {
  initialPrompt?: string
  model?: string
}

export async function launchRepl(opts: ReplOptions = {}): Promise<void> {
  const { waitUntilExit } = render(React.createElement(ReplApp, opts))
  await waitUntilExit()
}

type AgentStatus =
  | { type: 'idle' }
  | { type: 'thinking' }
  | { type: 'tool'; toolName: string; description?: string }
  | { type: 'error'; message: string }

interface DisplayMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  isError?: boolean
}

interface ReplState {
  history: AnthropicMessage[]          // full message history for API
  display: DisplayMessage[]            // display-only messages
  inputBuffer: string
  model: string | undefined
  status: AgentStatus
  info: string | null
}

function ReplApp({ initialPrompt, model: initialModel }: ReplOptions) {
  const { exit } = useApp()
  const cwd = getCwd()

  const [state, setState] = useState<ReplState>({
    history: [],
    display: [],
    inputBuffer: '',
    model: initialModel,
    status: { type: 'idle' },
    info: null,
  })

  const runAgentLoop = useCallback(async (userInput: string, currentState: ReplState) => {
    const userMsg: AnthropicMessage = { role: 'user', content: userInput }
    let messages: AnthropicMessage[] = [...currentState.history, userMsg]

    setState(s => ({
      ...s,
      history: messages,
      display: [...s.display, { role: 'user', content: userInput }],
      inputBuffer: '',
      status: { type: 'thinking' },
      info: null,
    }))

    // Agentic loop: model may call tools multiple times
    let loopCompleted = false
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      try {
        const response = await sendMessage({
          messages,
          system: `${SYSTEM_PROMPT}\nWorking directory: ${cwd}`,
          model: currentState.model,
        })

        // Collect text and tool_use blocks
        const textBlocks = response.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        const toolBlocks = response.content.filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use')

        const textContent = textBlocks.map(b => b.text).join('')

        // Add assistant response to display
        if (textContent) {
          setState(s => ({
            ...s,
            display: [...s.display, { role: 'assistant', content: textContent }],
          }))
        }

        // No tools called — done
        if (toolBlocks.length === 0 || response.stop_reason === 'end_turn') {
          messages = [...messages, { role: 'assistant', content: response.content as AnthropicBlock[] }]
          setState(s => ({ ...s, history: messages, status: { type: 'idle' } }))
          loopCompleted = true
          break
        }

        // Show tool usage in UI
        for (const tool of toolBlocks) {
          setState(s => ({
            ...s,
            status: { type: 'tool', toolName: tool.name },
          }))
        }

        // Execute all tool calls in parallel
        const results = await executeTools(toolBlocks, { cwd, signal: undefined })

        // Show tool results in display (with size info if truncated)
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
              {
                role: 'tool' as const,
                content: displayContent,
                toolName: result.name,
                isError: result.is_error,
              },
            ],
          }))
        }

        // Build next iteration messages: add assistant tool_use + user tool_results
        const assistantMsg: AnthropicMessage = {
          role: 'assistant',
          content: response.content as AnthropicBlock[],
        }
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
        setState(s => ({ ...s, history: messages, status: { type: 'thinking' } }))

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState(s => ({
          ...s,
          status: { type: 'error', message: msg },
        }))
        loopCompleted = true
        break
      }
    }

    // Reached MAX_TOOL_ROUNDS without natural completion
    if (!loopCompleted) {
      setState(s => ({
        ...s,
        history: messages,
        status: { type: 'idle' },
        display: [
          ...s.display,
          {
            role: 'assistant',
            content: `⚠️ 已达到最大工具调用轮数 (${MAX_TOOL_ROUNDS})，自动停止执行。`,
          },
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

    // Clear error state before running new loop
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

  const isbusy = state.status.type === 'thinking' || state.status.type === 'tool'

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1} borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">⚡ TikatAK-Codex</Text>
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
              <Box paddingLeft={2}><Text wrap="wrap">{msg.content}</Text></Box>
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

      {/* Status bar */}
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
      {!isbusy ? (
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
      setState(s => ({ ...s, history: [], display: [], info: '✓ 上下文已清除' }))
      break
    case '/model':
      if (args[0]) setState(s => ({ ...s, model: args[0], info: `模型已切换: ${args[0]}` }))
      else setState(s => ({ ...s, info: `当前模型: ${s.model ?? '(提供商默认)'}` }))
      break
    case '/provider':
      await providerCommand(args[0])
      break
    case '/help':
      setState(s => ({
        ...s,
        info: '/provider [set|status|test|list]  /model <id>  /clear  /exit',
      }))
      break
    default:
      setState(s => ({ ...s, info: `未知命令: ${command}，输入 /help 查看帮助` }))
  }
}
