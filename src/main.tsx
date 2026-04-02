import { Command } from '@commander-js/extra-typings'
import chalk from 'chalk'
import { isProviderConfigured } from './providers/activeProvider.js'
import { providerCommand } from './commands/provider/index.js'
import { sendMessageStream } from './services/api/claude.js'
import { checkForUpdates } from './utils/updater.js'
import { buildSystemPrompt } from './constants/prompts.js'
import { readProjectInstructions, getGitContext, getEnvContext } from './utils/context/session.js'

const VERSION = process.env['TIKAT_VERSION'] ?? '0.1.0'

/** Silent background update check — shows a one-line hint if update is available */
async function silentUpdateCheck(): Promise<void> {
  try {
    const info = await checkForUpdates(VERSION)
    if (info.hasUpdate) {
      console.log(
        chalk.cyan(`💡 新版本可用: v${info.currentVersion} → v${info.latestVersion}`) +
        chalk.gray('  运行 codex update 来更新')
      )
    }
  } catch {
    // Never block startup on update check failure
  }
}

const program = new Command()
  .name('codex')
  .description('Tikat-Codex — AI coding assistant with any OpenAI-compatible provider')
  .version(VERSION)

program
  .command('provider [subcommand]')
  .description('Manage AI provider configuration (set, status, test, list)')
  .action(async (subcommand?: string) => {
    await providerCommand(subcommand)
  })

program
  .command('update')
  .description('Check for updates and optionally upgrade to the latest version')
  .action(async () => {
    const { updateCommand } = await import('./commands/update/index.js')
    await updateCommand(VERSION)
  })

program
  .command('diagnose')
  .description('Run diagnostics: check Node.js version, provider config, network and model connectivity')
  .action(async () => {
    const { diagnoseCommand } = await import('./commands/diagnose/index.js')
    await diagnoseCommand()
  })

program
  .argument('[prompt]', 'Optional prompt to run non-interactively')
  .option('-m, --model <model>', 'Override model for this session')
  .option('-p, --print', 'Print output and exit (non-interactive)')
  .option('-r, --resume <sessionId>', 'Resume a previous session by ID')
  .action(async (prompt?: string, opts?: { model?: string; print?: boolean; resume?: string }) => {
    if (!isProviderConfigured()) {
      console.log(chalk.yellow('\n⚡ 欢迎使用 Tikat-Codex！'))
      console.log(chalk.gray('首次使用，请先配置 AI 提供商：\n'))
      await providerCommand('set')
      if (!isProviderConfigured()) {
        console.log(chalk.red('\n未配置提供商，退出。'))
        process.exit(1)
      }
    }

    // Background update check — non-blocking, doesn't delay startup
    void silentUpdateCheck()

    if (prompt !== undefined && opts?.print === true) {
      await runNonInteractive(prompt, opts.model)
    } else if (prompt !== undefined) {
      await startRepl(prompt, opts?.model, opts?.resume)
    } else {
      await startRepl(undefined, opts?.model, opts?.resume)
    }
  })

async function runNonInteractive(prompt: string, model?: string): Promise<void> {
  const { executeTools } = await import('./services/api/toolExecutor.js')
  const { getCwd } = await import('./utils/cwd.js')
  const { compressContext } = await import('./utils/context/index.js')
  const cwd = getCwd()

  const systemPrompt = buildSystemPrompt({
    claudeMd: readProjectInstructions(cwd) ?? undefined,
    gitContext: getGitContext(cwd) ?? undefined,
    envInfo: getEnvContext(),
  })

  const MAX_ROUNDS = 50
  let messages: import('./adapters/openai/index.js').AnthropicMessage[] = [
    { role: 'user', content: prompt },
  ]

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { messages: compressed } = compressContext(messages)

      const stream = sendMessageStream({
        messages: compressed,
        system: systemPrompt,
        ...(model !== undefined ? { model } : {}),
      })

      let textContent = ''
      let stopReason = 'end_turn'
      const toolAccumulator = new Map<number, { id: string; name: string; argsJson: string }>()

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          process.stdout.write(event.delta.text)
          textContent += event.delta.text
        } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          const tb = event.content_block
          toolAccumulator.set(event.index, { id: tb.id, name: tb.name, argsJson: '' })
        } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          const acc = toolAccumulator.get(event.index)
          if (acc) acc.argsJson += event.delta.partial_json
        } else if (event.type === 'message_delta') {
          stopReason = event.delta.stop_reason
        }
      }

      // Build content blocks
      const contentBlocks: import('./adapters/openai/responseAdapter.js').AnthropicBlock[] = []
      if (textContent) contentBlocks.push({ type: 'text', text: textContent })
      const toolUseBlocks: import('./adapters/openai/responseAdapter.js').AnthropicToolUseBlock[] = []
      for (const [, acc] of toolAccumulator) {
        let parsedInput: unknown = {}
        try { parsedInput = JSON.parse(acc.argsJson || '{}') } catch { parsedInput = {} }
        const tb: import('./adapters/openai/responseAdapter.js').AnthropicToolUseBlock = {
          type: 'tool_use', id: acc.id, name: acc.name, input: parsedInput,
        }
        contentBlocks.push(tb)
        toolUseBlocks.push(tb)
      }

      // Done — no tool calls
      if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
        process.stdout.write('\n')
        break
      }

      // Execute tools
      const results = await executeTools(toolUseBlocks, { cwd, signal: undefined })
      for (const r of results) {
        const icon = r.is_error ? chalk.red('✗') : chalk.green('✓')
        process.stderr.write(chalk.yellow(`🔧 ${r.name}... `) + icon + '\n')
      }

      // Append to history
      messages = [
        ...messages,
        { role: 'assistant', content: contentBlocks },
        {
          role: 'user',
          content: results.map(r => ({
            type: 'tool_result' as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          })),
        },
      ]
    }
  } catch (err) {
    console.error(chalk.red('\nError:'), err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

async function startRepl(initialPrompt?: string, model?: string, resumeSessionId?: string): Promise<void> {
  const { launchRepl } = await import('./repl/index.js')
  await launchRepl({
    ...(initialPrompt !== undefined ? { initialPrompt } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
  })
}

program.parseAsync(process.argv).catch(err => {
  console.error(chalk.red('Fatal error:'), err instanceof Error ? err.message : String(err))
  process.exit(1)
})
