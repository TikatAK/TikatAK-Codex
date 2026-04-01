import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { PROVIDER_PRESETS, CUSTOM_PRESET_ID } from '../../providers/registry.js'
import { testProviderConnection } from '../../providers/client.js'
import { saveApiKey, updateSettings } from '../../utils/settings/index.js'
import type { ProviderPreset } from '../../providers/types.js'

type Step = 'select-preset' | 'input-apikey' | 'input-model' | 'input-baseurl' | 'testing' | 'done' | 'error'

const ALL_OPTIONS = [
  ...PROVIDER_PRESETS,
  { id: CUSTOM_PRESET_ID, name: '自定义端点...', baseURL: '', defaultModel: '', models: [], supportsTools: true } as ProviderPreset,
]

interface ProviderConfigUIProps {
  onComplete?: () => void
  onCancel?: () => void
}

export function ProviderConfigUI({ onComplete, onCancel }: ProviderConfigUIProps) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('select-preset')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [modelIndex, setModelIndex] = useState(0)        // for model list navigation
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [customBaseURL, setCustomBaseURL] = useState('')
  const [inputBuffer, setInputBuffer] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  useInput((input, key) => {
    // Global escape
    if (key.escape) {
      onCancel?.()
      return
    }

    // ── Provider selection ──────────────────────────────────────
    if (step === 'select-preset') {
      if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1))
      if (key.downArrow) setSelectedIndex(i => Math.min(ALL_OPTIONS.length - 1, i + 1))
      if (key.return) {
        const preset = ALL_OPTIONS[selectedIndex]
        if (!preset) return
        setSelectedPreset(preset)
        setModel(preset.defaultModel)
        setModelIndex(0)
        setInputBuffer('')
        if (preset.id === CUSTOM_PRESET_ID) {
          setStep('input-baseurl')
        } else {
          setStep('input-apikey')
        }
      }
      return
    }

    // ── Base URL input ──────────────────────────────────────────
    if (step === 'input-baseurl') {
      if (key.return) {
        const val = inputBuffer.trim()
        if (!val) return
        // Validate URL format
        try {
          new URL(val)
        } catch {
          setStatusMsg('❌ 无效的 URL 格式，请输入完整地址（例如 https://api.example.com/v1）')
          return
        }
        setStatusMsg('')
        setCustomBaseURL(val)
        setInputBuffer('')
        setStep('input-apikey')
        return
      }
      if (key.backspace || key.delete) {
        setInputBuffer(b => b.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        setInputBuffer(b => b + input)
      }
      return
    }

    // ── API Key input ───────────────────────────────────────────
    if (step === 'input-apikey') {
      if (key.return) {
        const val = inputBuffer.trim()
        if (!val) return
        setApiKey(val)
        setInputBuffer('')
        setStep('input-model')
        return
      }
      if (key.backspace || key.delete) {
        setInputBuffer(b => b.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        setInputBuffer(b => b + input)
      }
      return
    }

    // ── Model selection ─────────────────────────────────────────
    if (step === 'input-model') {
      const modelList = selectedPreset?.models ?? []

      // Arrow keys navigate the model list (only if no manual text typed)
      if (key.upArrow && modelList.length > 0 && !inputBuffer) {
        setModelIndex(i => {
          const next = Math.max(0, i - 1)
          setModel(modelList[next] ?? model)
          return next
        })
        return
      }
      if (key.downArrow && modelList.length > 0 && !inputBuffer) {
        setModelIndex(i => {
          const next = Math.min(modelList.length - 1, i + 1)
          setModel(modelList[next] ?? model)
          return next
        })
        return
      }

      if (key.return) {
        // If user typed something, use that; otherwise use current model (default or arrow-selected)
        const finalModel = inputBuffer.trim() || model
        if (!finalModel) return
        setModel(finalModel)
        setInputBuffer('')
        void handleSave(finalModel)
        return
      }
      if (key.backspace || key.delete) {
        setInputBuffer(b => b.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        setInputBuffer(b => b + input)
      }
      return
    }

    // ── Error state — any key retries ──────────────────────────
    if (step === 'error') {
      setStep('input-model')
      setInputBuffer('')
    }
  })

  async function handleSave(finalModel: string) {
    if (!selectedPreset) return
    const baseURL = selectedPreset.id === CUSTOM_PRESET_ID ? customBaseURL : selectedPreset.baseURL

    setStep('testing')
    setStatusMsg('正在测试连接...')

    const result = await testProviderConnection({
      name: selectedPreset.name,
      baseURL,
      apiKey,
      defaultModel: finalModel,
      supportsTools: selectedPreset.supportsTools,
    })

    if (result.ok) {
      saveApiKey(apiKey)
      updateSettings({
        provider: {
          presetId: selectedPreset.id,
          baseURL,
          model: finalModel,
          name: selectedPreset.name,
          supportsTools: selectedPreset.supportsTools,
        },
      })
      setStatusMsg('✅ 配置成功！连接正常')
      setStep('done')
      setTimeout(() => { onComplete?.() }, 1500)
    } else {
      setStatusMsg(result.error ?? '连接失败')
      setStep('error')
    }
  }

  const modelList = selectedPreset?.models ?? []

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} width={62}>
      <Box marginBottom={1}>
        <Text bold color="cyan">⚡ TikatAK-Codex — 提供商配置</Text>
      </Box>

      {step === 'select-preset' && (
        <Box flexDirection="column">
          <Text color="gray">选择 AI 提供商：</Text>
          <Box flexDirection="column" marginTop={1}>
            {ALL_OPTIONS.map((preset, i) => (
              <Text key={preset.id} color={i === selectedIndex ? 'green' : 'white'}>
                {i === selectedIndex ? '❯ ' : '  '}
                {i === selectedIndex ? <Text bold>{preset.name}</Text> : preset.name}
              </Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>↑↓ 选择  Enter 确认  Esc 取消</Text>
          </Box>
        </Box>
      )}

      {step === 'input-baseurl' && (
        <Box flexDirection="column">
          <Text>自定义 API 端点 (Base URL):</Text>
          <Box marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
            <Text>{inputBuffer || <Text color="gray">https://api.example.com/v1</Text>}</Text>
            <Text color="yellow">█</Text>
          </Box>
          {statusMsg ? (
            <Box marginTop={1}><Text color="red">{statusMsg}</Text></Box>
          ) : (
            <Box marginTop={1}>
              <Text color="gray" dimColor>Enter 确认  Esc 取消</Text>
            </Box>
          )}
        </Box>
      )}

      {step === 'input-apikey' && (
        <Box flexDirection="column">
          <Text bold>{selectedPreset?.name}</Text>
          {selectedPreset?.apiKeyHint && (
            <Text color="gray" dimColor>{selectedPreset.apiKeyHint}</Text>
          )}
          <Box marginTop={1}>
            <Text>API Key: </Text>
          </Box>
          <Box borderStyle="single" borderColor="yellow" paddingX={1}>
            <Text color="yellow">{'*'.repeat(inputBuffer.length)}</Text>
            <Text color="yellow">█</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>Enter 确认  Esc 取消</Text>
          </Box>
        </Box>
      )}

      {step === 'input-model' && (
        <Box flexDirection="column">
          <Text>选择或输入模型 ID：</Text>

          {/* Model list with arrow-key navigation */}
          {modelList.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {modelList.map((m, i) => (
                <Text key={m} color={!inputBuffer && i === modelIndex ? 'green' : 'white'}>
                  {!inputBuffer && i === modelIndex ? '❯ ' : '  '}
                  {!inputBuffer && i === modelIndex ? <Text bold>{m}</Text> : m}
                </Text>
              ))}
            </Box>
          )}

          {/* Manual text input */}
          <Box marginTop={1}>
            <Text color="gray">手动输入: </Text>
          </Box>
          <Box borderStyle="single" borderColor="yellow" paddingX={1}>
            <Text>{inputBuffer || <Text color="gray">{model}</Text>}</Text>
            <Text color="yellow">█</Text>
          </Box>

          <Box marginTop={1}>
            {modelList.length > 0
              ? <Text color="gray" dimColor>↑↓ 选择列表  或直接输入  Enter 确认  Esc 取消</Text>
              : <Text color="gray" dimColor>输入模型ID，Enter 直接使用 "{model}"  Esc 取消</Text>
            }
          </Box>
        </Box>
      )}

      {step === 'testing' && (
        <Box flexDirection="column">
          <Text color="yellow">⏳ {statusMsg}</Text>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green" bold>{statusMsg}</Text>
          <Text color="gray">正在启动...</Text>
        </Box>
      )}

      {step === 'error' && (
        <Box flexDirection="column">
          <Text color="red" bold>❌ {statusMsg}</Text>
          <Box marginTop={1}>
            <Text color="gray" dimColor>按任意键重新选择模型，Esc 取消</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
