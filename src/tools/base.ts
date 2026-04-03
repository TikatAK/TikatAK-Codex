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
  /** Optional: pause agent and ask the user a question. Resolves with the user's answer. */
  askUser?: (question: string, choices?: string[]) => Promise<string>
}

export interface ToolResult<T = string> {
  /** The result to send back to the model */
  content: T
  /** Whether this was an error */
  isError?: boolean
}

/** Convert zod schema to JSON Schema (simplified) */
export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(schema.shape)) {
    const fieldSchema = value as z.ZodTypeAny
    const isOptional = fieldSchema instanceof z.ZodOptional
    const inner = isOptional ? fieldSchema.unwrap() : fieldSchema
    if (!isOptional) required.push(key)
    properties[key] = zodTypeToJsonSchema(inner)
  }

  return { type: 'object', properties, required }
}

function zodTypeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const desc = schema.description ? { description: schema.description } : {}
  if (schema instanceof z.ZodString)  return { type: 'string',  ...desc }
  if (schema instanceof z.ZodNumber)  return { type: 'number',  ...desc }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean', ...desc }
  if (schema instanceof z.ZodEnum)    return { type: 'string', enum: (schema as z.ZodEnum<[string, ...string[]]>).options, ...desc }
  if (schema instanceof z.ZodLiteral) {
    const t = typeof schema.value === 'number' ? 'number' : typeof schema.value === 'boolean' ? 'boolean' : 'string'
    return { type: t, enum: [schema.value], ...desc }
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodTypeToJsonSchema(schema.element as z.ZodTypeAny), ...desc }
  }
  if (schema instanceof z.ZodObject) {
    return zodToJsonSchema(schema as z.ZodObject<z.ZodRawShape>)
  }
  // Unknown type — treat as untyped string to keep the schema valid
  return { type: 'string', ...desc }
}

export function buildToolSchema(tool: ToolDef): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.inputSchema as z.ZodObject<z.ZodRawShape>),
  }
}
