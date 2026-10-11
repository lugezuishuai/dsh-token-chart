/**
 * The ECharts half: the lazy package-local chunk, theme tokens, the
 * option builder and the mount that keeps one instance per container.
 *
 * @module dsh-token-chart/client/mount
 */
import type { ChartSpec, Translate } from './models.ts'

import { React } from './react.ts'

import { useElementWidth } from './api.ts'
import { compactTokens, exactTokens, percentText } from './format.ts'

/**
 * Package-local lazy chunk carrying ECharts.
 *
 * The Harness client module system resolves this relative request to
 * `<entry id>/client.echarts.js`, fetches it once from
 * `/plugins/dsh-token-chart/client.echarts.js?rev=…`, and hands back the
 * chunk factory's exports. The chunk is built by `npm run build:chunk` and
 * must stay self-contained — nothing else is bundled with it.
 */
export const CHART_CHUNK = './client.echarts.js'
export let chartLibrary: Promise<any> | null = null

/** Load the ECharts chunk once; a failure is reported and never retried silently. */
export function loadChartLibrary() {
  if (chartLibrary === null) {
    chartLibrary = Promise.resolve()
      .then(() => require.async(CHART_CHUNK))
      .then((chunk) => {
        const library =
          chunk !== null && typeof chunk === 'object' && chunk.default !== undefined ? chunk.default : chunk
        if (library === null || typeof library !== 'object' || typeof library.init !== 'function') {
          throw new Error('chart chunk did not export ECharts')
        }
        return library
      })
      .catch((error) => {
        chartLibrary = null
        throw error
      })
  }
  return chartLibrary
}

/** Concrete colors for ECharts, read from the same tokens the UI uses. */
export function themeTokens() {
  const computed = typeof getComputedStyle === 'function' ? getComputedStyle(document.body) : null
  const read = (name: string, fallback: string): string => {
    const value = computed === null ? '' : computed.getPropertyValue(name).trim()
    return value === '' ? fallback : value
  }
  return {
    total: read('--dsw-alias-brand-primary', '#4C6EF5'),
    input: read('--dsw-alias-state-warn-primary', '#F59F00'),
    output: read('--dsw-alias-state-success-primary', '#37B24D'),
    cache: read('--dsw-alias-state-idle-primary', '#868E96'),
    hitRate: read('--dsw-alias-state-error-primary', '#F03E3E'),
    secondary: read('--dsw-alias-label-secondary', '#646A73'),
    border: read('--dsw-alias-border-l1', '#DEE0E3'),
  }
}

export const TOKEN_OF_METRIC: Record<string, 'total' | 'input' | 'output' | 'cache' | 'hitRate'> = {
  total: 'total',
  input: 'input',
  output: 'output',
  cache: 'cache',
  cacheHitRate: 'hitRate',
}

/** ECharts needs concrete colors, so token hex values get an alpha suffix here. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(String(color).trim())
  if (match === null) return color
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((char) => char + char)
          .join('')
      : match[1]
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Re-read the tokens when the product switches light/dark or the UI scale. */
export function useThemeRevision() {
  const [revision, setRevision] = React.useState(0)
  React.useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined
    const observer = new MutationObserver(() => setRevision((value) => value + 1))
    const options = { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class', 'style'] }
    observer.observe(document.documentElement, options)
    observer.observe(document.body, options)
    return () => observer.disconnect()
  }, [])
  return revision
}

/**
 * Translate the renderer-agnostic spec into an ECharts option.
 * @param spec - `{ kind, points, series, slices }`.
 * @param tokens - concrete colors read from the theme tokens.
 */
