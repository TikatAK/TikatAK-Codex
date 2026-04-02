import React, { useState, useEffect } from 'react'
import { Box, Text, useInput, useApp, render } from 'ink'
import { checkForUpdates, performUpdate } from '../../utils/updater.js'

type Step = 'checking' | 'up-to-date' | 'prompt' | 'updating' | 'done' | 'deferred' | 'error'

interface UpdateUIProps {
  currentVersion: string
}

function UpdateUI({ currentVersion }: UpdateUIProps) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('checking')
  const [latestVersion, setLatestVersion] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    checkForUpdates(currentVersion).then(info => {
      if (!info.hasUpdate) {
        setStep('up-to-date')
        setLatestVersion(info.latestVersion)
        setTimeout(() => exit(), 1500)
      } else {
        setLatestVersion(info.latestVersion)
        setStep('prompt')
      }
    })
  }, [])

  useInput((input, key) => {
    if (step === 'prompt') {
      if (input === 'y' || input === 'Y' || key.return) {
        setStep('updating')
        performUpdate().then(result => {
          if (result.ok && result.deferred) {
            setStep('deferred')
            setTimeout(() => exit(), 2000)
          } else if (result.ok) {
            setStep('done')
            setTimeout(() => exit(), 2000)
          } else {
            setMessage(result.error ?? '未知错误')
            setStep('error')
            setTimeout(() => exit(), 3000)
          }
        })
      } else if (input === 'n' || input === 'N' || key.escape) {
        exit()
      }
    } else if (step === 'up-to-date' || step === 'done' || step === 'deferred' || step === 'error') {
      exit()
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} width={60}>
      <Box marginBottom={1}>
        <Text bold color="cyan">⚡ Tikat-Codex 更新检查</Text>
      </Box>

      {step === 'checking' && (
        <Text color="yellow">⏳ 正在检查最新版本...</Text>
      )}

      {step === 'up-to-date' && (
        <Box flexDirection="column">
          <Text color="green">✅ 已是最新版本 v{latestVersion}</Text>
          <Text color="gray" dimColor>无需更新</Text>
        </Box>
      )}

      {step === 'prompt' && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>当前版本: </Text><Text color="yellow">v{currentVersion}</Text>
            <Text>  →  最新版本: </Text><Text color="green" bold>v{latestVersion}</Text>
          </Box>
          <Text>是否立即更新？</Text>
          <Box marginTop={1}>
            <Text color="green" bold>[Y] 更新  </Text>
            <Text color="gray">[N] 跳过</Text>
          </Box>
        </Box>
      )}

      {step === 'updating' && (
        <Box flexDirection="column">
          <Text color="yellow">⏳ 正在从 GitHub 安装最新版本...</Text>
          <Text color="gray" dimColor>这可能需要约 30 秒</Text>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green" bold>🎉 更新成功！已安装 v{latestVersion}</Text>
          <Text color="gray" dimColor>重新运行 codex 即可使用新版本</Text>
        </Box>
      )}

      {step === 'deferred' && (
        <Box flexDirection="column">
          <Text color="green" bold>✅ 更新已在后台启动</Text>
          <Text color="gray" dimColor>约 5 秒后更新完成，重新运行 codex 即可使用新版本</Text>
        </Box>
      )}

      {step === 'error' && (
        <Box flexDirection="column">
          <Text color="red">❌ 更新失败：{message}</Text>
          <Text color="gray" dimColor>请手动运行: npm install -g github:TikatAK/Tikat-Codex</Text>
        </Box>
      )}
    </Box>
  )
}

export async function updateCommand(currentVersion: string): Promise<void> {
  const { waitUntilExit } = render(
    React.createElement(UpdateUI, { currentVersion })
  )
  await waitUntilExit()
}
