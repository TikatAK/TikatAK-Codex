import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const TODO_FILE = join(homedir(), '.tikatak-codex', 'todos.json')

interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'high' | 'medium' | 'low'
}

function readTodos(): Todo[] {
  try {
    if (!existsSync(TODO_FILE)) return []
    return JSON.parse(readFileSync(TODO_FILE, 'utf8')) as Todo[]
  } catch { return [] }
}

function writeTodos(todos: Todo[]): void {
  mkdirSync(join(homedir(), '.tikatak-codex'), { recursive: true })
  writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2), 'utf8')
}

const inputSchema = z.object({
  todos: z.array(z.object({
    id: z.string(),
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
    priority: z.enum(['high', 'medium', 'low']),
  })).describe('The complete list of todos to write'),
})

type Input = z.infer<typeof inputSchema>

export const TodoWriteTool: ToolDef<Input, string> = {
  name: 'TodoWrite',
  description:
    'Write the todo list. Replaces the entire todo list with the provided todos. Use to create, update, or manage task tracking.',
  inputSchema,

  async execute(input: Input, _context: ToolContext): Promise<ToolResult<string>> {
    // Enforce unique IDs
    const ids = input.todos.map(t => t.id)
    const dupeIds = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dupeIds.length > 0) {
      return {
        content: `Duplicate todo IDs detected: ${[...new Set(dupeIds)].join(', ')}`,
        isError: true,
      }
    }

    try {
      writeTodos(input.todos as Todo[])
      return { content: `Updated ${input.todos.length} todos` }
    } catch (err) {
      return { content: `Failed to write todos: ${String(err)}`, isError: true }
    }
  },
}

export const TodoReadTool: ToolDef<Record<never, never>, string> = {
  name: 'TodoRead',
  description: 'Read the current todo list.',
  inputSchema: z.object({}),

  async execute(_input, _context): Promise<ToolResult<string>> {
    const todos = readTodos()
    if (todos.length === 0) return { content: 'No todos found' }
    return {
      content: todos.map(t =>
        `[${t.status}] (${t.priority}) ${t.id}: ${t.content}`
      ).join('\n'),
    }
  },
}
