/**
 * The session drawer body shown in the right sidebar.
 *
 * @module dsh-token-chart/client/drawer
 */
import type { SessionReport } from '../types.ts'

import type { ChartPoint, TableRow } from './models.ts'

import { useEndpoint } from './api.ts'

import type { ColumnSpec, Translate } from './models.ts'

import { React } from './react.ts'

import { usePrefs } from './api.ts'
import { clockText, exactTokens, fill, percentText } from './format.ts'
import { ChartBlock } from './series.tsx'
import { KpiRow, UsageFacts } from './ui.tsx'

export function SessionUsageBody({ sessionId, t }: { sessionId: string; t: Translate }) {
  const prefs = usePrefs()
  const [tick, setTick] = React.useState(0)
  const endpoint = useEndpoint(`/session?sessionId=${encodeURIComponent(sessionId ?? '')}`, tick)
  const report = endpoint.value as SessionReport | undefined
  const totals = report?.totals
  const turns: TableRow[] = Array.isArray(report?.turns) ? (report.turns as TableRow[]) : []
  const points: ChartPoint[] = turns.map((turn: TableRow) => ({
    label: `#${turn.turn}`,
    values: {
      input: turn.input,
      output: turn.output,
      cache: turn.cache,
      total: turn.total,
      cacheHitRate: turn.cacheHitRate,
    },
  }))
  const columns: ColumnSpec[] = [
    { key: 'turn', label: t('table.turn') },
    { key: 'time', label: t('table.time'), render: (row) => clockText(row.time) },
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
  const routes: Array<[string, string]> =
    Array.isArray(totals?.routes) && totals.routes.length > 0 ? [[t('usage.route'), totals.routes.join(', ')]] : []

  return (
    <div className="dtc-root dtc-drawer">
      {
        <div className="dtc-head">
          <div>
            <h3 className="dtc-title">{t('usage.title')}</h3>
            <p className="dtc-subtitle">{`${t('usage.session')} · ${turns.length} ${t('usage.turns')}`}</p>
          </div>
          {
            <button
              type="button"
              className="dtc-button"
              onClick={() => setTick((value) => value + 1)}
              title={t('usage.refresh')}
            >
              {t('panel.refresh')}
            </button>
          }
        </div>
      }
      {endpoint.loading && report === undefined ? (
        <p className="dtc-empty">{t('panel.loading')}</p>
      ) : endpoint.error !== undefined ? (
        <p className="dtc-error">{endpoint.error}</p>
      ) : turns.length === 0 ? (
        <p className="dtc-empty">{t('usage.emptySession')}</p>
      ) : (
        <React.Fragment>
          <div className="dtc-banner">
            <span className="dtc-banner-label">{t('metric.total')}</span>
            <span className="dtc-banner-value">{exactTokens(totals?.total)}</span>
          </div>
          <UsageFacts totals={totals} t={t} extra={routes} />
          {report?.crossCheck?.matches === false ? (
            <p className="dtc-warn" data-dtc-crosscheck="mismatch">
              {fill(t('usage.crossCheckFailed'), { product: exactTokens(report.crossCheck.total) })}
            </p>
          ) : null}
          <p className="dtc-footnote">{t('usage.accounting')}</p>
          <KpiRow totals={totals} t={t} />
          <div className="dtc-section-title">{t('settings.sessionChart')}</div>
          <ChartBlock
            kind={prefs.sessionChart}
            points={points}
            totals={totals}
            metrics={prefs.sessionMetrics}
            columns={columns}
            rows={turns}
            showTable={prefs.showTable}
            showHitRate={prefs.showCacheHitRate}
            t={t}
          />
        </React.Fragment>
      )}
    </div>
  )
}

/* -------------------------------------------------- daily usage panel */
