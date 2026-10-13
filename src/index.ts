/**
 * dsh-token-chart — Host half entry.
 *
 * Collects durable provider-reported token usage per Session and Turn from the
 * committed session-event feed, keeps a rolling 7-day store on disk, and serves
 * the browser half's JSON API over the Harness web server.
 *
 * The fold mirrors `@deepseek-ai/dsh-token-meter`'s `tokenUsage` projection but
 * stores one slot per settled `(step, attempt)`, which is what makes replaying a
 * session log idempotent (see `store.ts`).
 *
 * @module dsh-token-chart
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  API_PREFIX,
  BACKFILL_SESSION_LIMIT,
  PACKAGE_NAME,
  RANGE_DAYS,
  RETENTION_DAYS,
  SAVE_DEBOUNCE_MS,
  UPDATE_CHECK_TTL_MS,
} from './constants.ts'
import { addInto, dayKey, derived, startOfLocalDay, timeLabel, zeroBuckets } from './buckets.ts'
import { DEFAULT_PREFS, normalizePrefs } from './prefs.ts'
import { dataDir, prefsFile, usageFile } from './paths.ts'
import { UsageStore } from './store.ts'
import { compareVersions, fetchLatestVersion, profileRegistry, readOwnManifest } from './update.ts'
import {
  CrossCheck,
  HostContext,
  HttpRequest,
  HttpResponse,
  OverviewReport,
  PluginManagerLike,
  SessionProjectionsLike,
  SessionQueryLike,
  SessionReport,
  SessionsLike,
  UpdateRun,
  VersionReport,
} from './types.ts'

export const name = PACKAGE_NAME

// Kept on the entry so the published surface stays stable for callers and for
// the Host test harness, which exercises the comparison directly.
export { compareVersions, fetchLatestVersion, readOwnManifest } from './update.ts'

function sendJson(res: HttpResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

async function readJsonBody(req: HttpRequest): Promise<unknown> {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 256 * 1024) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  const parsed = JSON.parse(text)
  return parsed !== null && typeof parsed === 'object' ? parsed : {}
}

/* -------------------------------------------------------------------- apply */

/**
 * Mount the collector, the store, and the browser API.
 * @param ctx - the plugin's Cordis context.
 */
