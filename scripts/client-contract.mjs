/** The client-module contract shared by the build scripts and the preflight. */
import { rename } from 'node:fs/promises'

/** Must equal `package.json#name`: it is the loader's entry id and chunk owner. */
export const PACKAGE_ID = 'dsh-token-chart'

/**
 * Opening of the closure factory. `module`/`exports` are declared here because
 * the bundle is CJS and the factory's return value is what the loader keeps.
 */
export const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
`

/** Closing of the factory: hand the plugin object back to the loader. */
export const footer = `
return module.exports;
} });
`

/**
 * Publish a finished artifact and print what it costs.
 * @param target - path the artifact must end up at.
 * @param code - the artifact's bytes.
 * @param gzipBytes - what the webserver transfers for it.
 */
export async function report(target, code, gzipBytes) {
  await rename(`${target}.tmp`, target)
  const kilobytes = (bytes) => `${(bytes / 1024).toFixed(0)} KB`
  console.log(`built ${target}`)
  console.log(`  raw ${code.length.toLocaleString('en-US')} B · gzip-1 ${gzipBytes.toLocaleString('en-US')} B (${kilobytes(gzipBytes)} transferred)`)
}
