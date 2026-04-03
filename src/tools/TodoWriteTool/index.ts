import { homedir } from 'os'
import { join } from 'path'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'
import { readJson, writeJson } from '../../utils/jsonStorage.js'

const TODO_FILE = join(homedir(), '.tikat-codex', 'todos.json')

interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'high' | 'medium' | 'low'
}

function readTodos(): Todo[] {
  return readJson<Todo[]>(TODO_FILE, [])
}

function writeTodos(todos: Todo[]): void {
  writeJson(TODO_FILE, todos)
}

// ── TodoWrite ───────────────────────────────────────────────────────────────

const todoItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['high', 'medium', 'low']),
})

const writeInputSchema = z.object({
  todos: z.array(todoItemSchema).describe('The complete list of todos to write (replaces all existing todos)'),
})

type WriteInput = z.infer<typeof writeInputSchema>

export const TodoWriteTool: ToolDef<WriteInput, string> = {
  name: 'TodoWrite',
  description:
    'Replace the entire todo list with the provided todos. Use to create, update, or manage task tracking. To update a single item, read the list first with TodoRead, modify the item, then write back the full list.',
  inputSchema: writeInputSchema,

  async execute(input: WriteInput, _context: ToolContext): Promise<ToolResult<string>> {
    const seen = new Set<string>()
    const dupeIds: string[] = []
    for (const t of input.todos) {
      if (seen.has(t.id)) dupeIds.push(t.id)
      else seen.add(t.id)
    }
    if (dupeIds.length > 0) {
      return {
        content: `Duplicate todo IDs detected: ${[...new Set(dupeIds)].join(', ')}`,
        isError: true,
      }
    }    try {
      writeTodos(input.todos as Todo[])
      return { content: `Updated ${input.todos.length} todos` }
    } catch (err) {
      return { content: `Failed to write todos: ${String(err)}`, isError: true }
    }
  },
}

// ── TodoRead ─────────────────────────────────────────────────────────────────

export const TodoReadTool: ToolDef<Record<never, never>, string> = {
  name: 'TodoRead',
  description: 'Read the current todo list. Returns all todos with their id, status, priority, and content.',
  inputSchema: z.object({}),

  async execute(_input, _context): Promise<ToolResult<string>> {
    const todos = readTodos()
    if (todos.length === 0) return { content: 'No todos found' }
    const lines = todos.map(t =>
      `[${t.status}] (${t.priority}) ${t.id}: ${t.content}`
    )
    return { content: lines.join('\n') }
  },
}

// ── TodoUpdate ────────────────────────────────────────────────────────────────

const updateInputSchema = z.object({
  id: z.string().describe('The ID of the todo to update'),
  status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('New status'),
  content: z.string().optional().describe('New content text'),
  priority: z.enum(['high', 'medium', 'low']).optional().describe('New priority'),
})

type UpdateInput = z.infer<typeof updateInputSchema>

export const TodoUpdateTool: ToolDef<UpdateInput, string> = {
  name: 'TodoUpdate',
  description: 'Update a single todo item by ID. You can change its status, content, or priority without rewriting the entire list.',
  inputSchema: updateInputSchema,

  async execute(input: UpdateInput, _context: ToolContext): Promise<ToolResult<string>> {
    const todos = readTodos()
    const idx = todos.findIndex(t => t.id === input.id)
    if (idx === -1) {
      return { content: `Todo not found: "${input.id}"`, isError: true }
    }
    const todo = todos[idx]!
    if (input.status !== undefined) todo.status = input.status
    if (input.content !== undefined) todo.content = input.content
    if (input.priority !== undefined) todo.priority = input.priority
    todos[idx] = todo
    try {
      writeTodos(todos)
      return { content: `Updated todo "${input.id}": [${todo.status}] (${todo.priority}) ${todo.content}` }
    } catch (err) {
      return { content: `Failed to update todo: ${String(err)}`, isError: true }
    }
  },
}

// ── TodoDelete ────────────────────────────────────────────────────────────────

const deleteInputSchema = z.object({
  id: z.string().describe('The ID of the todo to delete'),
})

type DeleteInput = z.infer<typeof deleteInputSchema>

export const TodoDeleteTool: ToolDef<DeleteInput, string> = {
  name: 'TodoDelete',
  description: 'Delete a single todo item by ID.',
  inputSchema: deleteInputSchema,

  async execute(input: DeleteInput, _context: ToolContext): Promise<ToolResult<string>> {
    const todos = readTodos()
    const before = todos.length
    const filtered = todos.filter(t => t.id !== input.id)
    if (filtered.length === before) {
      return { content: `Todo not found: "${input.id}"`, isError: true }
    }
    try {
      writeTodos(filtered)
      return { content: `Deleted todo "${input.id}"` }
    } catch (err) {
      return { content: `Failed to delete todo: ${String(err)}`, isError: true }
    }
  },
}

