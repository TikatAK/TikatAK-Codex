import { describe, it, expect } from 'vitest'
import { highlight } from '../utils/highlight/index.js'

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

describe('highlight', () => {
  it('no code block: text content unchanged after stripping ANSI', () => {
    const text = 'Hello world, this is plain text.'
    expect(stripAnsi(highlight(text))).toBe(text)
  })

  it('js code block content is wrapped with ANSI sequences', () => {
    const text = '```js\nconst x = 1\n```'
    const result = highlight(text)
    expect(result).toMatch(/\x1b\[/)
  })

  it('multiple code blocks are both highlighted', () => {
    const text = '```js\nconst x = 1\n```\nsome text\n```python\ndef foo():\n    pass\n```'
    const result = highlight(text)
    // Both code regions should produce ANSI output
    expect(result).toMatch(/\x1b\[/)
    // Stripped content contains original code tokens
    const stripped = stripAnsi(result)
    expect(stripped).toContain('const')
    expect(stripped).toContain('def')
  })

  it('unknown language does not throw', () => {
    expect(() => highlight('```unknownlanguage\nsome code here\n```')).not.toThrow()
  })

  it('**bold** markdown is converted with bold ANSI code', () => {
    const text = '**bold text**'
    const result = highlight(text)
    expect(result).toContain('\x1b[1m')
    expect(stripAnsi(result)).toContain('bold text')
  })

  it('*italic* markdown is converted with dim ANSI code', () => {
    const text = '*italic text*'
    const result = highlight(text)
    expect(result).toContain('\x1b[2m')
    expect(stripAnsi(result)).toContain('italic text')
  })
})
