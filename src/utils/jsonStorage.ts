import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import * as path from 'path'

/**
 * Read a JSON file and return its parsed contents.
 * Returns `defaultValue` when the file is missing or malformed.
 */
export function readJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (!existsSync(filePath)) return defaultValue
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return defaultValue
  }
}

/**
 * Write data as formatted JSON to filePath.
 * Creates parent directories as needed.
 */
export function writeJson<T>(filePath: string, data: T): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}