export function apply(ctx: HostContext): void {
  const store = new UsageStore()
  let prefs = { ...DEFAULT_PREFS }
  let prefsLoaded = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let saving: Promise<void> | null = null
  /** Everything the API needs from optional services. */
  const deps: {
    query: SessionQueryLike | undefined
    sessions: SessionsLike | undefined
    projections: SessionProjectionsLike | undefined
  } = { query: undefined, sessions: undefined, projections: undefined }
  /** Plugin-manager face, present only when the profile ships that plugin. */
  let manager: PluginManagerLike | undefined

  const log = (...args: unknown[]): void => {
    try {
      ctx.logger?.info?.(...args)
    } catch {
      /* a logger that refuses is not a failure of this plugin */
    }
  }
  const warn = (...args: unknown[]): void => {
    try {
      ctx.logger?.warn?.(...args)
    } catch {
      /* ignore */
    }
  }

  const persist = async (): Promise<void> => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (saving !== null) return saving
    saving = (async () => {
      try {
        store.prune()
        await mkdir(dataDir(), { recursive: true })
        const target = usageFile()
        const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
        await writeFile(temporary, JSON.stringify(store.toJSON()), 'utf8')
        await rename(temporary, target)
      } catch (error) {
        warn('dsh-token-chart: could not persist usage store (%s)', String(error))
      } finally {
        saving = null
      }
    })()
    return saving
  }

  const scheduleSave = () => {
    if (saveTimer !== null) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persist()
    }, SAVE_DEBOUNCE_MS)
  }

  /* ---- load state ------------------------------------------------------ */

  /**
   * Resolves once the persisted document has been read.
   *
   * Every route that touches preferences waits on it: reading and writing the
   * file is asynchronous, so without this a request arriving right after a
   * reload would answer with defaults and could overwrite the user's choices.
   */
  let markPrefsReady: () => void = () => {}
  const prefsReady = new Promise<void>((resolve) => {
    markPrefsReady = resolve
  })

  ctx.effect(() => {
    let cancelled = false
    void (async () => {
      try {
        const raw = await readFile(usageFile(), 'utf8')
        if (cancelled) return
        const accepted = store.load(JSON.parse(raw))
        if (!accepted) log('dsh-token-chart: existing store is from another schema — rebuilding from session logs')
      } catch {
        /* first run, or a store we refuse to trust: start empty */
      }
      try {
        const raw = await readFile(prefsFile(), 'utf8')
        if (cancelled) return
        prefs = normalizePrefs(JSON.parse(raw))
      } catch {
        /* defaults */
      }
      prefsLoaded = true
      markPrefsReady()
      log('dsh-token-chart: store ready (%d session(s))', store.sessions.size)
    })()
    return () => {
      cancelled = true
    }
  }, 'dsh-token-chart: load store')

  /* ---- live feed ------------------------------------------------------- */

  ctx.effect(
    () =>
      ctx.on('session/event', (session, event) => {
        try {
          const sessionId = session?.id
          if (typeof sessionId !== 'string' || sessionId === '') return
          if (store.apply(sessionId, event)) scheduleSave()
        } catch (error) {
          warn('dsh-token-chart: usage fold failed (%s)', String(error))
        }
      }),
    'dsh-token-chart: session usage feed',
  )

  /* ---- optional services ---------------------------------------------- */

  ctx.inject(['sessionQuery'], (injected) => {
    deps.query = injected.sessionQuery
    void backfill()
    return () => {
      deps.query = undefined
    }
  })

  // Used only to cross-check our fold against the product's own projection.
  ctx.inject(['sessions', 'sessionProjections'], (injected) => {
    deps.sessions = injected.sessions
    deps.projections = injected.sessionProjections
    return () => {
      deps.sessions = undefined
      deps.projections = undefined
    }
  })

  // The plugin manager is only needed by the "更新版本" action; a profile
  // without it simply never offers an automatic update.
  ctx.inject(['pluginManager'], (injected) => {
    manager = injected.pluginManager
    return () => {
      manager = undefined
    }
  })

  /**
   * Seed the store from session logs written before this plugin was mounted,
   * so "today" is complete on first sight. Bounded to the newest sessions and
   * run in the background: a slow corpus never delays activation.
   */
  async function backfill(): Promise<void> {
    const query = deps.query
    if (query === undefined) return
    try {
      const records = await query.listSessions()
      const floor = startOfLocalDay(RETENTION_DAYS - 1)
      let scanned = 0
      let seeded = 0
      for (const record of records) {
        if (scanned >= BACKFILL_SESSION_LIMIT) break
        const id = record?.header?.id
        if (typeof id !== 'string' || id === '') continue
        scanned += 1
        try {
          const snapshot = await query.readSession(id)
          const events = Array.isArray(snapshot?.events) ? snapshot.events : []
          let newest = 0
          let touched = false
          for (const event of events) {
            if (typeof event?.time === 'number' && event.time > newest) newest = event.time
            if (store.apply(id, event)) touched = true
          }
          if (touched && newest >= floor) seeded += 1
        } catch {
          /* one unreadable log must not stop the sweep */
        }
      }
      const pruned = store.prune()
      if (seeded > 0 || pruned) await persist()
      log('dsh-token-chart: backfilled %d session(s) from %d scanned', seeded, scanned)
    } catch (error) {
      warn('dsh-token-chart: backfill skipped (%s)', String(error))
    }
  }

  /* ---- cross-session reads -------------------------------------------- */

  /**
   * Read one session's turns, falling back to its durable log when the session
   * predates this plugin's mount.
   * @param sessionId - the session to describe.
   */
  async function sessionReport(sessionId: string): Promise<SessionReport> {
    let turnRows = store.sessionTurns(sessionId)
    if (turnRows.length === 0 && deps.query !== undefined) {
      try {
        const snapshot = await deps.query.readSession(sessionId)
        const events = Array.isArray(snapshot?.events) ? snapshot.events : []
        for (const event of events) store.apply(sessionId, event)
        store.prune()
        turnRows = store.sessionTurns(sessionId)
        if (turnRows.length > 0) scheduleSave()
      } catch (error) {
        warn('dsh-token-chart: session read failed (%s)', String(error))
      }
    }
    // The session total is one fold over every settled (turn, step, attempt) of
    // the session — deliberately not the sum of the per-turn rows below, so a
    // presentation-level change can never redefine what the total means.
    const totals = store.sessionTotals(sessionId)
    let first = 0
    let last = 0
    const routes = new Set<string>()
    const turns = turnRows.map((row) => {
      if (first === 0 || row.time < first) first = row.time
      if (row.time > last) last = row.time
      for (const route of row.routes) routes.add(route)
      return {
        turn: row.turn,
        time: row.time,
        label: timeLabel(row.time),
        routes: row.routes,
        ...derived(row.totals),
      }
    })
    const sessionTotal = derived(totals, {
      turns: turns.length,
      firstTime: first,
      lastTime: last,
      routes: [...routes],
    })
    return {
      sessionId,
      turns,
      totals: sessionTotal,
      crossCheck: productCrossCheck(sessionId, sessionTotal.total),
    }
  }

  /**
   * Compare our total with the product's own `tokenUsage` projection.
   *
   * The two are independent folds of the same log, so a mismatch means one of
   * them is wrong — worth surfacing instead of hiding. Only live sessions have a
   * projection to read; historical ones report `unavailable`.
   * @param sessionId - the session being reported.
   * @param total - our own total for it.
   */
  function productCrossCheck(sessionId: string, total: number): CrossCheck {
    const projections = deps.projections
    const sessions = deps.sessions
    if (projections === undefined || sessions === undefined) return { source: 'unavailable' }
    try {
      const session = sessions.get(sessionId)
      if (session === undefined) return { source: 'unavailable' }
      const state = projections.stateOf(session, 'tokenUsage')
      if (state === undefined || state.totals === undefined) return { source: 'unavailable' }
      const { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = state.totals
      const productTotal = uncachedInputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
      return { source: 'sessionProjection', total: productTotal, matches: productTotal === total }
    } catch (error) {
      warn('dsh-token-chart: projection cross-check skipped (%s)', String(error))
      return { source: 'unavailable' }
    }
  }

  /**
   * One report over a calendar window.
   * @param range - `today`, `3d`, `7d`, or `30d` (the retention window itself).
   */
  function overviewReport(range: string): OverviewReport {
    const days = RANGE_DAYS[range] ?? 1
    const floor = startOfLocalDay(days - 1)
    const rows = store.turns().filter((row) => row.lastTime >= floor)
    const totals = zeroBuckets()
    const perDay = new Map()
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const key = dayKey(startOfLocalDay(offset))
      perDay.set(key, { key, buckets: zeroBuckets(), turns: 0, sessions: new Set() })
    }
    const points = []
    const sessions = new Set<string>()
    for (const row of rows) {
      addInto(totals, row.totals)
      sessions.add(row.sessionId)
      const key = dayKey(row.time)
      const bucket = perDay.get(key)
      if (bucket !== undefined) {
        addInto(bucket.buckets, row.totals)
        bucket.turns += 1
        bucket.sessions.add(row.sessionId)
      }
      points.push({
        time: row.time,
        label: days === 1 ? timeLabel(row.time) : key.slice(5),
        day: key,
        sessionId: row.sessionId,
        turn: row.turn,
        ...derived(row.totals),
      })
    }
    return {
      range,
      days,
      floor,
      generatedAt: Date.now(),
      retentionDays: RETENTION_DAYS,
      totals: derived(totals, { turns: rows.length, sessions: sessions.size }),
      buckets: [...perDay.values()].map((entry) => ({
        key: entry.key,
        label: entry.key.slice(5),
        turns: entry.turns,
        sessions: entry.sessions.size,
        ...derived(entry.buckets),
      })),
      points,
    }
  }

  /* ---- prefs ----------------------------------------------------------- */

  async function savePrefs(): Promise<void> {
    try {
      await mkdir(dataDir(), { recursive: true })
      const target = prefsFile()
      const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
      await writeFile(temporary, JSON.stringify(prefs, null, 2), 'utf8')
      await rename(temporary, target)
    } catch (error) {
      warn('dsh-token-chart: could not persist preferences (%s)', String(error))
    }
  }

  /* ---- version and update check ---------------------------------------- */

  /** Cached registry answer plus the state of a running update. */
  const updateCheck: {
    at: number
    latest: string | undefined
    status: VersionReport['status']
    registry: string
  } = { at: 0, latest: undefined, status: 'unknown', registry: '' }
  const updateRun: UpdateRun = { phase: 'idle', startedAt: 0, finishedAt: 0, message: '', error: '' }
  let manifest = { name, version: '0.0.0' }

  void (async () => {
    try {
      manifest = await readOwnManifest()
    } catch (error) {
      warn('dsh-token-chart: could not read own manifest (%s)', String(error))
    }
  })()

  /**
   * Profile directories worth probing, nearest first.
   *
   * `DSH_PROFILE_DIR` is exported into a profile's *shell calls*, not into the
   * host process, so the desktop app never has it; walking up from this module
   * finds the same directory anyway. The walk also covers pnpm's nested layout,
   * where the package sits under
   * `node_modules/.pnpm/<name>@<version>/node_modules/<name>`.
   */
  function profileDirCandidates(): string[] {
    const list: string[] = []
    const configured = process.env.DSH_PROFILE_DIR
    if (typeof configured === 'string' && configured.trim() !== '') list.push(configured.trim())
    try {
      let dir = path.dirname(fileURLToPath(import.meta.url))
      for (let depth = 0; depth < 8; depth += 1) {
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
        list.push(dir)
      }
    } catch {
      /* the probe below degrades to `unknown` */
    }
    return list
  }

  /**
   * How this profile installed the plugin. Only a registry install can update
   * itself: a `link:`/`file:` dependency and an unmounted checkout (the row is
   * mounted from a patch layer, which is how this plugin usually runs) must be
   * updated where they are developed.
   *
   * The profile is the nearest ancestor manifest that declares this package as a
   * dependency — that holds for a registry install and for a linked checkout
   * alike, and it needs no environment variable.
   */
  function installKind(): VersionReport['install'] {
    for (const dir of profileDirCandidates()) {
      try {
        const profile = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
        const spec = String(profile?.dependencies?.[manifest.name] ?? '')
        if (spec === '') continue
        if (spec.startsWith('link:') || spec.startsWith('file:')) return { kind: 'local', spec }
        return { kind: 'registry', spec }
      } catch {
        /* try the next candidate */
      }
    }
    // No profile dependency: distinguish a checkout from an unknown install.
    try {
      const own = fileURLToPath(import.meta.url)
      return own.includes(`${path.sep}node_modules${path.sep}`)
        ? { kind: 'unknown', spec: '' }
        : { kind: 'local', spec: own }
    } catch {
      return { kind: 'unknown', spec: '' }
    }
  }

  /** Refresh the registry answer at most once per TTL. */
  async function checkForUpdate(force = false): Promise<typeof updateCheck> {
    const registry = profileRegistry()
    if (!force && updateCheck.at !== 0 && Date.now() - updateCheck.at < UPDATE_CHECK_TTL_MS) return updateCheck
    updateCheck.at = Date.now()
    updateCheck.registry = registry
    try {
      const latest = await fetchLatestVersion(manifest.name, registry)
      updateCheck.latest = latest
      updateCheck.status = latest === undefined ? 'unpublished' : 'ok'
    } catch (error) {
      updateCheck.latest = undefined
      updateCheck.status = 'error'
      warn('dsh-token-chart: update check failed (%s)', String(error))
    }
    return updateCheck
  }

  function versionReport(): VersionReport {
    const latest = updateCheck.latest
    return {
      name: manifest.name,
      version: manifest.version,
      registry: updateCheck.registry || profileRegistry(),
      status: updateCheck.status,
      latest: latest ?? null,
      updateAvailable: latest !== undefined && compareVersions(manifest.version, latest) < 0,
      checkedAt: updateCheck.at,
      install: installKind(),
      run: updateRun,
    }
  }

  /* ---- browser API ----------------------------------------------------- */

  /** Query parameters of one request (the URL's own search params). */
  type Params = URLSearchParams

  /** Every response goes through the shared `{ ok, value }` envelope. */
  const routes: Record<string, (params: Params, body?: unknown) => unknown> = {
    'GET /health': () => ({
      ok: true,
      package: name,
      retentionDays: RETENTION_DAYS,
      sessions: store.sessions.size,
      prefsLoaded,
      backfill: deps.query !== undefined,
    }),
    'GET /prefs': async () => {
      await prefsReady
      return { ok: true, value: prefs, defaults: DEFAULT_PREFS }
    },
    'GET /overview': (params: Params) => ({ ok: true, value: overviewReport(params.get('range') ?? 'today') }),
    'GET /session': async (params: Params) => {
      const sessionId = params.get('sessionId') ?? params.get('id') ?? ''
      if (sessionId === '') {
        return { ok: false, error: { code: 'bad-request', message: 'sessionId is required' } }
      }
      return { ok: true, value: await sessionReport(sessionId) }
    },
    'POST /prefs': async (_params: Params, body?: unknown) => {
      await prefsReady
      const patch = (body as { patch?: Record<string, unknown> } | undefined)?.patch ?? {}
      prefs = normalizePrefs({ ...prefs, ...patch })
      await savePrefs()
      return { ok: true, value: prefs }
    },
    'POST /reset': async () => {
      store.sessions.clear()
      await persist()
      return { ok: true }
    },
    'GET /version': async (params: Params) => {
      await checkForUpdate(params.get('refresh') === '1')
      return { ok: true, value: versionReport() }
    },
    'POST /update': async () => {
      await checkForUpdate()
      const report = versionReport()
      if (!report.updateAvailable) {
        return { ok: false, error: { code: 'up-to-date', message: `${report.name} is already at ${report.version}` } }
      }
      if (report.install.kind !== 'registry') {
        updateRun.phase = 'manual'
        updateRun.message = `installed from ${report.install.spec || 'a local path'}; update it where it is developed`
        return {
          ok: false,
          error: {
            code: 'local-install',
            message: updateRun.message,
            command: `dsh plugin --profile ${process.env.DSH_PROFILE ?? '<profile>'} add ${report.name}@${report.latest}`,
          },
        }
      }
      if (manager === undefined) {
        return {
          ok: false,
          error: { code: 'no-plugin-manager', message: 'the plugin manager is not available in this profile' },
        }
      }
      if (updateRun.phase === 'running') {
        return { ok: false, error: { code: 'already-running', message: 'an update is already running' } }
      }
      updateRun.phase = 'running'
      updateRun.startedAt = Date.now()
      updateRun.finishedAt = 0
      updateRun.message = `installing ${report.name}@${report.latest}`
      updateRun.error = ''
      void Promise.resolve()
        .then(() => manager?.installBundle(`${report.name}@${report.latest}`))
        .then((result) => {
          updateRun.phase = 'done'
          updateRun.finishedAt = Date.now()
          updateRun.message = `application: ${String(result?.application ?? 'unknown')}`
          updateCheck.at = 0
        })
        .catch((error) => {
          updateRun.phase = 'failed'
          updateRun.finishedAt = Date.now()
          updateRun.error = String(error?.message ?? error)
          updateRun.message = 'update failed'
        })
      return { ok: true, value: { started: true, target: `${report.name}@${report.latest}` } }
    },
  }

  /* ---- stylesheet ------------------------------------------------------ */

  /**
   * Serve the compiled stylesheet as a real file.
   *
   * The browser half links it instead of carrying CSS text, so a style change
   * never invalidates the client bundle. The path is resolved next to this
   * module (`lib/index.js` → `lib/token-chart.css`), with `ETag`-based
   * revalidation so a rebuild is picked up without hard-coding a version.
   */
  async function readStylesheet() {
    try {
      return await readFile(new URL('./token-chart.css', import.meta.url), 'utf8')
    } catch (error) {
      warn('dsh-token-chart: stylesheet missing (%s)', String(error))
      return undefined
    }
  }

  ctx.inject(['webServer'], (injected) => {
    return injected.webServer.register({
      kind: 'exact',
      path: '/token-chart/assets/token-chart.css',
      handler: async (_req: HttpRequest, res: HttpResponse) => {
        const css = await readStylesheet()
        if (css === undefined) {
          sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'stylesheet is not built' } })
          return
        }
        const etag = `"${createHash('sha1').update(css).digest('hex').slice(0, 12)}"`
        res.statusCode = 200
        res.setHeader('content-type', 'text/css; charset=utf-8')
        res.setHeader('cache-control', 'no-cache')
        res.setHeader('etag', etag)
        res.end(css)
      },
    })
  })

  ctx.inject(['webServer'], (injected) => {
    const webServer = injected.webServer
    return webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req: HttpRequest, res: HttpResponse) => {
        const method = (req.method ?? 'GET').toUpperCase()
        let pathname = '/'
        try {
          pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
        } catch {
          sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'malformed url' } })
          return
        }
        const suffix = pathname.startsWith(API_PREFIX) ? pathname.slice(API_PREFIX.length) : pathname
        const search = new URL(req.url ?? '/', 'http://dsh.internal').searchParams
        const resolve = (m: string) => routes[`${m} ${suffix}`] ?? routes[`${m} ${suffix}/`]
        const handler = resolve(method) ?? (method === 'HEAD' ? resolve('GET') : undefined)
        if (handler === undefined) {
          sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `no route for ${method} ${suffix}` } })
          return
        }
        try {
          const body = method === 'POST' ? await readJsonBody(req) : undefined
          const payload = (await handler(search, body)) as { ok?: boolean }
          sendJson(res, payload.ok === false ? 400 : 200, payload)
        } catch (error) {
          warn('dsh-token-chart: api failure (%s)', String(error))
          sendJson(res, 500, { ok: false, error: { code: 'internal', message: String(error) } })
        }
      },
    })
  })

  ctx.effect(
    () => () => {
      void persist()
    },
    'dsh-token-chart: final flush',
  )

  log('dsh-token-chart: host half active')
}
