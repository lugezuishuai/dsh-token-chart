/**
 * On-disk locations, resolved the way `@deepseek-ai/dsh-home-paths` does.
 *
 * @module dsh-token-chart/paths
 */
import { homedir } from 'node:os'
import path from 'node:path'

/** Resolve the Harness home exactly like `@deepseek-ai/dsh-home-paths`. */
function resolveDshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return path.join(homedir(), '.dsh')
}

export function dataDir() {
  return path.join(resolveDshHome(), 'storages', 'dsh-token-chart')
}

export function usageFile() {
  return path.join(dataDir(), 'usage.json')
}

export function prefsFile() {
  return path.join(dataDir(), 'prefs.json')
}

/* ------------------------------------------------------------ usage model */
