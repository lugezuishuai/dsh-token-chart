/**
 * Version comparison and the registry lookup behind the update check.
 *
 * @module dsh-token-chart/update
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { DEFAULT_REGISTRY, PACKAGE_NAME, UPDATE_FETCH_TIMEOUT_MS } from './constants.ts'

/**
 * Compare two dotted versions, tolerating a prerelease suffix.
 *
 * `1.2.0` outranks `1.2.0-rc.1`, and a missing numeric segment counts as 0, so
 * the check never offers a downgrade for tags like `0.2.0-rc.2` + `0.2.0`.
 * @param left - the version in hand.
 * @param right - the candidate version.
 * @returns -1, 0 or 1 for left &lt; right, equal, left &gt; right.
 */
export function compareVersions(left: unknown, right: unknown): -1 | 0 | 1 {
  const parse = (value: unknown): { numbers: number[]; prerelease: string } => {
    const text = String(value ?? '')
      .trim()
      .replace(/^v/, '')
    const [core, ...rest] = text.split('-')
    const numbers = core.split('.').map((part) => {
      const parsed = Number.parseInt(part, 10)
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
    })
    while (numbers.length < 3) numbers.push(0)
    return { numbers, prerelease: rest.join('-') }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1
  }
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === '') return 1
  if (b.prerelease === '') return -1
  return a.prerelease < b.prerelease ? -1 : 1
}

/** The registry the profile installs from, read from its `.npmrc` when present. */
export function profileRegistry() {
  const dir = process.env.DSH_PROFILE_DIR
  if (typeof dir !== 'string' || dir.trim() === '') return DEFAULT_REGISTRY
  try {
    const text = readFileSync(path.join(dir.trim(), '.npmrc'), 'utf8')
    const match = /^\s*registry\s*=\s*(\S+)\s*$/m.exec(text)
    if (match === null) return DEFAULT_REGISTRY
    return match[1].endsWith('/') ? match[1] : `${match[1]}/`
  } catch {
    return DEFAULT_REGISTRY
  }
}

/** The package's own manifest, read next to this module. */
export async function readOwnManifest(): Promise<{ name: string; version: string }> {
  // The Host artifact lives in `lib/`, one level below the package root, while a
  // source-mode run sits in `src/`. Try the package root first, then the module's
  // own directory, so neither layout silently falls back to a placeholder version.
  const candidates = [new URL('../package.json', import.meta.url), new URL('./package.json', import.meta.url)]
  for (const url of candidates) {
    try {
      const parsed = JSON.parse(await readFile(url, 'utf8')) as { name?: unknown; version?: unknown }
      if (typeof parsed.version === 'string' && parsed.version !== '') {
        return { name: String(parsed.name ?? PACKAGE_NAME), version: parsed.version }
      }
    } catch {
      /* try the next candidate */
    }
  }
  return { name: PACKAGE_NAME, version: '0.0.0' }
}

/**
 * Ask a registry for a package's `latest` dist-tag.
 * @param packageName - the package to look up.
 * @param registry - registry base URL.
 * @returns the version string, or undefined when the registry has no such package.
 */
export async function fetchLatestVersion(
  packageName: string,
  registry: string = DEFAULT_REGISTRY,
): Promise<string | undefined> {
  const base = registry.endsWith('/') ? registry : `${registry}/`
  const url = `${base}${encodeURIComponent(packageName).replace('%40', '@')}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.npm.install-v1+json, application/json' },
    })
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`registry answered ${response.status}`)
    const body = (await response.json()) as { 'dist-tags'?: { latest?: unknown } }
    const latest = body['dist-tags']?.latest
    return typeof latest === 'string' && latest !== '' ? latest : undefined
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ paths */
