/**
 * The settings page: chart pickers, metric pickers, switches, and the
 * plugin identity row with its update action.
 *
 * @module dsh-token-chart/client/settings
 */
import type { Prefs, UpdateRun, VersionReport } from '../types.ts'

import type { Translate } from './models.ts'

import type { ChartId, MetricId } from '../types.ts'

import { React } from './react.ts'

import { apiGet, apiPost, prefsStore, usePrefs } from './api.ts'
import { PanelIcon } from './chrome.tsx'
import { CHART_KINDS, DEFAULT_PREFS, METRIC_IDS } from './contract.ts'
import { fill } from './format.ts'

export function ChartPicker({
  value,
  onChange,
  t,
}: {
  value: ChartId
  onChange: (next: ChartId) => void
  t: Translate
}) {
  return (
    <div className="dtc-picker">
      {CHART_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={kind === value ? 'dtc-chip dtc-chip-active' : 'dtc-chip'}
          aria-pressed={kind === value}
          onClick={() => onChange(kind as ChartId)}
        >
          {t(`chart.${kind}`)}
        </button>
      ))}
    </div>
  )
}

export function MetricPicker({
  value,
  onChange,
  t,
}: {
  value: MetricId[]
  onChange: (next: MetricId[]) => void
  t: Translate
}) {
  return (
    <div className="dtc-picker">
      {METRIC_IDS.map((id) => {
        const active = value.includes(id)
        return (
          <button
            key={id}
            type="button"
            className={active ? 'dtc-chip dtc-chip-active' : 'dtc-chip'}
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((item) => item !== id) : [...value, id])}
          >
            {t(`metric.${id}`)}
          </button>
        )
      })}
    </div>
  )
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="dtc-switch-row">
      <div className="dtc-switch-text">
        <span className="dtc-switch-label">{label}</span>
        {hint !== undefined ? <span className="dtc-switch-hint">{hint}</span> : null}
      </div>
      {
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          className={checked ? 'dtc-switch dtc-switch-on' : 'dtc-switch'}
          onClick={() => onChange(!checked)}
        >
          <span className="dtc-switch-knob" />
        </button>
      }
    </div>
  )
}

/**
 * The plugin's own identity row: icon, title, package name, installed
 * version, and — only when the registry has a newer one — the update
 * action. Mirrors the shape the plugin market uses for its own row.
 */
export function PluginHeader({ t }: { t: Translate }) {
  const [state, setState] = React.useState<{ loading: boolean; value?: VersionReport; error: string }>({
    loading: true,
    value: undefined,
    error: '',
  })
  const [run, setRun] = React.useState<UpdateRun>({
    phase: 'idle',
    startedAt: 0,
    finishedAt: 0,
    message: '',
    error: '',
    target: '',
    code: '',
  })
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let live = true
    apiGet('/version')
      .then((payload) => {
        if (!live) return
        setState({ loading: false, value: payload.value, error: '' })
        if (payload.value?.run !== undefined) setRun(payload.value.run)
      })
      .catch((failure) => {
        if (!live) return
        setState({ loading: false, value: undefined, error: String(failure?.message ?? failure) })
      })
    return () => {
      live = false
    }
  }, [tick])

  // While an install runs, poll until it settles so the row reports it.
  React.useEffect(() => {
    if (run.phase !== 'running') return undefined
    const timer = setTimeout(() => setTick((value) => value + 1), 2500)
    return () => clearTimeout(timer)
  }, [run.phase, tick])

  const version = state.value?.version
  const updateAvailable = state.value?.updateAvailable === true
  /** HMR refuses in-place installs, so the row points at the marketplace instead. */
  const hmr = state.value?.hmr === true
  const updatable = updateAvailable && !hmr
  const status = state.value?.status
  const target = run.target !== '' ? run.target : (state.value?.latest ?? '')
  const note =
    state.error !== ''
      ? state.error
      : run.phase === 'running'
        ? t('settings.update.running')
        : run.phase === 'done'
          ? fill(t('settings.update.done'), { target })
          : run.phase === 'restart'
            ? fill(t('settings.update.restart'), { target })
            : run.phase === 'cancelled'
              ? t('settings.update.cancelled')
              : run.phase === 'failed'
                ? run.code === 'already-installed' || run.code === 'hmr-in-place'
                  ? fill(t('settings.update.hmr'), { target })
                  : fill(t('settings.update.failed'), { error: run.error || run.code || 'unknown' })
                : run.phase === 'manual'
                  ? t('settings.update.local')
                  : state.loading
                    ? t('settings.update.checking')
                    : updateAvailable
                      ? hmr
                        ? fill(t('settings.update.hmr'), { target: state.value?.latest ?? '' })
                        : ''
                      : status === 'unpublished'
                        ? t('settings.update.unpublished')
                        : status === 'ok'
                          ? t('settings.update.upToDate')
                          : ''

  const trigger = async () => {
    try {
      await apiPost('/update', {})
      setRun({
        phase: 'running',
        startedAt: Date.now(),
        finishedAt: 0,
        message: '',
        error: '',
        target: state.value?.latest ?? '',
        code: '',
      })
    } catch (failure) {
      setRun({
        phase: 'failed',
        startedAt: Date.now(),
        finishedAt: Date.now(),
        message: '',
        error: String((failure as Error)?.message ?? failure),
        target: state.value?.latest ?? '',
        code: '',
      })
    } finally {
      setTick((value) => value + 1)
    }
  }

  return (
    <div className="dtc-plugin-head">
      {
        <div className="dtc-plugin-id">
          <span className="dtc-plugin-icon">
            <PanelIcon size={18} />
          </span>
          <h3 className="dtc-title">{t('settings.title')}</h3>
          {version !== undefined ? <span className="dtc-plugin-name">{state.value?.name ?? ''}</span> : null}
          <span className="dtc-plugin-version" data-dtc-version={version ?? ''}>
            {version === undefined ? t('settings.update.checking') : `v${version}`}
          </span>
          {updatable ? (
            <button
              type="button"
              className="dtc-update-button"
              data-dtc-update="available"
              disabled={run.phase === 'running'}
              onClick={() => {
                void trigger()
              }}
            >
              {run.phase === 'running' ? t('settings.update.running') : t('settings.update')}
            </button>
          ) : null}
        </div>
      }
      {note === '' ? null : (
        <span className="dtc-plugin-note" data-dtc-update-note={run.phase}>
          {note}
        </span>
      )}
    </div>
  )
}

