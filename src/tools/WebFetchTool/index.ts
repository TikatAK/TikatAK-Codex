import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const MAX_RESPONSE_CHARS = 50_000
const TIMEOUT_MS = 30_000

const inputSchema = z.object({
  url: z.string().describe('The URL to fetch'),
  raw: z.boolean().optional().describe('Return raw HTML instead of converted text (default: false)'),
  max_length: z.number().optional().describe('Maximum characters to return (default 50000)'),
})

type Input = z.infer<typeof inputSchema>

export const WebFetchTool: ToolDef<Input, string> = {
  name: 'WebFetch',
  description:
    'Fetch content from a URL. Returns the page content as plain text (HTML stripped). Useful for reading documentation, APIs, or web pages.',
  inputSchema,

  async execute(input: Input, _context: ToolContext): Promise<ToolResult<string>> {
    const maxLength = input.max_length ?? MAX_RESPONSE_CHARS

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const response = await fetch(input.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'TikatAK-Codex/0.1.0',
          'Accept': 'text/html,application/xhtml+xml,application/json,text/plain',
        },
      }).finally(() => clearTimeout(timer))

      if (!response.ok) {
        return {
          content: `HTTP ${response.status} ${response.statusText} for ${input.url}`,
          isError: true,
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const text = await response.text()

      if (input.raw || contentType.includes('application/json') || contentType.includes('text/plain')) {
        return { content: text.slice(0, maxLength) }
      }

      // Strip HTML tags for readable output
      const stripped = stripHtml(text)
      return { content: stripped.slice(0, maxLength) }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { content: `Request timed out after ${TIMEOUT_MS}ms`, isError: true }
      }
      return { content: `Fetch error: ${String(err)}`, isError: true }
    }
  },
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n\n')
    .trim()
}
