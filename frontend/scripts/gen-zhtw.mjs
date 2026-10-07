/**
 * Generate src/i18n/locales/source/zhTW.ts from the zh entries of
 * message-registry.ts, converting Simplified -> Traditional with OpenCC.
 *
 * Run: node scripts/gen-zhtw.mjs
 *
 * The output file mirrors the shape of de/es/ja/ptBR sources
 * (flat `namespace.key` map), so no runtime conversion library ships.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// esbuild is a transitive dep of vite, resolve it through vite's own entry
const esbuild = require(require.resolve('esbuild', {
  paths: [require.resolve('vite')],
}))
const { build } = esbuild

const OpenCC = require('opencc-js')
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const tempDir = await mkdtemp(join(tmpdir(), 'gen-zhtw-'))
const outFile = join(tempDir, 'message-registry.mjs')

await build({
  entryPoints: [join(root, 'src/i18n/message-registry.ts')],
  outfile: outFile,
  format: 'esm',
  platform: 'node',
  bundle: false,
  logLevel: 'silent',
})

const { MESSAGE_REGISTRY, getMessageSource } = await import(
  `file://${outFile.replace(/\\/g, '/')}`
)

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' })

const lines = []
let skipped = 0

for (const namespace of Object.keys(MESSAGE_REGISTRY)) {
  for (const key of Object.keys(MESSAGE_REGISTRY[namespace])) {
    const zh = getMessageSource(namespace, key, 'zh')
    if (typeof zh !== 'string') {
      skipped += 1
      continue
    }
    const tw = toTraditional(zh)
    lines.push(
      `  ${JSON.stringify(`${namespace}.${key}`)}: ${JSON.stringify(tw)},`,
    )
  }
}

const content = [
  'export const zhTWMessages = {',
  ...lines,
  '}',
  '',
].join('\n')

await writeFile(join(root, 'src/i18n/locales/source/zhTW.ts'), content, 'utf8')
await rm(tempDir, { recursive: true, force: true })

console.log(`zhTW.ts generated: ${lines.length} keys, ${skipped} non-string keys skipped`)
