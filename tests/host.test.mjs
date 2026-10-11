/**
 * Standalone harness for the dsh-token-chart Host half: mounts the plugin on a
 * fake Cordis context, feeds synthetic session events, and calls the real HTTP
 * route handler to check the JSON the browser half will receive.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { apply, compareVersions, fetchLatestVersion } from '../lib/index.js'
import { expectAll } from './support/expect-all.mjs'

/**
 * Mount the plugin on an isolated fake context and an isolated DSH_HOME.
 *
 * Every mount gets its own store directory: the fold is idempotent now, and the
 * isolation is what lets the same log be folded twice and compared.
 * @param homeDir - the DSH_HOME this mount reads and writes.
 */
function request(routes, path, { method = 'GET', body, search = '', raw = false, kind = 'prefix' } = {}) {
  const route = routes.find((candidate) => candidate.kind === kind)
  if (route === undefined) throw new Error(`no ${kind} route for ${path}`)
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 0,
      headers: {},
      setHeader: (key, value) => {
        response.headers[key] = value
      },
      end: (text) => {
        if (raw) {
          resolve({ status: response.statusCode, headers: response.headers, text })
          return
        }
        try {
          resolve({ status: response.statusCode, body: JSON.parse(text) })
        } catch (error) {
          reject(error)
        }
      },
    }
    const request = {
      method,
      url: raw ? path : `/token-chart/api${path}${search}`,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body))
      },
    }
    Promise.resolve(route.handler(request, response)).catch(reject)
  })
}

async function mount(homeDir) {
  process.env.DSH_HOME = homeDir
  const routes = []
  const listeners = new Map()
  const injected = {
    sessionQuery: undefined,
    sessions: undefined,
    sessionProjections: undefined,
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
  }
  const ctx = {
    logger: { info: (...args) => console.log('[info]', ...args), warn: (...args) => console.warn('[warn]', ...args) },
    effect: (fn) => fn(),
    on: (name, callback) => {
      listeners.set(name, callback)
      return () => listeners.delete(name)
    },
    inject: (deps, callback) => {
      const face = {}
      for (const dep of deps) face[dep] = injected[dep]
      face.get = (name) => injected[name]
      return callback(face)
    },
  }
  apply(ctx)
  return {
    routes,
    emit: (sessionId, event) => listeners.get('session/event')({ id: sessionId }, event),
    call: (path, options) => request(routes, path, options),
  }
}

