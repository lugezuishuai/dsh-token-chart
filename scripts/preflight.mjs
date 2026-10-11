/**
 * Pre-pack / pre-publish guard.
 *
 * Everything checked here is a plain string or a file path that no compiler
 * validates: the loader id baked into the client bundles, the package name the
 * patch inserts, the artifacts the tarball has to carry, and the registry a
 * consumer's install would be sent to. A published version cannot be taken
 * back, so the checks run before the tarball exists.
 *
 * Wired into `prepack` and `prepublishOnly`; `npm run check` runs it too.
 */
import { existsSync, readFileSync } from 'node:fs'

const failures = []

/* ---- manifest --------------------------------------------------------- */

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

if (typeof pkg.name !== 'string' || pkg.name === '') {
  failures.push('package.json must declare a name')
}
if (typeof pkg.version !== 'string' || pkg.version === '') {
  failures.push('package.json must declare a version')
}
if (pkg.private === true) {
  failures.push("package.json must not be private — `npm publish` refuses private packages")
}
if (typeof pkg.engines?.dsh !== 'string' || pkg.engines.dsh === '') {
  failures.push('package.json must declare engines.dsh: the DSH range this plugin was tested against')
}
if (pkg.publishConfig?.registry !== 'https://registry.npmjs.org/') {
  failures.push(
    `publishConfig.registry must be https://registry.npmjs.org/ (got ${String(pkg.publishConfig?.registry)}) — ` +
      'a machine whose default registry is a private mirror would otherwise publish somewhere nobody can install from',
  )
}
if (pkg.exports?.['./client'] !== './lib/client.js') {
  failures.push("exports['./client'] must point at ./lib/client.js — that is the bundle the client module scan serves")
}

/* ---- artifacts the tarball has to carry -------------------------------- */

const artifacts = [
  'lib/index.js',
  'lib/client.js',
  'lib/client.echarts.js',
  'lib/token-chart.css',
  'lib/types/index.d.ts',
]
for (const file of artifacts) {
  if (!existsSync(file)) failures.push(`${file} is missing — the pack would ship a plugin that cannot load`)
}
if (failures.length > 0 && artifacts.some((file) => !existsSync(file))) {
  console.error('preflight failed:\n- ' + failures.join('\n- '))
  console.error('\nlib/ is not committed; run `npm run build` first (prepack does it for you).')
  process.exit(1)
}

/* ---- bundle identity --------------------------------------------------- */

const client = readFileSync('lib/client.js', 'utf8')
if (!client.startsWith(`window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}`)) {
  failures.push(`lib/client.js must register the loader id ${JSON.stringify(pkg.name)} (the client scan keys on the package name)`)
}

const chunk = readFileSync('lib/client.echarts.js', 'utf8')
if (!chunk.includes(`id: ${JSON.stringify(pkg.name)}`) || !chunk.includes("chunk: 'client.echarts.js'")) {
  failures.push('lib/client.echarts.js must register as the `client.echarts.js` chunk of this package')
}

const patch = readFileSync('cordis.patch.yml', 'utf8')
if (!patch.includes(`name: '${pkg.name}'`)) {
  failures.push(`cordis.patch.yml must insert the plugin by package name '${pkg.name}'`)
}

/* ---- consumer-side resolution ------------------------------------------ */

// A lockfile that resolves to a private registry or a mirror publishes fine and
// then fails in the consumer's install: a full tarball URL is not a registry
// name they can re-resolve. Nothing about running `npm install` behind such a
// registry makes this visible locally, so the guard belongs next to the package.
// The public mirrors are tolerated (`registry.npmmirror.com`: this project's
// .npmrc points installs there, and npm rewrites the host anyway); anything
// else — an internal registry, a corporate proxy — is a leak.
const ALLOWED_LOCK_HOSTS = new Set(['https://registry.npmjs.org', 'https://registry.npmmirror.com'])
if (existsSync('package-lock.json')) {
  const lock = readFileSync('package-lock.json', 'utf8')
  const foreign = [
    ...new Set(
      [...lock.matchAll(/"resolved": "(https?:\/\/[^/"]+)/g)]
        .map((match) => match[1])
        .filter((host) => !ALLOWED_LOCK_HOSTS.has(host)),
    ),
  ]
  if (foreign.length > 0) {
    failures.push(
      `package-lock.json resolves to ${foreign.join(', ')} — only ${[...ALLOWED_LOCK_HOSTS].join(' and ')} are allowed`,
    )
  }
}

if (failures.length > 0) {
  console.error('preflight failed:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log(`preflight ok: ${pkg.name}@${pkg.version}`)
