import { Command } from '@commander-js/extra-typings'
import chalk from 'chalk'
import { isProviderConfigured } from './providers/activeProvider.js'
import { providerCommand } from './commands/provider/index.js'
import { sendMessageStream } from './services/api/claude.js'
import { checkForUpdates } from './utils/updater.js'

const VERSION = process.env['TIKATAK_VERSION'] ?? '0.1.0'

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
  .description('TikatAK-Codex — AI coding assistant with any OpenAI-compatible provider')
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
  .argument('[prompt]', 'Optional prompt to run non-interactively')
  .option('-m, --model <model>', 'Override model for this session')
  .option('-p, --print', 'Print output and exit (non-interactive)')
  .option('-r, --resume <sessionId>', 'Resume a previous session by ID')
  .action(async (prompt?: string, opts?: { model?: string; print?: boolean; resume?: string }) => {
    if (!isProviderConfigured()) {
      console.log(chalk.yellow('\n⚡ 欢迎使用 TikatAK-Codex！'))
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
  try {
    const stream = sendMessageStream({
      messages: [{ role: 'user', content: prompt }],
      ...(model !== undefined ? { model } : {}),
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text)
      }
    }
    process.stdout.write('\n')
  } catch (err) {
    console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err))
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
