import React from 'react'
import { render } from 'ink'
import { readSettings, readApiKey } from '../../utils/settings/index.js'
import { ProviderConfigUI } from '../../components/provider-config/ProviderConfigUI.js'
import { testProviderConnection } from '../../providers/client.js'
import { loadActiveProvider, isProviderConfigured } from '../../providers/activeProvider.js'
import chalk from 'chalk'

export async function providerCommand(subcommand?: string): Promise<void> {
  switch (subcommand) {
    case 'set':
    case undefined:
      await runProviderSetUI()
      break
    case 'status':
      showProviderStatus()
      break
    case 'test':
      await testCurrentProvider()
      break
    case 'list':
      listPresets()
      break
    default:
      console.log(chalk.yellow(`未知子命令: ${subcommand}`))
      console.log('用法: /provider [set|status|test|list]')
  }
}

async function runProviderSetUI(): Promise<void> {
  return new Promise(resolve => {
    const { unmount } = render(
      React.createElement(ProviderConfigUI, {
        onComplete: () => { unmount(); resolve() },
        onCancel: () => { unmount(); resolve() },
      }),
    )
  })
}

function showProviderStatus(): void {
  if (!isProviderConfigured()) {
    console.log(chalk.red('❌ 未配置提供商'))
    console.log(chalk.gray('运行: codex /provider set'))
    return
  }

  const settings = readSettings()
  const apiKey = readApiKey()
  const p = settings.provider!

  console.log(chalk.cyan('── 当前提供商 ──'))
  console.log(`名称:     ${chalk.bold(p.name)}`)
  console.log(`端点:     ${p.baseURL}`)
  console.log(`模型:     ${chalk.green(p.model)}`)
  console.log(`API Key:  ${apiKey ? chalk.green('已设置 (' + maskKey(apiKey) + ')') : chalk.red('未设置')}`)
  console.log(`工具调用: ${p.supportsTools ? chalk.green('支持') : chalk.yellow('不支持')}`)
}

async function testCurrentProvider(): Promise<void> {
  if (!isProviderConfigured()) {
    console.log(chalk.red('❌ 未配置提供商，请先运行 /provider set'))
    return
  }

  const provider = loadActiveProvider()
  console.log(chalk.gray(`正在测试连接 ${provider.config.baseURL} ...`))

  const result = await testProviderConnection(provider.config)
  if (result.ok) {
    console.log(chalk.green('✅ 连接正常！'))
  } else {
    console.log(chalk.red(`❌ 连接失败: ${result.error}`))
  }
}

function listPresets(): void {
  import('../../providers/registry.js').then(({ PROVIDER_PRESETS }) => {
    console.log(chalk.cyan('内置提供商预设:'))
    for (const p of PROVIDER_PRESETS) {
      console.log(`  ${chalk.bold(p.id.padEnd(12))} ${p.name} — ${p.baseURL}`)
    }
  }).catch(() => {
    console.log(chalk.red('加载预设失败'))
  })
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}
