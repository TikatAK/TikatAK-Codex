// Tikat-Codex build script — esbuild based
import * as esbuild from 'esbuild'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const isWatch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: {
    js: "#!/usr/bin/env node --no-deprecation\nimport { createRequire } from 'module';\nconst require = createRequire(import.meta.url);",
  },
  define: {
    'process.env.TIKAT_VERSION': JSON.stringify(pkg.version),
  },
  // External packages that should NOT be bundled (native modules etc.)
  external: [
    // Sharp image processing (optional, platform-specific binaries)
    '@img/sharp-darwin-arm64',
    '@img/sharp-darwin-x64',
    '@img/sharp-linux-arm',
    '@img/sharp-linux-arm64',
    '@img/sharp-linux-x64',
    '@img/sharp-linuxmusl-arm64',
    '@img/sharp-linuxmusl-x64',
    '@img/sharp-win32-arm64',
    '@img/sharp-win32-x64',
  ],
  sourcemap: true,
  minify: false,
  treeShaking: true,
  alias: {
    'react-devtools-core': './src/stubs/react-devtools-core.js',
  },
  logLevel: 'info',
}

if (isWatch) {
  const ctx = await esbuild.context(config)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(config)
  console.log('Build complete → dist/cli.js')
}
