/**
 * The shapes the browser half passes between its own modules.
 *
 * They mirror the Host's JSON reports but are written for rendering: formatted
 * labels, chart-ready series, table rows.
 *
 * @module dsh-token-chart/client/models
 */
import type { Derived, MetricId } from '../types.ts'

/** The locale binder the shell hands to every seat. */
export type Translate = (key: string, values?: Record<string, string | number>) => string

/** A plotted value key: the four metrics plus the derived hit rate. */
export type ValueKey = MetricId | 'cacheHitRate'

/** One point on the x axis plus the metric values it carries. */
export interface ChartPoint {
  label: string
  values: Partial<Record<ValueKey, number>>
}

/** One chart series as the option builders consume it. */
export interface SeriesSpec {
  key: ValueKey
  label: string
  color: string
  type: 'bar' | 'line'
  axis?: 'right'
}

/** One pie slice, or one row of the pie legend. */
export interface SliceSpec {
  key: string
  metric: ValueKey
  label: string
  value: number
  color: string
  opacity?: number
}

/** A table row: the report row plus whatever the column renderers read. */
export type TableRow = Record<string, any> & { key?: string | number }

/** One table column. */
export interface ColumnSpec {
  key: string
  label: string
  align?: 'right'
  render?: (row: TableRow) => string
}

/** Totals as the KPI cards and the facts list show them. */
export interface Totals extends Partial<Derived> {
  turns?: number
  sessions?: number
  routes?: string[]
  firstTime?: number
  lastTime?: number
}

/** State of one polling endpoint hook. */
export interface EndpointState {
  loading: boolean
  value: any
  error?: string
}

/** What `ChartBlock` needs to draw one surface. */
export interface ChartSpec {
  kind: import('../types.ts').ChartId
  points: ChartPoint[]
  series: SeriesSpec[]
  slices: SliceSpec[]
  zoom?: boolean
}
