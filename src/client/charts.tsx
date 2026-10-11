/**
 * Built-in SVG fallback charts, used when the ECharts chunk is
 * unavailable (offline first paint, chunk failure, degraded mode).
 *
 * @module dsh-token-chart/client/charts
 */
import type { ChartPoint, SeriesSpec, SliceSpec, Translate } from './models.ts'

import { useElementWidth } from './api.ts'
import { compactTokens, exactTokens, percentText } from './format.ts'

/** One bar/line chart: bars and lines share points and a metric axis. */
export function CartesianChart({
  points,
  series,
  height = 210,
}: {
  points: ChartPoint[]
  series: SeriesSpec[]
  height?: number
  t: Translate
}) {
  const [ref, width] = useElementWidth()
  const box = Math.max(220, width || 320)
  const hasRight = series.some((entry) => entry.axis === 'right')
  const padding = { top: 12, right: hasRight ? 46 : 14, bottom: 30, left: 48 }
  const innerWidth = Math.max(40, box - padding.left - padding.right)
  const innerHeight = Math.max(40, height - padding.top - padding.bottom)

  const leftMax = Math.max(
    1,
    ...series
      .filter((entry) => entry.axis !== 'right')
      .flatMap((entry) => points.map((point) => Number(point.values[entry.key]) || 0)),
  )
  const rightMax = Math.max(
    0.0001,
    ...series
      .filter((entry) => entry.axis === 'right')
      .flatMap((entry) => points.map((point) => Number(point.values[entry.key]) || 0)),
  )
  const scaleY = (value: number, axis: 'left' | 'right' | undefined): number => {
    const max = axis === 'right' ? rightMax : leftMax
    return padding.top + innerHeight - (Math.max(0, value) / max) * innerHeight
  }
  const step = innerWidth / Math.max(1, points.length)
  const barSeries = series.filter((entry) => entry.type === 'bar')
  const barWidth = Math.max(2, Math.min(26, (step * 0.72) / Math.max(1, barSeries.length)))
  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 56))))

  const children: any[] = []
  for (const ratio of gridLines) {
    const y = padding.top + innerHeight * ratio
    children.push(
      <line
        key={`grid-${ratio}`}
        x1={padding.left}
        x2={padding.left + innerWidth}
        y1={y}
        y2={y}
        stroke="var(--dsw-alias-border-l1)"
        strokeWidth={1}
        strokeDasharray={ratio === 1 ? undefined : '3 4'}
      />,
    )
  }
  children.push(
    <text
      key="axis-left-max"
      x={padding.left - 8}
      y={padding.top + 4}
      textAnchor="end"
      fontSize={10}
      fill="var(--dsw-alias-label-secondary)"
    >
      {compactTokens(leftMax)}
    </text>,
  )
  children.push(
    <text
      key="axis-left-zero"
      x={padding.left - 8}
      y={padding.top + innerHeight}
      textAnchor="end"
      fontSize={10}
      fill="var(--dsw-alias-label-secondary)"
    >
      {'0'}
    </text>,
  )
  if (hasRight) {
    children.push(
      <text
        key="axis-right-max"
        x={padding.left + innerWidth + 8}
        y={padding.top + 4}
        fontSize={10}
        fill="var(--dsw-alias-label-secondary)"
      >
        {percentText(rightMax)}
      </text>,
    )
  }

  points.forEach((point, index) => {
    if (index % labelEvery !== 0) return
    children.push(
      <text
        key={`label-${index}`}
        x={padding.left + step * index + step / 2}
        y={padding.top + innerHeight + 16}
        textAnchor="middle"
        fontSize={10}
        fill="var(--dsw-alias-label-secondary)"
      >
        {String(point.label ?? '')}
      </text>,
    )
  })

  barSeries.forEach((entry, seriesIndex) => {
    points.forEach((point, index) => {
      const value = Math.max(0, Number(point.values[entry.key]) || 0)
      if (value <= 0) return
      const x = padding.left + step * index + step / 2 - (barWidth * barSeries.length) / 2 + barWidth * seriesIndex
      const y = scaleY(value, entry.axis)
      children.push(
        <rect
          key={`bar-${entry.key}-${index}`}
          x={x}
          y={y}
          width={barWidth}
          height={Math.max(1, padding.top + innerHeight - y)}
          rx={Math.min(3, barWidth / 2)}
          fill={entry.color}
        >
          <title>{`${entry.label}: ${exactTokens(value)}`}</title>
        </rect>,
      )
    })
  })

  for (const entry of series.filter((item) => item.type === 'line')) {
    const coordinates = points.map((point, index) => {
      const value = Number(point.values[entry.key]) || 0
      return [padding.left + step * index + step / 2, scaleY(value, entry.axis)]
    })
    children.push(
      <polyline
        key={`line-${entry.key}`}
        points={coordinates.map((pair) => pair.join(',')).join(' ')}
        fill="none"
        stroke={entry.color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />,
    )
    coordinates.forEach((pair, index) => {
      children.push(
        <circle key={`dot-${entry.key}-${index}`} cx={pair[0]} cy={pair[1]} r={2.6} fill={entry.color}>
          <title>{`${entry.label}: ${exactTokens(points[index].values[entry.key])}`}</title>
        </circle>,
      )
    })
  }

  return (
    <div className="dtc-chart" ref={ref}>
      {
        <svg width={box} height={height} role="img" aria-label={series.map((entry) => entry.label).join(', ')}>
          {children}
        </svg>
      }
      <Legend series={series} />
    </div>
  )
}

