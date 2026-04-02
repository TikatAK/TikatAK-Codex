import chalk from 'chalk'
import { loadActiveProvider, isProviderConfigured } from '../../providers/activeProvider.js'
import { getProviderClient } from '../../providers/client.js'

interface DiagResult {
  label: string
  ok: boolean
  detail: string
}

function printResult(r: DiagResult): void {
  const icon = r.ok ? chalk.green('✓') : chalk.red('✗')
  console.log(`  ${icon}  ${r.label.padEnd(24)} ${r.detail}`)
}

export async function diagnoseCommand(): Promise<void> {
  console.log(chalk.cyan('\n🔍 Tikat-Codex 诊断报告\n'))
  const results: DiagResult[] = []

  // 1. Node.js version
  const nodeVer = process.version
  const nodeMajor = parseInt(nodeVer.slice(1))
  results.push({
    label: 'Node.js 版本',
    ok: nodeMajor >= 18,
    detail: `${nodeVer}${nodeMajor < 18 ? ' (需要 ≥18)' : ''}`,
  })

  // 2. Provider configured
  const configured = isProviderConfigured()
  results.push({
    label: '提供商已配置',
    ok: configured,
    detail: configured ? '已配置' : '未配置，运行 codex provider set',
  })

  if (configured) {
    let provider: ReturnType<typeof loadActiveProvider> | null = null
    try {
      provider = loadActiveProvider()
      results.push({
        label: '加载提供商配置',
        ok: true,
        detail: `${provider.config.name ?? provider.config.baseURL} / ${provider.config.defaultModel}`,
      })
    } catch (err) {
      results.push({
        label: '加载提供商配置',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      })
    }

    // 3. DNS / network reachability (simple fetch)
    if (provider) {
      const baseURL = provider.config.baseURL
      const testUrl = baseURL.replace(/\/v1\/?$/, '') + '/v1/models'
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(testUrl, {
          headers: { Authorization: `Bearer ${provider.config.apiKey ?? ''}` },
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        results.push({
          label: 'API 端点可达',
          ok: res.status < 500,
          detail: `HTTP ${res.status} (${testUrl})`,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const isTimeout = msg.includes('abort') || msg.includes('timeout')
        results.push({
          label: 'API 端点可达',
          ok: false,
          detail: isTimeout ? '连接超时（8s）' : `网络错误: ${msg.slice(0, 60)}`,
        })
      }

      // 4. Simple completion test
      try {
        const client = getProviderClient(provider.config)
        const ctrl2 = new AbortController()
        const timer2 = setTimeout(() => ctrl2.abort(), 15000)
        const resp = await client.chat.completions.create({
          model: provider.config.defaultModel,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
          max_tokens: 10,
        }, { signal: ctrl2.signal as AbortSignal })
        clearTimeout(timer2)
        const text = resp.choices[0]?.message?.content?.trim() ?? ''
        results.push({
          label: '模型推理测试',
          ok: text.length > 0,
          detail: text.length > 0 ? `✓ 响应正常 ("${text.slice(0, 20)}")` : '响应为空',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({
          label: '模型推理测试',
          ok: false,
          detail: msg.slice(0, 80),
        })
      }
    }
  }

  // 5. HOME dir writable
  try {
    const { existsSync, mkdirSync } = await import('fs')
    const { homedir } = await import('os')
    const { join } = await import('path')
    const configDir = join(homedir(), '.Tikat-Codex')
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true, mode: 0o700 })
    results.push({ label: '配置目录可写', ok: true, detail: configDir })
  } catch (err) {
    results.push({ label: '配置目录可写', ok: false, detail: String(err) })
  }

  // Print all
  for (const r of results) printResult(r)

  const failed = results.filter(r => !r.ok)
  console.log()
  if (failed.length === 0) {
    console.log(chalk.green('  ✅ 所有检查通过！'))
  } else {
    console.log(chalk.yellow(`  ⚠️  ${failed.length} 项检查未通过，请根据上方提示排查`))
  }
  console.log()
}
