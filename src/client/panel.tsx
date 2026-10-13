/**
 * The daily panel behind the left sidebar「Token 用量」entry.
 *
 * @module dsh-token-chart/client/panel
 */
import type { DayBucket, OverviewReport, Point } from '../types.ts'

import { useEndpoint } from './api.ts'
import { Toolbar } from './ui.tsx'

import type { ColumnSpec, Translate } from './models.ts'

import { React } from './react.ts'

import { usePrefs } from './api.ts'
import { clockText, exactTokens, percentText } from './format.ts'
import { ChartBlock } from './series.tsx'
import { KpiRow, Segmented } from './ui.tsx'

export function DailyUsagePanel({ t }: { t: Translate }) {
  const prefs = usePrefs()
  const [range, setRange] = React.useState('today')
  const [tick, setTick] = React.useState(0)
  const endpoint = useEndpoint(`/overview?range=${range}`, tick)
  const report = endpoint.value as OverviewReport | undefined
  const totals = report?.totals
  const buckets: DayBucket[] = Array.isArray(report?.buckets) ? report.buckets : []
  const points: Point[] = Array.isArray(report?.points) ? report.points : []
  // "Today" plots one point per turn across every session, so the axis has to
  // say *when* rather than *which one*: an ordinal would read as a turn
  // number and disagree with the turn column right below the chart.
  const todayLabels = points.map((point) => clockText(point.time))
  const todayHasDuplicateMinutes = new Set(todayLabels).size < todayLabels.length
  const chartPoints =
    range === 'today'
      ? points.map((point, index) => ({
          label: todayHasDuplicateMinutes ? clockText(point.time, true) : todayLabels[index],
          values: {
            input: point.input,
            output: point.output,
            cache: point.cache,
            total: point.total,
            cacheHitRate: point.cacheHitRate,
          },
        }))
      : buckets.map((bucket) => ({
          label: bucket.label,
          values: {
            input: bucket.input,
            output: bucket.output,
            cache: bucket.cache,
            total: bucket.total,
            cacheHitRate: bucket.cacheHitRate,
          },
        }))
  const columns: ColumnSpec[] =
    range === 'today'
      ? [
          { key: 'time', label: t('table.time'), render: (row) => clockText(row.time) },
          { key: 'session', label: t('table.session'), render: (row) => String(row.sessionId ?? '').slice(0, 8) },
          { key: 'turn', label: t('table.turn') },
          { key: 'total', label: t('metric.total'), align: 'right', render: (row) => exactTokens(row.total) },
          { key: 'input', label: t('metric.input'), align: 'right', render: (row) => exactTokens(row.input) },
          { key: 'output', label: t('metric.output'), align: 'right', render: (row) => exactTokens(row.output) },
          { key: 'cache', label: t('metric.cache'), align: 'right', render: (row) => exactTokens(row.cache) },
          {
            key: 'cacheHitRate',
            label: t('metric.cacheHitRate'),
            align: 'right',
            render: (row) => percentText(row.cacheHitRate),
          },
        ]
      : [
          { key: 'label', label: t('table.day') },
          { key: 'turns', label: t('usage.turns'), align: 'right' },
          { key: 'sessions', label: t('usage.sessions'), align: 'right' },
          { key: 'total', label: t('metric.total'), align: 'right', render: (row) => exactTokens(row.total) },
          { key: 'input', label: t('metric.input'), align: 'right', render: (row) => exactTokens(row.input) },
          { key: 'output', label: t('metric.output'), align: 'right', render: (row) => exactTokens(row.output) },
          { key: 'cache', label: t('metric.cache'), align: 'right', render: (row) => exactTokens(row.cache) },
          {
            key: 'cacheHitRate',
            label: t('metric.cacheHitRate'),
            align: 'right',
            render: (row) => percentText(row.cacheHitRate),
          },
        ]

  return (
    <div className="dtc-root dtc-panel">
      {
        <div className="dtc-head">
          <div>
            <h2 className="dtc-title">{t('panel.title')}</h2>
            <p className="dtc-subtitle">{t('panel.subtitle')}</p>
          </div>
          {
            <Toolbar>
              {
                <button type="button" className="dtc-button" onClick={() => setTick((value) => value + 1)}>
                  {t('panel.refresh')}
                </button>
              }
            </Toolbar>
          }
        </div>
      }
      <div className="dtc-filters">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: t('panel.range.today') },
            { value: '3d', label: t('panel.range.3d') },
            { value: '7d', label: t('panel.range.7d') },
            { value: '30d', label: t('panel.range.30d') },
          ]}
        />
        {report !== undefined ? (
          <span className="dtc-meta">{`${t('panel.updated', { time: clockText(report.generatedAt) })} · ${t('panel.retention', { days: report.retentionDays ?? 7 })}`}</span>
        ) : null}
      </div>
      {endpoint.loading && report === undefined ? (
        <p className="dtc-empty">{t('panel.loading')}</p>
      ) : endpoint.error !== undefined ? (
        <p className="dtc-error">{endpoint.error}</p>
      ) : (
        <React.Fragment>
          <div className="dtc-banner">
            <span className="dtc-banner-label">{t('metric.total')}</span>
            <span className="dtc-banner-value">{exactTokens(totals?.total)}</span>
            <span className="dtc-banner-extra">{`${exactTokens(totals?.turns)} ${t('usage.turns')} · ${exactTokens(totals?.sessions)} ${t('usage.sessions')}`}</span>
          </div>
          <KpiRow totals={totals} t={t} />
          <div className="dtc-section-title">{t('settings.dailyChart')}</div>
          <ChartBlock
            kind={prefs.dailyChart}
            points={chartPoints}
            totals={totals}
            metrics={prefs.dailyMetrics}
            columns={columns}
            rows={range === 'today' ? points : buckets}
            showTable={prefs.showTable}
            showHitRate={prefs.showCacheHitRate}
            t={t}
          />
        </React.Fragment>
      )}
    </div>
  )
}

/* ----------------------------------------------------- settings page */
