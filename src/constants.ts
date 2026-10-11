/**
 * Values both halves and every Host module agree on.
 *
 * @module dsh-token-chart/constants
 */

/** The plugin's package name: the client entry id and the artifact key. */
export const PACKAGE_NAME = 'dsh-token-chart'

/** Retention window: only the newest 7 calendar days are kept on disk. */
export const RETENTION_DAYS = 7
/** Store schema version; a document from another version is rebuilt from logs. */
export const STORE_VERSION = 2

export const DAY_MS = 24 * 60 * 60 * 1000
/** Browser half and Host half agree on this prefix; it is part of the package contract. */
export const API_PREFIX = '/token-chart/api'
export const SAVE_DEBOUNCE_MS = 1200
export const BACKFILL_SESSION_LIMIT = 40
/** Fallback registry for the update check when the profile names none. */
export const DEFAULT_REGISTRY = 'https://registry.npmmirror.com/'
export const UPDATE_CHECK_TTL_MS = 30 * 60 * 1000
export const UPDATE_FETCH_TIMEOUT_MS = 12000

export const METRIC_IDS = ['input', 'output', 'cache', 'total'] as const
export const CHART_IDS = ['bar', 'line', 'pie', 'table', 'multi-bar', 'multi-line', 'bar-line'] as const
