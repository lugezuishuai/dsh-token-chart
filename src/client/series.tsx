/**
 * Turning a point list into chart series and pie slices, and the block
 * that decides between table, pie and cartesian rendering.
 *
 * @module dsh-token-chart/client/series
 */
import { METRIC_IDS } from './contract.ts'

import type { ChartPoint, ColumnSpec, SeriesSpec, SliceSpec, TableRow, Totals, Translate } from './models.ts'

import type { ChartId, MetricId } from '../types.ts'

import { CartesianChart, PieChart } from './charts.tsx'
import { COLOR, METRIC_COLOR } from './contract.ts'
import { EchartsMount } from './mount.tsx'
import { DataTable } from './table.tsx'

/** Resolve the metric list into chart series for one surface. */
export function seriesFor(metrics: MetricId[], kind: ChartId, showHitRate: boolean, t: Translate): SeriesSpec[] {
  const wanted: MetricId[] = METRIC_IDS.filter((id: MetricId) => metrics.includes(id))
  const list: MetricId[] = wanted.length > 0 ? wanted : ['total']
  // The hit-rate line rides the right axis on every cartesian form, so the
  // setting is visible whichever bar/line/combo chart the user picked.
  const overlay: SeriesSpec[] = showHitRate
    ? [{ key: 'cacheHitRate', label: t('metric.cacheHitRate'), color: COLOR.cacheHitRate, type: 'line', axis: 'right' }]
    : []
  if (kind === 'multi-bar' || kind === 'multi-line') {
    const type = kind === 'multi-bar' ? 'bar' : 'line'
    return [
      ...list.map((id: MetricId) => ({
        key: id,
        label: t(`metric.${id}`),
        color: METRIC_COLOR[id],
        type: type as 'bar' | 'line',
      })),
      ...overlay,
    ]
  }
  const primary: ValueKey = list.includes('total') ? 'total' : list[0]
  const bar = kind !== 'line'
  return [
    { key: primary, label: t(`metric.${primary}`), color: METRIC_COLOR[primary], type: bar ? 'bar' : 'line' },
    ...overlay,
  ]
}

/** Pie slices for one surface. `metric` feeds the ECharts color lookup. */
export function slicesFor(
  _kind: ChartId,
  points: ChartPoint[],
  totals: Totals,
  metrics: MetricId[],
  t: Translate,
): SliceSpec[] {
  const wanted: MetricId[] = METRIC_IDS.filter((id: MetricId) => metrics.includes(id))
  if (wanted.length > 1) {
    return wanted
      .map((id: MetricId) => ({
        key: id,
        metric: id,
        label: t(`metric.${id}`),
        value: Number(totals?.[id]) || 0,
        color: METRIC_COLOR[id],
      }))
      .filter((slice) => slice.value > 0)
  }
  const key = wanted[0] ?? 'total'
  const sorted = [...points].sort((left, right) => (right.values[key] || 0) - (left.values[key] || 0))
  const head = sorted.slice(0, 8)
  const tail = sorted.slice(8)
  const slices = head.map((point, index) => ({
    key: `${key}-${index}`,
    metric: key,
    label: String(point.label ?? index),
    value: Number(point.values[key]) || 0,
    color: COLOR.total,
    opacity: Math.max(0.22, 1 - index * 0.11),
  }))
  if (tail.length > 0) {
    slices.push({
      key: `${key}-other`,
      metric: 'cache',
      label: '…',
      value: tail.reduce((sum, point) => sum + (Number(point.values[key]) || 0), 0),
      color: COLOR.cache,
      opacity: 1,
    })
  }
  return slices.filter((slice) => slice.value > 0)
}

/**
 * One chart block: the configured chart form, plus the optional table.
 *
 * The chart is drawn by ECharts from the lazy chunk; the built-in SVG
 * renderer stays as the fallback for a chunk that cannot be loaded, so a
 * degraded deployment still shows real charts instead of an empty seat.
 * @param props - points, totals, kind, metrics and table columns.
 */
export function ChartBlock({
  kind,
  points,
  totals,
  metrics,
  columns,
  rows,
  showTable,
  showHitRate,
  t,
}: {
  kind: ChartId
  points: ChartPoint[]
  totals?: Totals
  metrics: MetricId[]
  columns: ColumnSpec[]
  rows: TableRow[]
  showTable: boolean
  showHitRate: boolean
  t: Translate
}) {
  if (points.length === 0) return <p className="dtc-empty">{t('panel.empty')}</p>
  const table = showTable ? <DataTable columns={columns} rows={rows} t={t} /> : null
  if (kind === 'table') return table ?? <p className="dtc-empty">{t('panel.empty')}</p>
  const slices = kind === 'pie' ? slicesFor(kind, points, totals ?? {}, metrics, t) : []
  const series = kind === 'pie' ? [] : seriesFor(metrics, kind, showHitRate, t)
  // The range slider occupies its own band under the axis.
  const zoom = kind !== 'pie' && points.length >= 2
  const fallback =
    kind === 'pie' ? <PieChart slices={slices} t={t} /> : <CartesianChart points={points} series={series} t={t} />
  return (
    <div>
      <EchartsMount spec={{ kind, points, series, slices, zoom }} height={zoom ? 248 : 210} fallback={fallback} t={t} />
      {table}
    </div>
  )
}

/* ------------------------------------------------- chart chunk (ECharts) */

import type { ValueKey } from './models.ts'