export function echartsOption({ kind, points, series, slices }: ChartSpec, tokens: Record<string, string>) {
  const axisLabel = { color: tokens.secondary, fontSize: 10 }
  const axisLine = { lineStyle: { color: tokens.border } }
  const categories = points.map((point, index) => String(point.label ?? index + 1))
  const hasRightAxis = series.some((entry) => entry.axis === 'right')
  const colorOf = (key: string): string => tokens[TOKEN_OF_METRIC[key] ?? 'total']

  if (kind === 'pie') {
    return {
      animationDuration: 200,
      textStyle: { color: tokens.secondary, fontSize: 11 },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) =>
          `${params.name}: ${exactTokens(params.value)} (${Number(params.percent).toFixed(1)}%)`,
      },
      legend: {
        bottom: 0,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: tokens.secondary, fontSize: 11 },
      },
      series: [
        {
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          label: { color: tokens.secondary, fontSize: 10 },
          labelLine: { lineStyle: { color: tokens.border } },
          data: slices.map((slice) => ({
            name: slice.label,
            value: slice.value,
            itemStyle: { color: colorOf(slice.metric ?? 'total'), opacity: slice.opacity ?? 1 },
          })),
        },
      ],
    }
  }

  const yAxis = [
    {
      type: 'value',
      splitLine: { lineStyle: { color: tokens.border, type: 'dashed' } },
      axisLabel: { ...axisLabel, formatter: (value: any) => compactTokens(value) },
    },
  ]
  if (hasRightAxis) {
    yAxis.push({
      type: 'value',
      min: 0,
      max: 1,
      position: 'right',
      splitLine: { show: false } as any,
      axisLabel: { ...axisLabel, formatter: (value: any) => percentText(value) },
    } as any)
  }

  // A range slider under the axis: drag its window to zoom the x range; the
  // same window also answers the wheel / pinch through the inside zoom.
  const zoomable = categories.length >= 2
  const legendShown = series.length > 1
  const dataZoom = zoomable
    ? [
        { type: 'inside', start: 0, end: 100 },
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 18,
          bottom: 6,
          borderColor: tokens.border,
          backgroundColor: 'transparent',
          fillerColor: withAlpha(tokens.total, 0.12),
          handleStyle: { color: tokens.total, borderColor: tokens.total },
          moveHandleStyle: { color: tokens.total },
          dataBackground: { lineStyle: { color: tokens.border }, areaStyle: { color: tokens.border, opacity: 0.35 } },
          selectedDataBackground: {
            lineStyle: { color: tokens.secondary },
            areaStyle: { color: tokens.secondary, opacity: 0.3 },
          },
          textStyle: { color: tokens.secondary, fontSize: 10 },
          brushSelect: false,
        },
      ]
    : undefined

  return {
    animationDuration: 200,
    textStyle: { color: tokens.secondary, fontSize: 11 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: any) => exactTokens(value) },
    legend: legendShown
      ? { bottom: zoomable ? 30 : 0, itemWidth: 8, itemHeight: 8, textStyle: { color: tokens.secondary, fontSize: 11 } }
      : { show: false },
    grid: {
      left: 4,
      right: 4,
      top: 14,
      bottom: zoomable ? (legendShown ? 74 : 48) : legendShown ? 26 : 6,
      containLabel: true,
    },
    ...(dataZoom === undefined ? {} : { dataZoom }),
    xAxis: { type: 'category', data: categories, axisLabel, axisLine, axisTick: { show: false } },
    yAxis,
    series: series.map((entry) => ({
      name: entry.label,
      type: entry.type,
      yAxisIndex: entry.axis === 'right' ? 1 : 0,
      barMaxWidth: 26,
      itemStyle: { color: colorOf(entry.key) },
      lineStyle: { color: colorOf(entry.key), width: 2 },
      symbolSize: 5,
      data: points.map((point) => Number(point.values[entry.key]) || 0),
      ...(entry.axis === 'right' ? { tooltip: { valueFormatter: (value: any) => percentText(value) } } : {}),
    })),
  }
}

/**
 * Mount one chart into ECharts, falling back to the built-in SVG renderer
 * when the chunk cannot be loaded (blocked request, broken artifact, …).
 */
export function EchartsMount({
  spec,
  height,
  fallback,
  t,
}: {
  spec: ChartSpec
  height?: number
  fallback?: React.ReactNode
  t: Translate
}) {
  const [containerRef, width] = useElementWidth()
  const holderRef = React.useRef(null)
  const chartRef = React.useRef<any>(null)
  const [status, setStatus] = React.useState('pending')
  const themeRevision = useThemeRevision()

  const option = React.useMemo(
    () => (status === 'failed' ? null : echartsOption(spec, themeTokens())),
    // themeRevision re-reads the tokens after a light/dark switch
    [spec, status, themeRevision],
  )

  React.useEffect(() => {
    let live = true
    if (status === 'failed' || width <= 0) return undefined
    loadChartLibrary()
      .then((echarts) => {
        if (!live) return
        const holder = holderRef.current
        if (holder === null) return
        let chart: any = chartRef.current
        if (chart === null) {
          chart = echarts.init(holder, null, { renderer: 'svg', width, height })
          chartRef.current = chart
        }
        chart.resize({ width, height })
        chart.setOption(option, true)
        setStatus('ready')
      })
      .catch((error) => {
        if (!live) return
        console.warn('[dsh-token-chart] chart chunk unavailable, using the built-in renderer:', error)
        setStatus('failed')
      })
    return () => {
      live = false
    }
  }, [option, width, height, status])

  React.useEffect(
    () => () => {
      if (chartRef.current !== null) {
        chartRef.current.dispose()
        chartRef.current = null
      }
    },
    [],
  )

  if (status === 'failed') return fallback

  return (
    <div
      className="dtc-chart"
      ref={containerRef}
      data-dtc-renderer={status === 'ready' ? 'echarts' : 'pending'}
      data-dtc-chart={spec.kind}
      data-dtc-zoom={spec.zoom === true ? 'slider' : 'none'}
      data-dtc-series={
        spec.series.length > 0 ? spec.series.map((entry) => entry.type).join(',') : spec.kind === 'pie' ? 'pie' : ''
      }
    >
      {status === 'ready' ? null : <p className="dtc-empty">{t('chart.loading')}</p>}
      <div
        ref={holderRef}
        className="dtc-echarts"
        style={{ width: '100%', height: `${height}px`, display: status === 'ready' ? 'block' : 'none' }}
      />
    </div>
  )
}

/* ------------------------------------------------------ shared pieces */
