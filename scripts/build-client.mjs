/**
 * Bundle the browser half into `lib/client.js`.
 *
 * The artifact is a CJS closure factory — the DSH client-module contract:
 *
 * ```js
 * window.__ModuleLoader__.load({ id: 'dsh-token-chart', factory: (require) => { … } })
 * ```
 *
 * React and the other platform seeds stay external and resolve through the
 * `require` the loader injects (its module table), so the bundle never ships
 * its own React copy. The output is deliberately not minified: the artifact is
 * auditable line by line, and small enough that minification would only cost
 * readability.
 */
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { PACKAGE_ID, banner, footer, report } from './client-contract.mjs'

const OUT = 'lib/client.js'

const result = await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: OUT,
  bundle: true,
  format: 'cjs',
  // Keep Chinese metadata and UI text literal in the artifact: the default
  // `ascii` charset escapes every non-ASCII character into \uXXXX.
  charset: 'utf8',
  platform: 'browser',
  // Automatic JSX runtime: JSX compiles to `react/jsx-runtime` imports (the
  // tsconfig's `jsx: react-jsx`), never to `React.createElement`.
  jsx: 'automatic',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  // Module-table specifiers the loader hands to the factory.
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  banner: { js: banner },
  footer: { js: footer },
  metafile: false,
  logLevel: 'warning',
})

if (result.errors.length > 0) {
  for (const error of result.errors) console.error(error)
  process.exit(1)
}

const code = await readFile(OUT, 'utf8')
const prefix = `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}`
if (!code.startsWith(prefix)) {
  console.error(`build-client: artifact does not start with the loader call:\n  ${code.slice(0, 120)}`)
  process.exit(1)
}
const stray = [...code.matchAll(/require\((["'])([^"']+)\1\)/g)]
  .map(match => match[2])
  .filter(name => !['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'].includes(name))
if (stray.length > 0) {
  console.error(`build-client: unexpected bare require(s): ${[...new Set(stray)].join(', ')}`)
  process.exit(1)
}

await writeFile(`${OUT}.tmp`, code, 'utf8')
report(OUT, code, gzipSync(Buffer.from(code), { level: 1 }).length)
