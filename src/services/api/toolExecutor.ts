import { TOOL_MAP } from '../../tools/index.js'
import type { ToolContext } from '../../tools/index.js'
import type { AnthropicToolUseBlock } from '../../adapters/openai/responseAdapter.js'

const TOOL_TIMEOUT_MS = 30_000

export interface ToolExecutionResult {
  tool_use_id: string
  name: string
  content: string
  is_error: boolean
}

/** Wrap a promise with a timeout — clears timer on completion to avoid memory leaks */
function withTimeout<T>(promise: Promise<T>, ms: number, toolName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${ms}ms`)), ms)
  })
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeoutPromise,
  ])
}

/**
 * Execute a single tool call from the model.
 */
export async function executeTool(
  toolUse: AnthropicToolUseBlock,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const tool = TOOL_MAP.get(toolUse.name)

  if (!tool) {
    return {
      tool_use_id: toolUse.id,
      name: toolUse.name,
      content: `Unknown tool: ${toolUse.name}. Available tools: ${[...TOOL_MAP.keys()].join(', ')}`,
      is_error: true,
    }
  }

  try {
    const parsed = tool.inputSchema.safeParse(toolUse.input)
    if (!parsed.success) {
      return {
        tool_use_id: toolUse.id,
        name: toolUse.name,
        content: `Invalid input: ${parsed.error.message}`,
        is_error: true,
      }
    }

    const result = await withTimeout(
      tool.execute(parsed.data, context),
      TOOL_TIMEOUT_MS,
      toolUse.name,
    )
    return {
      tool_use_id: toolUse.id,
      name: toolUse.name,
      content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
      is_error: result.isError ?? false,
    }
  } catch (err) {
    return {
      tool_use_id: toolUse.id,
      name: toolUse.name,
      content: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
      is_error: true,
    }
  }
}

/**
 * Execute multiple tool calls in parallel.
 */
export async function executeTools(
  toolUses: AnthropicToolUseBlock[],
  context: ToolContext,
): Promise<ToolExecutionResult[]> {
  return Promise.all(toolUses.map(t => executeTool(t, context)))
}
