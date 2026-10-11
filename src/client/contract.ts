/**
 * Package-wide constants shared by every client module: the API
 * prefix, the entry id, colors, chart vocabulary and preference defaults.
 *
 * @module dsh-token-chart/client/contract
 */
import type { Prefs } from '../types.ts'

import { CHART_IDS, METRIC_IDS as SHARED_METRIC_IDS } from '../constants.ts'
import type { ChartId, MetricId } from '../types.ts'

import type { Translate } from './models.ts'

export const API = '/token-chart/api'
export const NS = 'token-chart'
/** Right-sidebar tab type id and kind; also the slot key of its seats. */
export const KIND = 'dsh-token-chart'
/** Left sidebar panel id and the key of its `main` seat. */
export const PANEL_ID = 'token-chart'

export const COLOR = {
  total: 'var(--dsw-alias-brand-primary)',
  input: 'var(--dsw-alias-state-warn-primary)',
  output: 'var(--dsw-alias-state-success-primary)',
  cache: 'var(--dsw-alias-state-idle-primary)',
  cacheHitRate: 'var(--dsw-alias-state-error-primary)',
}
export const METRIC_COLOR = {
  total: COLOR.total,
  input: COLOR.input,
  output: COLOR.output,
  cache: COLOR.cache,
  cacheHitRate: COLOR.cacheHitRate,
}
export const CHART_KINDS: ChartId[] = [...CHART_IDS]
export const METRIC_IDS: MetricId[] = [...SHARED_METRIC_IDS]
export const DEFAULT_PREFS: Prefs = {
  sessionChart: 'multi-bar',
  dailyChart: 'multi-bar',
  sessionMetrics: ['input', 'output', 'cache', 'total'],
  dailyMetrics: ['input', 'output', 'cache', 'total'],
  showTable: true,
  showCacheHitRate: true,
  interceptUsageButton: true,
}

/* ------------------------------------------------------------ locale */

/** What the shell hands a browser-half plugin when it mounts `apply`. */
export interface ClientContext {
  effect: (callback: () => unknown, description?: string) => unknown
  inject: (deps: string[], callback: (services: Record<string, any>) => unknown) => unknown
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void }
  locale: {
    bind: (namespace: string) => Translate
    register: (namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }) => unknown
  }
  slots: {
    inject: (name: string, callback: () => unknown) => () => void
    register: (options: Record<string, unknown>, component?: unknown) => unknown
  }
}