export function TokenChartSettings({ t }: { t: Translate }) {
  const prefs = usePrefs()
  const [status, setStatus] = React.useState('idle')
  const [error, setError] = React.useState('')
  const timer = React.useRef<number | null>(null)

  const save = React.useCallback((patch: Partial<Prefs>) => {
    const next = { ...prefsStore.get(), ...patch }
    prefsStore.set(next)
    setStatus('saving')
    if (timer.current !== null) clearTimeout(timer.current as unknown as number)
    timer.current = setTimeout(() => {
      apiPost('/prefs', { patch })
        .then((payload) => {
          prefsStore.set({ ...DEFAULT_PREFS, ...payload.value })
          setStatus('saved')
          setError('')
        })
        .catch((failure) => {
          setStatus('failed')
          setError(String(failure?.message ?? failure))
        })
    }, 260)
  }, [])

  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <div className="dtc-root dtc-settings">
      <PluginHeader t={t} />
      <p className="dtc-subtitle">{t('settings.description')}</p>
      {
        <section className="dtc-card">
          <h4 className="dtc-card-title">{t('settings.sessionChart')}</h4>
          <p className="dtc-card-hint">{t('settings.sessionChartHint')}</p>
          {<ChartPicker value={prefs.sessionChart} onChange={(value) => save({ sessionChart: value })} t={t} />}
          <div className="dtc-field-label">{t('settings.metrics')}</div>
          {<MetricPicker value={prefs.sessionMetrics} onChange={(value) => save({ sessionMetrics: value })} t={t} />}
        </section>
      }
      {
        <section className="dtc-card">
          <h4 className="dtc-card-title">{t('settings.dailyChart')}</h4>
          <p className="dtc-card-hint">{t('settings.dailyChartHint')}</p>
          {<ChartPicker value={prefs.dailyChart} onChange={(value) => save({ dailyChart: value })} t={t} />}
          <div className="dtc-field-label">{t('settings.metrics')}</div>
          {<MetricPicker value={prefs.dailyMetrics} onChange={(value) => save({ dailyMetrics: value })} t={t} />}
        </section>
      }
      {
        <section className="dtc-card">
          {
            <SwitchRow
              label={t('settings.showTable')}
              checked={prefs.showTable}
              onChange={(value) => save({ showTable: value })}
            />
          }
          {
            <SwitchRow
              label={t('settings.showCacheHitRate')}
              hint={t('settings.showCacheHitRateHint')}
              checked={prefs.showCacheHitRate}
              onChange={(value) => save({ showCacheHitRate: value })}
            />
          }
          {
            <SwitchRow
              label={t('settings.interceptUsageButton')}
              hint={t('settings.interceptUsageButtonHint')}
              checked={prefs.interceptUsageButton}
              onChange={(value) => save({ interceptUsageButton: value })}
            />
          }
        </section>
      }
      {
        <div className="dtc-settings-footer">
          <span className={status === 'failed' ? 'dtc-status dtc-status-error' : 'dtc-status'}>
            {status === 'saving'
              ? t('settings.saving')
              : status === 'failed'
                ? fill(t('settings.saveFailed'), { error })
                : status === 'saved'
                  ? t('settings.saved')
                  : ''}
          </span>
          {
            <button
              type="button"
              className="dtc-button"
              onClick={() => {
                const defaults = { ...DEFAULT_PREFS }
                prefsStore.set(defaults)
                apiPost('/prefs', { patch: defaults })
                  .then((payload) => {
                    prefsStore.set({ ...DEFAULT_PREFS, ...payload.value })
                    setStatus('saved')
                  })
                  .catch((failure) => {
                    setStatus('failed')
                    setError(String(failure?.message ?? failure))
                  })
              }}
            >
              {t('settings.reset')}
            </button>
          }
        </div>
      }
    </div>
  )
}

/* --------------------------------------------------------- small bits */
