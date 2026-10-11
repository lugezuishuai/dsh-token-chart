/**
 * Preference defaults, shared by the Host half and the browser half.
 *
 * @module dsh-token-chart/prefs
 */
import { CHART_IDS, METRIC_IDS } from './constants.ts'
import type { ChartId, MetricId, Prefs } from './types.ts'

/** Preference defaults — the single definition shared by Host and browser halves. */
export const DEFAULT_PREFS: Prefs = {
  /** Session drawer chart: bar | line | pie | table | multi-bar | multi-line | bar-line */
  sessionChart: 'multi-bar',
  /** Daily panel chart, same vocabulary. */
  dailyChart: 'multi-bar',
  /** Metrics plotted in the session drawer. */
  sessionMetrics: ['input', 'output', 'cache', 'total'],
  /** Metrics plotted in the daily panel. */
  dailyMetrics: ['input', 'output', 'cache', 'total'],
  /** Also render the data table under the chart. */
  showTable: true,
  /** Cache-hit-rate line in the combined chart. */
  showCacheHitRate: true,
  /** Clicking the product's own "用量" pill opens the drawer instead of its dialog. */
  interceptUsageButton: true,
}
/** Narrow one chart id, falling back to the default. */
function chartOf(value: unknown, fallback: ChartId): ChartId {
  return typeof value === 'string' && (CHART_IDS as readonly string[]).includes(value) ? (value as ChartId) : fallback
}

/** Narrow the metric list: unknown ids are dropped, an empty list falls back. */
function metricsOf(value: unknown, fallback: readonly MetricId[]): MetricId[] {
  const list = Array.isArray(value)
    ? value.filter(
        (item): item is MetricId => typeof item === 'string' && (METRIC_IDS as readonly string[]).includes(item),
      )
    : []
  return list.length > 0 ? [...new Set(list)] : [...fallback]
}

/** Narrow one boolean flag. */
function flagOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Coerce one stored preference document into the accepted shape.
 * @param raw - whatever `prefs.json` (or a client patch) held.
 */
export function normalizePrefs(raw: unknown): Prefs {
  const source = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    sessionChart: chartOf(source.sessionChart, DEFAULT_PREFS.sessionChart),
    dailyChart: chartOf(source.dailyChart, DEFAULT_PREFS.dailyChart),
    sessionMetrics: metricsOf(source.sessionMetrics, DEFAULT_PREFS.sessionMetrics),
    dailyMetrics: metricsOf(source.dailyMetrics, DEFAULT_PREFS.dailyMetrics),
    showTable: flagOf(source.showTable, DEFAULT_PREFS.showTable),
    showCacheHitRate: flagOf(source.showCacheHitRate, DEFAULT_PREFS.showCacheHitRate),
    interceptUsageButton: flagOf(source.interceptUsageButton, DEFAULT_PREFS.interceptUsageButton),
  }
}
