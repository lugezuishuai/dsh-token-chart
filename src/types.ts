/**
 * The contract both halves share: preference shape, usage buckets, and the
 * JSON reports the browser half consumes.
 *
 * The browser half imports the same file, so nothing here may reference Node
 * or DOM globals.
 *
 * @module dsh-token-chart/types
 */

/** Provider-reported usage for one settlement, already normalised. */
export interface Buckets {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** Buckets plus the two derived numbers every surface shows. */
export interface Derived extends Buckets {
  /** `input + cacheRead + cacheWrite` — what the provider bills as prompt. */
  cache: number
  /** billed input + output. */
  total: number
  /** `cacheRead / (input + cacheRead + cacheWrite)`. */
  cacheHitRate: number
}

export type MetricId = 'input' | 'output' | 'cache' | 'total'
export type ChartId = 'bar' | 'line' | 'pie' | 'table' | 'multi-bar' | 'multi-line' | 'bar-line'

/** User-facing preferences, stored on the Host and mirrored in the page. */
export interface Prefs {
  sessionChart: ChartId
  dailyChart: ChartId
  sessionMetrics: MetricId[]
  dailyMetrics: MetricId[]
  showTable: boolean
  showCacheHitRate: boolean
  interceptUsageButton: boolean
}

/** One usage chunk as a provider reports it. */
export interface UsageSample {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens?: number
}

/** One committed session event, structurally narrowed to what the fold reads. */
export interface SessionEvent {
  type?: string
  seq?: number
  time?: number
  data?: {
    turn?: number
    step?: number
    stream?: readonly unknown[]
    usage?: UsageSample
    message?: { source?: { provider?: string; model?: string } }
    [key: string]: unknown
  }
}

/** Per-turn store record: one bucket slot per settled `(step, attempt)`. */
export interface TurnRecord {
  turn: number
  time: number
  lastTime: number
  slots: Map<string, Buckets>
  attempts: Map<number, number>
  totals: Buckets
  routes: string[]
}

/** A turn as the reports expose it (slot bookkeeping stays inside the store). */
export interface TurnRow {
  sessionId: string
  turn: number
  time: number
  lastTime: number
  totals: Buckets
  routes: string[]
}

/** One calendar day of the daily panel. */
export interface DayBucket extends Derived {
  key: string
  label: string
  turns: number
  sessions: number
}

/** One point of the "today" chart: a single turn, in time order. */
export interface Point extends Derived {
  time: number
  label: string
  day: string
  sessionId: string
  turn: number
}

/** Cross-check of our fold against the product's own `tokenUsage` projection. */
export interface CrossCheck {
  source: 'sessionProjection' | 'unavailable'
  total?: number
  matches?: boolean
}

/** `GET /session` payload. */
export interface SessionReport {
  sessionId: string
  turns: Array<Derived & { turn: number; time: number; label: string; routes: string[] }>
  totals: Derived & { turns: number; firstTime: number; lastTime: number; routes: string[] }
  crossCheck: CrossCheck
}

/** `GET /overview` payload. */
export interface OverviewReport {
  range: string
  days: number
  floor: number
  generatedAt: number
  retentionDays: number
  buckets: DayBucket[]
  points: Point[]
  totals: Derived & { turns: number; sessions: number }
}

/** `GET /version` payload. */
export interface VersionReport {
  name: string
  version: string
  registry: string
  status: 'ok' | 'unpublished' | 'error' | 'unknown'
  latest: string | null
  updateAvailable: boolean
  checkedAt: number
  install: { kind: 'registry' | 'local' | 'unknown'; spec: string }
  run: UpdateRun
}

/** State of the one update attempt this Host may be running. */
export interface UpdateRun {
  phase: 'idle' | 'running' | 'done' | 'failed' | 'manual'
  startedAt: number
  finishedAt: number
  message: string
  error: string
}

/** Uniform success/failure envelope of every route. */
export type ApiEnvelope<T> =
  { ok: true; value: T } | { ok: false; error: { code: string; message: string; command?: string } }

/* --------------------------------------------------------- Host services */

/** Logger face a Host plugin may rely on. */
export interface Logger {
  info?: (...args: unknown[]) => void
  warn?: (...args: unknown[]) => void
}

/** `ctx.sessionQuery` — read committed session logs for the backfill. */
export interface SessionQueryLike {
  listSessions: () => Promise<Array<{ header?: { id?: string } }>>
  readSession: (sessionId: string) => Promise<{ events?: SessionEvent[] } | undefined>
}

/** `ctx.sessions` — live Session objects, needed by the projection cross-check. */
export interface SessionsLike {
  get: (sessionId: string) => unknown
}

/** `ctx.sessionProjections` — read the product's own fold for one session. */
export interface SessionProjectionsLike {
  stateOf: (session: unknown, key: string) => { totals?: Record<string, number> } | undefined
}

/** `ctx.pluginManager` — the install path shared with `dsh plugin add`. */
export interface PluginManagerLike {
  installBundle: (spec: string, options?: Record<string, unknown>) => Promise<{ application?: string } | undefined>
}

/** Minimal HTTP request/response faces the routes need. */
export interface HttpRequest {
  method?: string
  url?: string
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>
}
export interface HttpResponse {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

/** Where the Host registers a route. */
export interface WebServerLike {
  register: (route: {
    kind: 'prefix' | 'exact'
    path: string
    handler: (req: HttpRequest, res: HttpResponse) => void | Promise<void>
  }) => () => void
}

/** The Cordis context surface this plugin uses, typed structurally. */
export interface HostContext {
  logger?: Logger
  effect: (callback: () => unknown, description?: string) => unknown
  on: (name: string, callback: (...args: any[]) => void) => () => void
  inject: (deps: string[], callback: (services: Record<string, any>) => unknown) => unknown
  pluginManager?: PluginManagerLike
  webServer?: WebServerLike
}
