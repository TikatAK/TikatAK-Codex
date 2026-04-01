import { z } from 'zod'

/**
 * Base interface for all tools.
 */
export interface ToolDef<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  inputSchema: z.ZodType<TInput>
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>
}

export interface ToolContext {
  cwd: string
  signal?: AbortSignal
}

export interface ToolResult<T = string> {
  /** The result to send back to the model */
  content: T
  /** Whether this was an error */
  isError?: boolean
}

/** Convert zod schema to JSON Schema (simplified) */
export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const fieldSchema = value as z.ZodTypeAny
    const isOptional = fieldSchema instanceof z.ZodOptional
    const inner = isOptional ? (fieldSchema as z.ZodOptional<z.ZodTypeAny>).unwrap() : fieldSchema

    if (!isOptional) required.push(key)

    if (inner instanceof z.ZodString) {
      properties[key] = { type: 'string', description: (inner as z.ZodString).description ?? '' }
    } else if (inner instanceof z.ZodNumber) {
      properties[key] = { type: 'number', description: (inner as z.ZodNumber).description ?? '' }
    } else if (inner instanceof z.ZodBoolean) {
      properties[key] = { type: 'boolean' }
    } else if (inner instanceof z.ZodArray) {
      properties[key] = { type: 'array', items: { type: 'string' } }
    } else {
      properties[key] = { type: 'string' }
    }
  }

  return {
    type: 'object',
    properties,
    required,
  }
}

export function buildToolSchema(tool: ToolDef): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.inputSchema as z.ZodObject<z.ZodRawShape>),
  }
}
