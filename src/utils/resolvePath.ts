import * as path from 'path'

/**
 * Resolve a tool input path: return it as-is if absolute,
 * otherwise join with the agent's working directory.
 */
export function resolvePath(inputPath: string, cwd: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.join(cwd, inputPath)
}
