import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const TIMEOUT_MS = 15_000
const MAX_RESULTS = 10

const inputSchema = z.object({
  query: z.string().describe('The search query'),
  max_results: z
    .number()
    .optional()
    .describe(`Maximum number of results to return (default: 5, max: ${MAX_RESULTS})`),
})

type Input = z.infer<typeof inputSchema>

interface DDGRelatedTopic {
  Text?: string
  FirstURL?: string
  Topics?: DDGRelatedTopic[]
}

interface DDGResponse {
  AbstractText?: string
  AbstractURL?: string
  AbstractSource?: string
  Answer?: string
  RelatedTopics?: DDGRelatedTopic[]
  Results?: Array<{ Text?: string; FirstURL?: string }>
}

export const WebSearchTool: ToolDef<Input, string> = {
  name: 'WebSearch',
  description:
    'Search the web using DuckDuckGo Instant Answer API. Returns abstracts, answers, and relevant links for a query. Useful for looking up documentation, current events, or any information requiring web knowledge.',
  inputSchema,

  async execute(input: Input, _context: ToolContext): Promise<ToolResult<string>> {
    const maxResults = Math.min(input.max_results ?? 5, MAX_RESULTS)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Tikat-Codex/1.4.7' },
      }).finally(() => clearTimeout(timer))

      if (!res.ok) {
        return { content: `Search failed: HTTP ${res.status}`, isError: true }
      }

      const data = (await res.json()) as DDGResponse
      const lines: string[] = []

      // Instant answer box
      if (data.Answer) {
        lines.push(`**Answer:** ${data.Answer}`)
        lines.push('')
      }

      // Featured snippet (abstract)
      if (data.AbstractText && data.AbstractURL) {
        lines.push(`**Featured Snippet:** ${data.AbstractText}`)
        lines.push(`Source: ${data.AbstractURL}${data.AbstractSource ? ` (${data.AbstractSource})` : ''}`)
        lines.push('')
      }

      // Collect all result links
      const results: Array<{ text: string; url: string }> = []

      for (const r of data.Results ?? []) {
        if (r.Text && r.FirstURL) results.push({ text: r.Text, url: r.FirstURL })
      }

      for (const t of data.RelatedTopics ?? []) {
        if (t.Topics) {
          for (const sub of t.Topics) {
            if (sub.Text && sub.FirstURL) results.push({ text: sub.Text, url: sub.FirstURL })
          }
        } else if (t.Text && t.FirstURL) {
          results.push({ text: t.Text, url: t.FirstURL })
        }
      }

      if (results.length === 0 && lines.length === 0) {
        return {
          content: `No results found for: "${input.query}". Try a different query or use WebFetch to visit a specific URL.`,
        }
      }

      if (results.length > 0) {
        lines.push(`**Search Results** (${Math.min(results.length, maxResults)} of ${results.length}):`)
        for (let i = 0; i < Math.min(results.length, maxResults); i++) {
          const r = results[i]!
          // Truncate long descriptions
          const text = r.text.length > 200 ? r.text.slice(0, 197) + '...' : r.text
          lines.push(`${i + 1}. ${text}`)
          lines.push(`   ${r.url}`)
        }
      }

      return { content: lines.join('\n') }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { content: `Search timed out after ${TIMEOUT_MS}ms`, isError: true }
      }
      return { content: `Search error: ${String(err)}`, isError: true }
    }
  },
}
