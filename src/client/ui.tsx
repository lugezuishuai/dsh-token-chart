/**
 * Small shared primitives: KPI cards, the facts list, the toolbar and
 * the segmented control.
 *
 * @module dsh-token-chart/client/ui
 */
import type { Totals, Translate } from './models.ts'

import { React } from './react.ts'

import { compactTokens, exactTokens, percentText } from './format.ts'

export function KpiRow({ totals, t }: { totals?: Totals; t: Translate }) {
  const items: Array<{ key: keyof Totals & string; label: string }> = [
    { key: 'total', label: t('metric.total') },
    { key: 'input', label: t('metric.input') },
    { key: 'output', label: t('metric.output') },
    { key: 'cache', label: t('metric.cache') },
  ]
  return (
    <div className="dtc-kpis">
      {items.map((item) => (
        <div key={item.key} className="dtc-kpi">
          <span className="dtc-kpi-label">{item.label}</span>
          <span className="dtc-kpi-value">{compactTokens(totals?.[item.key])}</span>
          <span className="dtc-kpi-exact">{exactTokens(totals?.[item.key])}</span>
        </div>
      ))}
      <div className="dtc-kpi">
        <span className="dtc-kpi-label">{t('metric.cacheHitRate')}</span>
        <span className="dtc-kpi-value">{percentText(totals?.cacheHitRate)}</span>
        <span className="dtc-kpi-exact">{`${exactTokens(totals?.cacheRead)} / ${exactTokens((totals?.cacheRead ?? 0) + (totals?.cacheWrite ?? 0))}`}</span>
      </div>
    </div>
  )
}

/** The product's own usage accounting, kept as text above the chart. */
export function UsageFacts({ totals, t, extra }: { totals?: Totals; t: Translate; extra?: Array<[string, string]> }) {
  const rows = [
    [t('usage.turns'), exactTokens(totals?.turns)],
    [t('usage.cacheRead'), exactTokens(totals?.cacheRead)],
    [t('usage.cacheWrite'), exactTokens(totals?.cacheWrite)],
    [t('metric.input'), exactTokens(totals?.input)],
    [t('metric.output'), exactTokens(totals?.output)],
    [t('metric.cacheHitRate'), percentText(totals?.cacheHitRate)],
    ...(extra ?? []),
  ]
  return (
    <dl className="dtc-facts">
      {rows.flatMap(([label, value]) => [<dt key={`${label}-dt`}>{label}</dt>, <dd key={`${label}-dd`}>{value}</dd>])}
    </dl>
  )
}

export function Toolbar({ children }: { children?: React.ReactNode }) {
  return <div className="dtc-toolbar">{children}</div>
}

export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (next: string) => void
}) {
  return (
    <div className="dtc-segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={option.value === value ? 'dtc-segment dtc-segment-active' : 'dtc-segment'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------ session drawer body */