it('folds usage, persists it and serves the API', async () => {
  const main = await mount(await mkdtemp(join(tmpdir(), 'dtc-main-')))
  console.log(
    'routes:',
    main.routes.map((route) => `${route.kind} ${route.path}`),
  )
  const emit = main.emit
  const call = (path, options) => main.call(path, options)

  const HOUR = 3600 * 1000
  const now = Date.now()

  // Fixtures are anchored to local noon rather than to "now": offsets like
  // `now - 4h` silently move to yesterday when the suite runs after 20:00, which
  // used to make the day-bucket assertions fail depending on the clock.
  const createdAt = new Date()
  createdAt.setHours(12, 0, 0, 0)
  const noonToday = createdAt.getTime()
  const noonYesterday = noonToday - 24 * HOUR

  /** One durable assistant settlement carrying a provider usage chunk. */
  function assistantMessage(turn, step, usage, time, model = 'deepseek-flash') {
    return {
      type: 'assistant/message',
      seq: 1,
      time,
      data: {
        turn,
        step,
        stream: [
          { type: 'chunk', chunk: { type: 'text', text: 'hello' } },
          { type: 'chunk', chunk: { type: 'usage', usage } },
        ],
        message: {
          id: `m${turn}-${step}`,
          role: 'assistant',
          content: [],
          source: { kind: 'model', provider: 'deepseek', model },
        },
      },
    }
  }

  /* Session A: three turns today, with a same-step resample and a retried step. */
  emit(
    'sess-A',
    assistantMessage(
      1,
      1,
      { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 0, totalTokens: 1020 },
      noonToday,
    ),
  )
  // A resample of the same (turn 1, step 1) with the same numbers must not double count.
  emit(
    'sess-A',
    assistantMessage(
      1,
      1,
      { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 0, totalTokens: 1020 },
      noonToday + 1000,
    ),
  )
  // A failed attempt settles, a retry closes the replacement slot, and the
  // retried attempt therefore adds to the same turn instead of replacing it.
  emit(
    'sess-A',
    assistantMessage(
      2,
      1,
      { inputTokens: 50, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 60 },
      noonToday + 5 * 60 * 1000,
    ),
  )
  emit('sess-A', { type: 'llm/retry-started', seq: 2, time: noonToday + 6 * 60 * 1000, data: { turn: 2, step: 1 } })
  emit(
    'sess-A',
    assistantMessage(
      2,
      1,
      { inputTokens: 200, outputTokens: 30, cacheReadTokens: 1000, cacheWriteTokens: 100, totalTokens: 1330 },
      noonToday + 7 * 60 * 1000,
    ),
  )
  // Turn 3 lives yesterday: outside "today", inside "last 3 days".
  emit(
    'sess-A',
    assistantMessage(
      3,
      1,
      { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 15 },
      noonYesterday,
    ),
  )

  /* Session B: an event with no usage at all must be ignored. */
  emit('sess-B', {
    type: 'tool/result',
    seq: 3,
    time: noonToday + 8 * 60 * 1000,
    data: { message: { id: 't1', role: 'tool', content: [] } },
  })

  const checks = []
  function check(name, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected)
    checks.push({ name, pass, actual, expected })
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
    )
  }

  const health = await call('/health')
  check('health ok', health.body.ok, true)

  const session = await call('/session', { search: '?sessionId=sess-A' })
  const totals = session.body.value.totals
  check('session turn count', totals.turns, 3)
  // 1020 (turn 1, deduped) + 60 + 1330 (turn 2: retry adds both attempts) + 15 (turn 3)
  check('session total tokens', totals.total, 1020 + 60 + 1330 + 15)
  check('session input', totals.input, 100 + 50 + 200 + 10)
  check('session cacheRead', totals.cacheRead, 900 + 0 + 1000 + 0)
  check('session cacheWrite', totals.cacheWrite, 0 + 0 + 100 + 0)
  check(
    'session turns are ordered',
    session.body.value.turns.map((turn) => turn.turn),
    [1, 2, 3],
  )
  check('session routes', totals.routes, ['deepseek/deepseek-flash'])

  const today = await call('/overview', { search: '?range=today' })
  // Turn 3 is yesterday, so today holds turns 1 and 2 only.
  check('today total', today.body.value.totals.total, 1020 + 60 + 1330)
  check('today points', today.body.value.points.length, 2)
  check('today sessions', today.body.value.totals.sessions, 1)

  const threeDays = await call('/overview', { search: '?range=3d' })
  check('3d total', threeDays.body.value.totals.total, 1020 + 60 + 1330 + 15)
  check('3d buckets', threeDays.body.value.buckets.length, 3)
  check('3d last bucket total', threeDays.body.value.buckets.at(-1).total, 1020 + 60 + 1330)
  check('3d yesterday bucket total', threeDays.body.value.buckets.at(-2).total, 15)

  const prefs = await call('/prefs')
  check('default session chart', prefs.body.value.sessionChart, 'multi-bar')

  const updated = await call('/prefs', {
    method: 'POST',
    body: { patch: { sessionChart: 'bar-line', sessionMetrics: ['input', 'output'] } },
  })
  check('updated session chart', updated.body.value.sessionChart, 'bar-line')
  check('updated metrics', updated.body.value.sessionMetrics, ['input', 'output'])

  const reread = await call('/prefs')
  check('persisted session chart', reread.body.value.sessionChart, 'bar-line')

  const invalid = await call('/prefs', {
    method: 'POST',
    body: { patch: { sessionChart: 'nope', sessionMetrics: [] } },
  })
  check('invalid chart falls back', invalid.body.value.sessionChart, 'multi-bar')
  check('empty metrics fall back', invalid.body.value.sessionMetrics.length, 4)

  /* --------------------------------- 折叠幂等性（本轮回归的核心 bug） ----- */

  /* 同一份事件序列折叠两次、打乱顺序折叠，结果必须完全一致：
   旧实现只保留一个 last 槽位，重放会把每一步再加一遍，实测虚高 4.7 倍。 */
  {
    // Ascending seq, exactly as a session log stores them: step 3 settles once,
    // a retry opens a new slot, then the retried attempt settles again.
    const buildEvents = () => {
      const now2 = Date.now()
      const withSeq = (seq, event) => ({ ...event, seq })
      return [
        withSeq(
          1,
          assistantMessage(
            1,
            1,
            { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 0, totalTokens: 1020 },
            now2 - 5000,
          ),
        ),
        withSeq(
          2,
          assistantMessage(
            1,
            2,
            { inputTokens: 50, outputTokens: 10, cacheReadTokens: 1800, cacheWriteTokens: 0, totalTokens: 1860 },
            now2 - 4000,
          ),
        ),
        withSeq(
          3,
          assistantMessage(
            1,
            3,
            { inputTokens: 30, outputTokens: 5, cacheReadTokens: 500, cacheWriteTokens: 0, totalTokens: 535 },
            now2 - 3000,
          ),
        ),
        withSeq(4, { type: 'llm/retry-started', time: now2 - 2800, data: { turn: 1, step: 3 } }),
        withSeq(
          5,
          assistantMessage(
            1,
            3,
            { inputTokens: 70, outputTokens: 15, cacheReadTokens: 900, cacheWriteTokens: 0, totalTokens: 985 },
            now2 - 2500,
          ),
        ),
        withSeq(
          6,
          assistantMessage(
            2,
            1,
            { inputTokens: 10, outputTokens: 4, cacheReadTokens: 90, cacheWriteTokens: 0, totalTokens: 104 },
            now2 - 2000,
          ),
        ),
      ]
    }

    const totalOf = async (events) => {
      const isolated = await mount(await mkdtemp(join(tmpdir(), 'dtc-idem-')))
      for (const event of events) isolated.emit('session-a', event)
      const answer = await isolated.call('/session', { search: '?sessionId=session-a' })
      return { total: answer.body.value.totals.total, detail: answer.body.value }
    }

    const events = buildEvents()
    const once = await totalOf(events)
    const twice = await totalOf([...events, ...events])
    // The production shape of the bug: a live prefix is already folded, then the
    // activation-time backfill replays the whole log on top of it.
    const prefixThenFull = await totalOf([...events.slice(0, 3), ...events])

    check('folding the same log twice is idempotent', twice.total, once.total)
    check('a backfill replay over a live prefix does not inflate', prefixThenFull.total, once.total)
    check(
      'per-turn rows still sum to the session total',
      once.detail.turns.reduce((sum, turn) => sum + turn.total, 0),
      once.total,
    )
    // turn 1: 1020 + 1860 + (535 + 985) — the retry opened a new slot for step 3,
    // so both attempts count; turn 2: 104.
    check('retries still add', once.detail.turns[0].total, 1020 + 1860 + 535 + 985)
    check('session total folds every slot', once.total, 1020 + 1860 + 535 + 985 + 104)
  }

  /* --------------------------------- 配置在插件重载 / 应用重启后仍然生效 --- */

  /* 插件的 apply() 每次加载都会读同一份 prefs.json：这里在同一 DSH_HOME 上
   重新挂载一次，验证用户写在配置里的图表形式不会被默认值顶掉。 */
  {
    const patch = { sessionChart: 'multi-bar', dailyChart: 'multi-line', showTable: false, showCacheHitRate: false }
    const saved = await call('/prefs', { method: 'POST', body: { patch } })
    check('prefs accept a user patch', saved.body.value?.dailyChart, 'multi-line')

    const reloaded = await mount(process.env.DSH_HOME)
    const after = await reloaded.call('/prefs')
    check('chart form survives a plugin reload', after.body.value?.sessionChart, 'multi-bar')
    check(
      'every stored preference survives a reload',
      JSON.stringify({
        dailyChart: after.body.value?.dailyChart,
        showTable: after.body.value?.showTable,
        showCacheHitRate: after.body.value?.showCacheHitRate,
      }),
      JSON.stringify({ dailyChart: 'multi-line', showTable: false, showCacheHitRate: false }),
    )
    const defaultsRoute = await call('/prefs')
    check('defaults still describe the shipped values', defaultsRoute.body.defaults?.sessionChart, 'multi-bar')
  }

  /* ------------------------------------------- 样式表由宿主以文件形式下发 --- */

  {
    const css = await request(main.routes, '/token-chart/assets/token-chart.css', { raw: true, kind: 'exact' })
    check('stylesheet route answers', css.status, 200)
    check('stylesheet is served as css', String(css.headers['content-type']), 'text/css; charset=utf-8')
    check('stylesheet revalidates instead of caching hard', String(css.headers['cache-control']), 'no-cache')
    check('stylesheet carries the less layer', /\.dtc-table/.test(css.text), true)
    check('stylesheet carries the tailwind layer', /\.flex\{/.test(css.text), true)
    check('stylesheet keeps utilities in their layer', /@layer utilities/.test(css.text), true)
    check('stylesheet has no tailwind preflight', /@layer base/.test(css.text), false)
  }

  /* ------------------------------------------------- 清单文件的可读性 --- */

  /* The manifest is read by people as much as by the loader: metadata must be
   written as literal text, never as JSON \uXXXX escapes. */
  {
    const manifestText = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    const escapes = manifestText.match(/\\u[0-9a-fA-F]{4}/g) ?? []
    check('manifest has no unicode escapes', escapes.length, 0)
    const manifest = JSON.parse(manifestText)
    check('manifest title is literal chinese', /[\u4e00-\u9fa5]/.test(String(manifest.meta?.title)), true)
    check('manifest description is literal chinese', /[\u4e00-\u9fa5]/.test(String(manifest.meta?.description)), true)
  }

  /* ------------------------------------------- 中文一律以字面量出现 --- */

  /* Non-ASCII text is written literally everywhere: sources, the client bundle
   and the stylesheet. Only vendored library internals may keep escapes (the
   ECharts chunk trims `\uFEFF` inside its own regex), so that artifact is
   checked for CJK escapes only. */
  {
    const escape = /\\u[0-9a-fA-F]{4}/g
    const cjkEscape = /\\u(?:[34][0-9a-fA-F]{3}|[5-9][0-9a-fA-F]{3})/g
    const sources = readdirSync(new URL('../src', import.meta.url), { recursive: true })
      .filter((name) => /\.(ts|tsx|less|css)$/.test(name))
      .map((name) => `src/${name}`)
    check(
      'sources carry no unicode escapes',
      sources.filter((file) => escape.test(readFileSync(file, 'utf8'))).join(','),
      '',
    )
    const bundle = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
    check('client bundle carries no unicode escapes', (bundle.match(escape) ?? []).length, 0)
    check('client bundle shows chinese literally', bundle.includes('缓存读取'), true)
    const css = readFileSync(new URL('../client/token-chart.css', import.meta.url), 'utf8')
    check('stylesheet carries no unicode escapes', (css.match(escape) ?? []).length, 0)
    const chunk = readFileSync(new URL('../client/client.echarts.js', import.meta.url), 'utf8')
    check('chunk carries no chinese escapes', (chunk.match(cjkEscape) ?? []).length, 0)
  }

  /* ------------------------------------------------- 版本比较与更新检查 --- */

  check('semver: patch bump is newer', compareVersions('0.1.0', '0.1.1'), -1)
  check('semver: equal versions tie', compareVersions('1.2.3', '1.2.3'), 0)
  check('semver: release outranks its prerelease', compareVersions('0.2.0-rc.1', '0.2.0'), -1)
  check('semver: prerelease is older than release', compareVersions('0.2.0', '0.2.0-rc.1'), 1)
  check('semver: a missing segment counts as zero', compareVersions('1.2', '1.2.0'), 0)
  check('semver: major dominates', compareVersions('2.0.0', '10.0.0'), -1)

  const versionRoute = await call('/version')
  check('GET /version reports this package', versionRoute.body.value?.name, 'dsh-token-chart')
  check(
    'GET /version reports the installed version',
    /^\d+\.\d+\.\d+/.test(String(versionRoute.body.value?.version)),
    true,
  )
  check('GET /version resolves a registry', String(versionRoute.body.value?.registry).startsWith('http'), true)
  check('GET /version never claims a bogus update', versionRoute.body.value?.updateAvailable, false)

  const updateRoute = await call('/update', { method: 'POST' })
  check('POST /update refuses when nothing newer exists', updateRoute.body.error?.code, 'up-to-date')

  // Live registry lookup (soft): proves the comparison path reads a real registry.
  const latest = await fetchLatestVersion('dshmarket', 'https://registry.npmmirror.com/').catch((error) => {
    console.log('SKIP  live registry lookup —', String(error).split('\n')[0])
    return undefined
  })
  if (latest !== undefined) {
    check('registry lookup returns a semver', /^\d+\.\d+\.\d+/.test(latest), true)
    check('registry lookup drives the comparison', compareVersions('0.0.1', latest), -1)
  } else {
    check('registry lookup returns a semver (skipped: offline)', true, 'skipped')
  }

  const missing = await fetchLatestVersion(
    'dsh-token-chart-definitely-not-published-xyz',
    'https://registry.npmmirror.com/',
  ).catch(() => 'error')
  check('unknown package reports as unpublished', missing === undefined || missing === 'error', true)

  await new Promise((resolve) => setTimeout(resolve, 1600))

  expectAll(checks)
}, 120000)