export function Legend({ series }: { series: SeriesSpec[] }) {
  return (
    <div className="dtc-legend">
      {series.map((entry) => (
        <span key={entry.key} className="dtc-legend-item">
          <span className="dtc-swatch" style={{ background: entry.color }} />
          <span>{entry.label}</span>
        </span>
      ))}
    </div>
  )
}

/** Donut chart over prepared slices. */
export function PieChart({ slices, t }: { slices: SliceSpec[]; t: Translate }) {
  const [ref, width] = useElementWidth()
  const box = Math.max(180, Math.min(width || 240, 240))
  const size = box
  const radius = size / 2 - 6
  const inner = radius * 0.58
  const center = size / 2
  const total = slices.reduce((sum, slice) => sum + (Number(slice.value) || 0), 0)
  if (total <= 0) return <p className="dtc-empty">{t('panel.empty')}</p>
  let angle = -Math.PI / 2
  const paths = slices.map((slice, index) => {
    const fraction = (Number(slice.value) || 0) / total
    const sweep = fraction * Math.PI * 2
    const start = angle
    const end = angle + sweep
    angle = end
    const large = sweep > Math.PI ? 1 : 0
    const point = (r: number, a: number): [number, number] => [center + r * Math.cos(a), center + r * Math.sin(a)]
    const [x1, y1] = point(radius, start)
    const [x2, y2] = point(radius, end)
    const [x3, y3] = point(inner, end)
    const [x4, y4] = point(inner, start)
    const d =
      slice.value <= 0
        ? ''
        : `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`
    return (
      <path
        key={`slice-${slice.key}-${index}`}
        d={d}
        fill={slice.color}
        fillOpacity={slice.opacity ?? 1}
        stroke="var(--dsw-alias-bg-base)"
        strokeWidth={1.5}
      >
        <title>{`${slice.label}: ${exactTokens(slice.value)} (${percentText(fraction)})`}</title>
      </path>
    )
  })
  return (
    <div className="dtc-chart dtc-chart-pie" ref={ref}>
      <svg width={size} height={size} role="img" aria-label={t('chart.pie')}>
        {paths}
      </svg>
      {
        <div className="dtc-legend dtc-legend-column">
          {slices.map((slice, index) => (
            <span key={`legend-${slice.key}-${index}`} className="dtc-legend-item">
              <span className="dtc-swatch" style={{ background: slice.color, opacity: slice.opacity ?? 1 }} />
              <span>{`${slice.label} · ${compactTokens(slice.value)} · ${percentText((Number(slice.value) || 0) / total)}`}</span>
            </span>
          ))}
        </div>
      }
    </div>
  )
}

/** Page sizes offered under a table, smallest first. */
export const PAGE_SIZES = [10, 20, 50]
export const DEFAULT_PAGE_SIZE = 20
