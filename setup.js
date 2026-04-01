/**
 * TikatAK-Codex 项目目录初始化脚本
 * 运行方式：node setup.js
 */
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const dirs = [
  'src',
  'src/providers',
  'src/adapters',
  'src/adapters/openai',
  'src/commands',
  'src/commands/provider',
  'src/services',
  'src/services/api',
  'src/constants',
  'src/utils',
  'src/utils/model',
  'src/utils/settings',
  'src/utils/secureStorage',
  'src/components',
  'src/components/provider-config',
  'src/tools',
  'src/tools/BashTool',
  'src/tools/FileReadTool',
  'src/tools/FileEditTool',
  'src/tools/FileWriteTool',
  'src/tools/GrepTool',
  'src/tools/GlobTool',
  'src/tools/WebFetchTool',
  'src/tools/TodoWriteTool',
  'src/tools/MCPTool',
  'src/tools/LSTool',
  'src/tools/GrepTool',
  'src/tools/GlobTool',
  'src/repl',
  'src/screens',
  'src/hooks',
  'dist',
]

let created = 0
for (const dir of dirs) {
  const full = join(__dirname, dir)
  mkdirSync(full, { recursive: true })
  created++
}

console.log(`✅ Created ${created} directories`)
console.log('🚀 Project structure ready — now run: npm install')
