import { resolve } from 'path'

let _cwd: string = process.cwd()

export function getCwd(): string {
  return _cwd
}

export function setCwd(dir: string): void {
  _cwd = resolve(dir)
}
