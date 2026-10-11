/**
 * Build the package-local ECharts chunk that `src/client/mount.ts` loads with
 * `require.async('./client.echarts.js')`.
 *
 * The chunk self-registers under the entry id with a `chunk` file name, which
 * is what lets the loader key it as `<package>/client.echarts.js`. It must be
 * self-contained: a chunk may only require the platform seeds, never another
 * bundle-level specifier.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { PACKAGE_ID, report } from './client-contract.mjs'

const OUT = 'client/client.echarts.js'
await mkdir('node_modules/.cache', { recursive: true })

const result = await build({
  entryPoints: ['src/chunk/echarts.entry.ts'],
  outfile: 'node_modules/.cache/dtc-echarts.body.js',
  bundle: true,
  format: 'iife',
  // Keep Chinese metadata and UI text literal in the artifact: the default
  // `ascii` charset escapes every non-ASCII character into \uXXXX.
  charset: 'utf8',
  globalName: '__DTC_ECHARTS',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  legalComments: 'eof',
  logLevel: 'warning',
})

if (result.errors.length > 0) {
  for (const error of result.errors) console.error(error)
  process.exit(1)
}

const body = await readFile('node_modules/.cache/dtc-echarts.body.js', 'utf8')
const wrapper = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_ID)},
  chunk: 'client.echarts.js',
  factory: (require) => {
${body}
    return __DTC_ECHARTS
  },
})
`
// Post-write invariants: the name must match CLIENT_CHUNK, the registration must
// name this entry, and nothing may require a bare specifier.
if (!/factory: \(require\) =>/.test(wrapper) || !wrapper.includes(`id: ${JSON.stringify(PACKAGE_ID)}`)) {
  console.error('build-chunk: wrapper is missing the loader registration')
  process.exit(1)
}
const stray = [...wrapper.matchAll(/require\((["'])([^"']+)\1\)/g)].map(match => match[2])
if (stray.length > 0) {
  console.error(`build-chunk: chunk must be self-contained, found require(${stray[0]})`)
  process.exit(1)
}

await writeFile(`${OUT}.tmp`, wrapper, 'utf8')
await report(OUT, wrapper, gzipSync(Buffer.from(wrapper), { level: 1 }).length)
