/**
 * Harness for the dsh-token-chart BROWSER half.
 *
 * Loads the built `client/client.js` into jsdom, mounts its registered
 * components with React 18, and lets them talk to the LIVE host API. The chart
 * chunk is emulated with the loader's own semantics: the artifact
 * `client.echarts.js` is executed, its `window.__ModuleLoader__.load(...)`
 * registration is captured, and its factory is invoked under the key the module
 * system would file it under.
 *
 * `chunkFailure: true` reproduces the degraded case where the chunk never
 * arrives, so the built-in renderer has to carry the UI.
 *
 * @module dsh-token-chart/tests/client-harness
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const NPX_REACT = process.env.REACT_DIR ?? '/Users/bytedance/.npm/_npx/1e7f6d9597241db0/node_modules'
const NPX_JSDOM = process.env.JSDOM_DIR ?? '/Users/bytedance/.npm/_npx/712e1b6aac9522e8/node_modules'
const require = createRequire(`${NPX_REACT}/`)
const React = require('react')
const jsxRuntime = require('react/jsx-runtime')
const ReactDOMClient = require('react-dom/client')
const { act } = require('react-dom/test-utils')
const { JSDOM } = createRequire(`${NPX_JSDOM}/`)('jsdom')

const ORIGIN = process.env.DSH_ORIGIN ?? 'http://127.0.0.1:19387'
const SESSION_ID = process.env.DSH_SESSION_ID ?? 'session-427622bf-20a1-4778-837b-32d9cbdaa3f7'
const CLIENT_JS = new URL('../../client/client.js', import.meta.url)
const CHUNK_JS = new URL('../../client/client.echarts.js', import.meta.url)

/**
 * Run the browser-half suite once.
 * @param options - `chunkFailure` simulates a chunk that never arrives.
 * @returns every recorded check, in order.
 */
export async function runClientSuite({ chunkFailure = false } = {}) {
  const CHUNK_FAILURE_MODE = chunkFailure

  // The suite drives the settings UI, which writes the *live* preferences. The
  // user's own configuration is snapshotted here and restored at the end, so a
  // run can never leave someone else's chart choices overwritten.
  const prefsSnapshot = await fetch(`${ORIGIN}/token-chart/api/prefs`)
    .then((response) => response.json())
    .then((payload) => payload.value)
    .catch(() => undefined)

  // Deterministic baseline: the assertions describe specific chart forms and the
  // hit-rate overlay, so the run must not inherit whatever a previous run (or the
  // user) happened to leave behind. The snapshot above is restored at the end.
  const baseline = {
    sessionChart: 'multi-bar',
    dailyChart: 'multi-bar',
    showTable: true,
    showCacheHitRate: true,
    interceptUsageButton: true,
  }
  await fetch(`${ORIGIN}/token-chart/api/prefs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ patch: baseline }),
  }).catch(() => undefined)

  /* ---------------------------------------------------------------- jsdom */

  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: `${ORIGIN}/`,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.HTMLElement = window.HTMLElement
  globalThis.Element = window.Element
  globalThis.Node = window.Node
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.MutationObserver = window.MutationObserver
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  // The components use the page's own fetch; point it at the running Harness,
  // with a small override table so update-check paths can be exercised without
  // publishing a package to a registry.
  const apiOverrides = new Map()
  const apiCalls = []
  window.fetch = (input, init) => {
    const raw = String(input)
    const absolute = raw.startsWith('http') ? raw : `${ORIGIN}${raw}`
    const path = new URL(absolute).pathname
    apiCalls.push({ path, method: init?.method ?? 'GET' })
    if (apiOverrides.has(path)) {
      return Promise.resolve(
        new Response(JSON.stringify(apiOverrides.get(path)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }
    return fetch(absolute, init)
  }

  /* jsdom implements neither canvas nor layout, but a real browser has both:
   ECharts measures label text through a 2D context, and the chart needs a
   non-zero width before it initialises. */
  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      font: '',
      measureText: (text) => ({
        width: String(text).length * 6.2,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }),
      save() {},
      restore() {},
      scale() {},
      clearRect() {},
      fillRect() {},
      fillText() {},
      beginPath() {},
      closePath() {},
    }
  }
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 640
    },
  })

  /* ------------------------------------------- the loader's chunk semantics */

  const chunkRegistrations = []
  let chunkShouldFail = false
  let chunkBareRequires = 0
  let chartLibrary = null
  const reactDomStub = {}

  const pageRequire = (spec) => {
    if (spec === 'react') return React
    if (spec === 'react-dom') return reactDomStub
    if (spec === 'react/jsx-runtime') return jsxRuntime
    throw new Error(`unexpected require(${spec})`)
  }
  pageRequire.async = async (spec) => {
    if (spec !== './client.echarts.js') throw new Error(`unexpected require.async(${spec})`)
    if (chunkShouldFail || CHUNK_FAILURE_MODE) throw new Error('simulated chunk transport failure')

    const source = readFileSync(CHUNK_JS, 'utf8')
    const previous = window.__ModuleLoader__
    let registration = null
    window.__ModuleLoader__ = {
      load: (value) => {
        registration = value
      },
    }
    try {
      new Function('window', 'document', 'navigator', 'location', source)(
        window,
        window.document,
        window.navigator,
        window.location,
      )
    } finally {
      window.__ModuleLoader__ = previous
    }
    if (registration === null) throw new Error('chunk did not call window.__ModuleLoader__.load')
    chunkRegistrations.push({
      id: registration.id,
      chunk: registration.chunk,
      key: `${registration.id}/${registration.chunk}`,
    })
    const exports = registration.factory((specifier) => {
      chunkBareRequires += 1
      throw new Error(`chunk must be self-contained, but it required ${specifier}`)
    })
    chartLibrary = exports.default ?? exports
    return exports
  }

  /* ------------------------------------------------- load the real bundle */

  let captured = null
  window.__ModuleLoader__ = {
    load: (module) => {
      captured = module
    },
  }
  const source = readFileSync(CLIENT_JS, 'utf8')
  const loadBundle = new Function(
    'window',
    'document',
    'fetch',
    'console',
    'setTimeout',
    'clearTimeout',
    'ResizeObserver',
    'requestAnimationFrame',
    `${source}\nreturn window.__ModuleLoader__;`,
  )
  loadBundle(
    window,
    window.document,
    window.fetch,
    console,
    window.setTimeout.bind(window),
    window.clearTimeout.bind(window),
    undefined,
    undefined,
  )
  if (captured === null || captured.id !== 'dsh-token-chart') throw new Error('client bundle did not register itself')

  const plugin = captured.factory(pageRequire)

  /* ----------------------------------------------------- capture the seats */

  const registrations = new Map()
  const dictionaries = {}
  const tabTypes = []
  const openedTabs = []
  const services = {
    sidebarRightTabs: {
      register: (definition) => {
        tabTypes.push(definition)
        return () => {}
      },
    },
    sidebarRight: {
      mounted: { getSnapshot: () => SESSION_ID },
      openTab: (kind, options) => {
        openedTabs.push({ kind, options })
      },
    },
  }

  const ctx = {
    effect: (fn) => {
      const disposer = fn()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    on: () => () => {},
    get: (key) => services[key],
    inject: (deps, callback) => callback({ get: (key) => services[key], ...services }),
    locale: {
      register: (ns, dicts) => {
        dictionaries[ns] = dicts
        return () => {}
      },
      bind: (ns) => (key, params) => {
        const raw = dictionaries[ns]?.zh?.[key] ?? key
        return params === undefined
          ? raw
          : String(raw).replace(/\{(\w+)\}/g, (_m, name) =>
              params[name] === undefined ? `{${name}}` : String(params[name]),
            )
      },
    },
    slots: {
      inject: (key, callback) => callback(),
      register: (options, component) => {
        registrations.set(`${options.name}#${options.id ?? options.key ?? ''}`, { options, component })
        return () => {}
      },
    },
  }
  /* The degraded run needs a cartesian chart form regardless of what the live
   document holds. It borrows the user's configuration for the duration of the
   run and hands it straight back, so a failure here cannot leave it changed. */
  if (CHUNK_FAILURE_MODE) {
    const before = await fetch(`${ORIGIN}/token-chart/api/prefs`)
      .then((response) => response.json())
      .then((payload) => payload.value)
      .catch(() => undefined)
    const patch = { ...(before ?? {}), sessionChart: 'multi-bar' }
    await fetch(`${ORIGIN}/token-chart/api/prefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patch }),
    })
    // Handed back after the degraded assertions run (see below): the plugin has to
    // read a cartesian form while it renders, or the built-in renderer draws
    // whatever the outer run last selected.
    globalThis.__dtcBorrowedPrefs = before
  }

  plugin.apply(ctx)

  const seats = (name) => [...registrations.entries()].filter(([key]) => key.startsWith(`${name}#`))
  const results = []
  const check = (name, pass, detail = '') => {
    results.push({ name, pass, detail })
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || detail === '' ? '' : ` — ${detail}`}`)
  }

  // The registered-surface and rendering assertions only describe a chunk that
  // actually loaded; a degraded run jumps straight to its own block below.
  /* ------------------------------------------------------------- mounting */

  const t = ctx.locale.bind('token-chart')

  /* ------------------------------------------------------------- mounting */

  const container = document.getElementById('root')
  const root = ReactDOMClient.createRoot(container)

  async function mount(component, props) {
    await act(async () => {
      root.render(React.createElement(component, props))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    return container.innerHTML
  }

  async function settle(delay = 350) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, delay))
    })
    return container.innerHTML
  }

  if (!chunkFailure) {
    const styleLink = document.querySelector('link[data-dtc-styles]')
    check(
      'stylesheet is linked, not inlined',
      styleLink !== null && styleLink.rel === 'stylesheet',
      String(styleLink?.getAttribute('href')),
    )
    check(
      'stylesheet points at the host route',
      styleLink?.getAttribute('href') === '/token-chart/assets/token-chart.css',
      String(styleLink?.getAttribute('href')),
    )
    check('bundle id', captured.id === 'dsh-token-chart')
    check('locale dictionaries registered', Boolean(dictionaries['token-chart']?.zh && dictionaries['token-chart']?.en))
    check('settings page registered', seats('settings.section').length === 1)
    check('sidebar entry registered', seats('sidebar.panellist').length === 1)
    check('main panel registered', seats('main').length === 1)
    check('session header action registered', seats('conversation.session.header.utilities').length === 1)
    check(
      'right sidebar tab type registered',
      tabTypes.some((type) => type.id === 'dsh-token-chart' && type.kind === 'dsh-token-chart'),
    )
    check(
      'right sidebar body + title seats',
      seats('sidebar.right.pane.tab').length === 1 && seats('sidebar.right.pane.tab.title').length === 1,
    )
  }

  /* ------------------------------- degraded run: chunk never becomes available */

  if (CHUNK_FAILURE_MODE) {
    const drawerSeat = seats('sidebar.right.pane.tab')[0][1].component
    const settingsSeat = seats('settings.section')[0][1].component
    const drawerMarkup = await mount(drawerSeat, { t, sessionId: SESSION_ID })
    check('degraded: no chart mount (built-in renderer in force)', container.querySelector('[data-dtc-chart]') === null)
    check(
      'degraded: built-in SVG chart rendered',
      drawerMarkup.includes('<svg') && drawerMarkup.includes('<rect'),
      `${container.querySelectorAll('svg rect').length} rects`,
    )
    check('degraded: text accounting still present', drawerMarkup.includes('缓存读取') && drawerMarkup.includes('轮次'))
    const settingsMarkup = await mount(settingsSeat, { t })
    check('degraded: settings still shows the plugin version', /data-dtc-version="\d+\.\d+\.\d+"/.test(settingsMarkup))
    check('degraded: chart forms are still configurable', settingsMarkup.includes('柱状折线组合图'))

    // Everything below describes a chunk that actually loaded. Hand the borrowed
    // preferences back and stop here.
    if (prefsSnapshot !== undefined) {
      await fetch(`${ORIGIN}/token-chart/api/prefs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch: prefsSnapshot }),
      })
    }
    return results
  }

  // Warm the host's version cache: the first /version call queries the registry.
  await fetch(`${ORIGIN}/token-chart/api/version`).catch(() => {})

  const panel = seats('main')[0][1].component
  let html = await mount(panel, { t })
  check('panel renders its title', html.includes('Token 用量'))
  check(
    'panel renders the range switcher',
    html.includes('今天') && html.includes('近 3 天') && html.includes('近 7 天'),
  )
  check(
    'panel renders KPI cards',
    html.includes('总 Token') && html.includes('输入 Token') && html.includes('缓存命中率'),
  )
  check('panel renders the data table', html.includes('<table') && html.includes('会话'))
  const panelNumbers = html.match(/>(\d[\d,]{3,})</g) ?? []
  check('panel shows real token counts', panelNumbers.length > 0, `${panelNumbers.length} numeric cells`)

  /* ------------------------------------ the chart chunk replaced the renderer */

  check(
    'chart chunk requested through require.async',
    chunkRegistrations.length > 0,
    `${chunkRegistrations.length} registration(s)`,
  )
  check(
    'chunk registers under the entry id',
    chunkRegistrations[0]?.id === 'dsh-token-chart',
    JSON.stringify(chunkRegistrations[0]),
  )
  check(
    'chunk declares its file name',
    chunkRegistrations[0]?.chunk === 'client.echarts.js',
    JSON.stringify(chunkRegistrations[0]),
  )
  check(
    'chunk key equals <entry>/<file>',
    chunkRegistrations[0]?.key === 'dsh-token-chart/client.echarts.js',
    chunkRegistrations[0]?.key,
  )
  check('chunk is self-contained (no bare requires)', chunkBareRequires === 0, `${chunkBareRequires} bare require(s)`)

  const mountNode = container.querySelector('[data-dtc-chart]')
  check(
    'panel chart is drawn by ECharts',
    mountNode?.getAttribute('data-dtc-renderer') === 'echarts',
    String(mountNode?.getAttribute('data-dtc-renderer')),
  )
  check(
    'ECharts rendered SVG paths',
    container.querySelectorAll('.dtc-echarts svg path').length > 0,
    `${container.querySelectorAll('.dtc-echarts svg path').length} paths`,
  )
  check('ECharts drew category labels', (container.querySelector('.dtc-echarts svg')?.textContent ?? '').length > 0)

  /* --------------------------------------------------- the range switcher */

  const sevenDayButton = [...container.querySelectorAll('button')].find((node) => node.textContent === '近 7 天')
  await act(async () => {
    sevenDayButton.click()
  })
  html = await settle(500)
  const dayLabels = [...container.querySelectorAll('td')].map((node) => node.textContent)
  check(
    '7-day view lists 7 day buckets',
    (html.match(/\d{2}-\d{2}/g) ?? []).length >= 7,
    dayLabels.slice(0, 8).join(','),
  )

  /* ---------------------------------------------------------- the drawer */

  const drawer = seats('sidebar.right.pane.tab')[0][1].component
  html = await mount(drawer, { t, sessionId: SESSION_ID })
  check(
    'drawer keeps the default text accounting',
    html.includes('缓存读取') && html.includes('缓存写入') && html.includes('轮次'),
  )
  check('drawer chart is drawn by ECharts', container.querySelector('[data-dtc-renderer="echarts"]') !== null)
  check('drawer lists per-turn rows', html.includes('<table') && html.includes('轮次'))

  /* --------------------------------------------------------- the settings */

  const settings = seats('settings.section')[0][1].component
  html = await mount(settings, { t })
  // The identity row resolves `/version` on mount; when the host is briefly
  // reloading that request can land late, so give it one more settle before the
  // version assertion below reads the markup.
  if (!/data-dtc-version="\d+\.\d+\.\d+"/.test(html)) {
    html = await settle(900)
  }
  check('settings renders both surfaces', html.includes('会话用量抽屉') && html.includes('每日用量面板'))
  check(
    'settings offers every chart form',
    ['柱状图', '折线图', '饼图', '表格', '多柱状图', '多折线图', '柱状折线组合图'].every((label) =>
      html.includes(label),
    ),
  )
  check('settings renders switches', html.includes('role="switch"'))
  const shippedVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
  check(
    'settings shows the installed plugin version',
    html.includes(`data-dtc-version="${shippedVersion}"`),
    `${html.match(/data-dtc-version="[^"]*"/)?.[0] ?? 'no version chip'} (expected ${shippedVersion})`,
  )
  check(
    'settings no longer advertises the renderer',
    html.includes('data-dtc-engine') === false && html.includes('渲染引擎') === false,
  )

  /* ------------- every configured chart form renders through ECharts ------ */

  // The cache-hit-rate overlay defaults to ON and now rides every cartesian
  // form, so the base series of each form carries a trailing line. The dedicated
  // overlay block below proves the switch adds and removes it.
  const expectedSeries = {
    柱状图: 'bar,line',
    折线图: 'line,line',
    多柱状图: 'bar,bar,bar,bar,line',
    多折线图: 'line,line,line,line,line',
    柱状折线组合图: 'bar,line',
    饼图: 'pie',
  }
  for (const [label, series] of Object.entries(expectedSeries)) {
    await mount(settings, { t })
    const chip = [...container.querySelectorAll('button')].find((node) => node.textContent === label)
    if (chip === undefined) {
      check(`settings chip "${label}" exists`, false)
      continue
    }
    await act(async () => {
      chip.click()
    })
    await settle(700)
    await mount(drawer, { t, sessionId: SESSION_ID })
    const node = container.querySelector('[data-dtc-chart]')
    const renderer = node?.getAttribute('data-dtc-renderer')
    const drawn = node?.getAttribute('data-dtc-series')
    const paths = container.querySelectorAll('.dtc-echarts svg path').length
    check(
      `ECharts draws "${label}" (${series})`,
      renderer === 'echarts' && drawn === series && paths > 0,
      `renderer=${renderer} series="${drawn}" paths=${paths}`,
    )
  }

  /* Table form stays the plugin's own DOM table, with no chart mount at all. */
  {
    await mount(settings, { t })
    const chip = [...container.querySelectorAll('button')].find((node) => node.textContent === '表格')
    await act(async () => {
      chip.click()
    })
    await settle(700)
    const markup = await mount(drawer, { t, sessionId: SESSION_ID })
    check(
      'table form renders a table and no chart',
      markup.includes('<table') && container.querySelector('[data-dtc-chart]') === null,
    )
  }

  /* --------- 设置页导航图标：与左侧菜单同一个图标 ---------------------- */
  {
    const nav = document.createElement('div')
    nav.setAttribute('role', 'dialog')
    const navEl = document.createElement('nav')
    const row = document.createElement('button')
    row.appendChild(document.createElement('svg'))
    const text = document.createElement('span')
    text.textContent = 'Token 用量'
    row.appendChild(text)
    navEl.appendChild(row)
    nav.appendChild(navEl)
    document.body.appendChild(nav)
    await settle(60)
    check(
      'settings nav row is marked for the shared icon',
      row.hasAttribute('data-dtc-settings-nav'),
      row.outerHTML.slice(0, 80),
    )
    const other = document.createElement('button')
    other.textContent = '通用设置'
    navEl.appendChild(other)
    await settle(60)
    check(
      'only our own nav row is marked',
      row.hasAttribute('data-dtc-settings-nav') && other.hasAttribute('data-dtc-settings-nav') === false,
    )
    nav.remove()
  }

  /* --------- 版本更新：有新版时出现「更新版本」按钮 --------------------- */
  {
    apiOverrides.set('/token-chart/api/version', {
      ok: true,
      value: {
        name: 'dsh-token-chart',
        version: '0.1.0',
        registry: 'https://registry.npmmirror.com/',
        status: 'ok',
        latest: '0.2.0',
        updateAvailable: true,
        checkedAt: Date.now(),
        install: { kind: 'registry', spec: '^0.1.0' },
        run: { phase: 'idle', startedAt: 0, finishedAt: 0, message: '', error: '' },
      },
    })
    const markup = await mount(settings, { t })
    const button = container.querySelector('[data-dtc-update="available"]')
    check(
      'update button appears when a newer version exists',
      button !== null && button.textContent.includes('更新版本'),
      button?.textContent ?? 'no button',
    )
    check('header shows both name and newest version', markup.includes('dsh-token-chart') && markup.includes('v0.1.0'))

    if (button !== null) {
      await act(async () => {
        button.click()
      })
      await settle(400)
    }
    check(
      'update button posts to the host',
      apiCalls.some((call) => call.path === '/token-chart/api/update' && call.method === 'POST'),
      JSON.stringify(apiCalls.slice(-3)),
    )
    apiOverrides.delete('/token-chart/api/version')
  }

  /* --------- 命中率折线：开关必须对每种柱状/折线/组合图都生效 ---------- */
  {
    const seriesOf = () => container.querySelector('[data-dtc-chart]')?.getAttribute('data-dtc-series') ?? ''
    const switchFor = (text) =>
      [...container.querySelectorAll('.dtc-switch-row')]
        .find((row) => (row.querySelector('.dtc-switch-label')?.textContent ?? '').includes(text))
        ?.querySelector('button[role="switch"]')
    // Click the chart-form chip and confirm it actually became the selected one:
    // a click that lands mid-render silently leaves the previous form in force,
    // which used to make the series assertions flake.
    const pickChart = async (label) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await mount(settings, { t })
        const chip = [...container.querySelectorAll('button')].find((node) => node.textContent === label)
        if (chip === undefined) return
        if (chip.getAttribute('aria-pressed') !== 'true') {
          await act(async () => {
            chip.click()
          })
        }
        await settle(attempt === 0 ? 700 : 300)
        await mount(settings, { t })
        const selected = [...container.querySelectorAll('button')].find((node) => node.textContent === label)
        if (selected?.getAttribute('aria-pressed') === 'true') return
      }
    }
    const setOverlay = async (want) => {
      await mount(settings, { t })
      const sw = switchFor('叠加缓存命中率折线')
      if ((sw.getAttribute('aria-checked') === 'true') !== want) {
        await act(async () => {
          sw.click()
        })
        await settle(800)
      }
    }

    const bases = [
      ['柱状图', 'bar'],
      ['折线图', 'line'],
      ['多柱状图', 'bar,bar,bar,bar'],
      ['多折线图', 'line,line,line,line'],
      ['柱状折线组合图', 'bar'],
    ]
    for (const [label, base] of bases) {
      await setOverlay(true)
      await pickChart(label)
      await mount(drawer, { t, sessionId: SESSION_ID })
      const on = seriesOf()
      check(
        `hit-rate line is drawn on "${label}" when enabled`,
        on === `${base},line`,
        `series=${on} want=${base},line`,
      )

      await setOverlay(false)
      await pickChart(label)
      await mount(drawer, { t, sessionId: SESSION_ID })
      const off = seriesOf()
      check(`hit-rate line is dropped from "${label}" when disabled`, off === base, `series=${off} want=${base}`)
    }

    // 右轴必须真的在右侧（ECharts 默认会把第二条 y 轴也排在左边）
    await setOverlay(true)
    await pickChart('柱状折线组合图')
    await mount(drawer, { t, sessionId: SESSION_ID })
    const axisX = (node) => Number((node.getAttribute('transform') ?? '').match(/translate\(([-\d.]+)/)?.[1] ?? 0)
    const percentLabels = [...container.querySelectorAll('.dtc-echarts svg text')].filter((node) =>
      node.textContent.includes('%'),
    )
    const width = Number(container.querySelector('.dtc-echarts svg')?.getAttribute('width') ?? 0)
    const rightmost = percentLabels.length === 0 ? 0 : Math.max(...percentLabels.map(axisX))
    check(
      'percentage axis sits on the right edge',
      percentLabels.length > 0 && rightmost > width * 0.7,
      `labels=${percentLabels.length} rightmost=${rightmost} width=${width}`,
    )
    await setOverlay(false)
  }

  /* --------- x 轴范围选择条：滑块存在、可拖动、只给笛卡尔图形 ------------- */
  {
    const instanceOf = () => chartLibrary.getInstanceByDom(container.querySelector('.dtc-echarts'))
    const pickChart = async (label) => {
      await mount(settings, { t })
      const chip = [...container.querySelectorAll('button')].find((node) => node.textContent === label)
      await act(async () => {
        chip.click()
      })
      await settle(700)
      await mount(drawer, { t, sessionId: SESSION_ID })
    }

    await pickChart('柱状图')
    const zoomAttr = container.querySelector('[data-dtc-chart]')?.getAttribute('data-dtc-zoom')
    const svgHeight = container.querySelector('.dtc-echarts svg')?.getAttribute('height')
    check('cartesian chart carries a range slider', zoomAttr === 'slider', String(zoomAttr))
    check('slider gets its own band (taller canvas)', svgHeight === '248', String(svgHeight))

    const instance = instanceOf()
    const zooms = instance.getOption().dataZoom ?? []
    check(
      'slider + inside zoom are both configured',
      zooms
        .map((entry) => entry.type)
        .sort()
        .join(',') === 'inside,slider',
      JSON.stringify(zooms.map((entry) => entry.type)),
    )
    check(
      'slider starts at the full range',
      zooms.every((entry) => entry.start === 0 && entry.end === 100),
      JSON.stringify(zooms.map((entry) => [entry.start, entry.end])),
    )

    const before = instance.getOption().xAxis[0].data.length
    instance.dispatchAction({ type: 'dataZoom', start: 40, end: 80 })
    await new Promise((resolve) => setTimeout(resolve, 60))
    const moved = instance.getOption().dataZoom
    check(
      'dragging the slider moves the window',
      moved.every((entry) => entry.start === 40 && entry.end === 80),
      JSON.stringify(moved.map((entry) => [entry.start, entry.end])),
    )
    check(
      'the axis keeps every category (zoom is a window, not a filter)',
      instance.getOption().xAxis[0].data.length === before,
      `${before} -> ${instance.getOption().xAxis[0].data.length}`,
    )

    await pickChart('饼图')
    const pieZoom = container.querySelector('[data-dtc-chart]')?.getAttribute('data-dtc-zoom')
    check('pie has no range slider', pieZoom === 'none', String(pieZoom))

    await pickChart('柱状图')
  }

  /* --------- 表格分页：数字页码 + 省略号 + 下拉选择页大小 ---------------- */
  {
    const rowCount = () => container.querySelectorAll('.dtc-table tbody tr').length
    const pager = () => container.querySelector('[data-dtc-pager]')
    const numbers = () =>
      [...container.querySelectorAll('[data-dtc-page-number]')].map((node) =>
        Number(node.getAttribute('data-dtc-page-number')),
      )
    const gapCount = () => container.querySelectorAll('.dtc-page-gap').length
    const currentPage = () =>
      Number(container.querySelector('[aria-current="page"]')?.getAttribute('data-dtc-page-number'))
    const stepButton = (dir) => container.querySelector(`[data-dtc-page-step="${dir}"]`)
    const sizeSelect = () => container.querySelector('[data-dtc-page-size]')
    const setPageSize = async (size) => {
      const select = sizeSelect()
      await act(async () => {
        select.value = String(size)
        select.dispatchEvent(new window.Event('change', { bubbles: true }))
      })
      await settle(260)
    }
    const pickChart = async (label) => {
      await mount(settings, { t })
      const chip = [...container.querySelectorAll('button')].find((node) => node.textContent === label)
      await act(async () => {
        chip.click()
      })
      await settle(700)
      await mount(drawer, { t, sessionId: SESSION_ID })
    }
    const sessionStub = (turns) => ({
      ok: true,
      value: {
        sessionId: SESSION_ID,
        totals: {
          input: 100,
          output: 50,
          cacheRead: 850,
          cacheWrite: 0,
          cache: 850,
          total: 1000,
          cacheHitRate: 0.8947,
          turns,
          routes: [],
        },
        turns: Array.from({ length: turns }, (_unused, index) => ({
          turn: index + 1,
          time: Date.now() - index * 60000,
          label: `1${String(index % 10)}:00`,
          routes: [],
          input: 10,
          output: 5,
          cacheRead: 85,
          cacheWrite: 0,
          cache: 85,
          total: 100,
          cacheHitRate: 0.9,
        })),
        crossCheck: { source: 'unavailable' },
      },
    })

    // 25 轮：默认 20 条/页 → 两页
    apiOverrides.set('/token-chart/api/session', sessionStub(25))
    await pickChart('表格')
    check('table form pages 20 rows by default', rowCount() === 20, String(rowCount()))
    check(
      'pager reports the position',
      pager()?.getAttribute('data-dtc-pager') === '1/2',
      String(pager()?.getAttribute('data-dtc-pager')),
    )
    check('page-size control is a select', sizeSelect()?.tagName === 'SELECT', String(sizeSelect()?.tagName))
    check(
      'pager sits outside the scrolling table box',
      pager()?.closest('.dtc-table-wrap') === null &&
        pager()?.parentElement?.classList.contains('dtc-table-block') === true,
      `parent=${pager()?.parentElement?.className ?? 'none'}`,
    )
    check(
      'pager row is right-aligned by its own utilities',
      (pager()?.className ?? '').includes('tw:justify-end') && (pager()?.className ?? '').includes('tw:flex'),
      String(pager()?.className),
    )
    check('page-size select shows the current size', sizeSelect()?.value === '20', String(sizeSelect()?.value))
    check('page numbers are rendered', numbers().join(',') === '1,2', numbers().join(','))
    check('the current page is marked', currentPage() === 1, String(currentPage()))
    check('the first page disables the previous step', stepButton('prev').disabled === true)

    await act(async () => {
      stepButton('next').click()
    })
    await settle(220)
    check(
      'next page shows the remainder',
      rowCount() === 5 && currentPage() === 2,
      `${rowCount()} rows, page ${currentPage()}`,
    )
    check('the last page disables the next step', stepButton('next').disabled === true)

    await setPageSize(10)
    check('choosing 10 rows per page applies', rowCount() === 10, String(rowCount()))
    check('changing the page size returns to page one', currentPage() === 1, String(currentPage()))
    check('more pages appear with the smaller size', numbers().join(',') === '1,2,3', numbers().join(','))

    // 500 轮：50 页 → 数字页码折叠成 1 … 4 5 6 7 8 … 50
    apiOverrides.set('/token-chart/api/session', sessionStub(500))
    await pickChart('表格')
    await setPageSize(10)
    check(
      'the first page keeps a short window',
      numbers().join(',') === '1,2,3,50' && gapCount() === 1,
      `${numbers().join(',')} +${gapCount()}gaps`,
    )

    for (let step = 0; step < 5; step += 1) {
      await act(async () => {
        stepButton('next').click()
      })
      await settle(180)
    }
    check('stepping through the pages works', currentPage() === 6, String(currentPage()))
    check('the window follows the current page', numbers().join(',') === '1,4,5,6,7,8,50', numbers().join(','))
    check('both margins collapse into ellipsis', gapCount() === 2, `${gapCount()} gaps`)
    check('rows still fill one page', rowCount() === 10, String(rowCount()))

    await act(async () => {
      stepButton('prev').click()
    })
    await settle(220)
    check('the previous step moves one page', currentPage() === 5, String(currentPage()))

    await setPageSize(50)
    check('choosing 50 rows per page shows every row', rowCount() === 50, String(rowCount()))

    await setPageSize(20)
    check('back to 20 rows per page', rowCount() === 20, String(rowCount()))

    apiOverrides.delete('/token-chart/api/session')

    // 短表也带分页栏：只有一页时两个方向都置灰
    await mount(settings, { t })
    const dailyChip = [...[...container.querySelectorAll('section.dtc-card')][1].querySelectorAll('button')].find(
      (node) => node.textContent === '柱状图',
    )
    if (dailyChip !== undefined) {
      await act(async () => {
        dailyChip.click()
      })
      await settle(700)
    }
    await mount(panel, { t })
    check('a short table keeps the pager', pager() !== null, String(pager()?.getAttribute('data-dtc-pager')))
    check(
      'a single-page pager disables both steps',
      stepButton('prev').disabled === true && stepButton('next').disabled === true,
    )

    for (const [label, expected] of [
      ['近 3 天', 3],
      ['近 7 天', 7],
    ]) {
      const chip = [...container.querySelectorAll('button')].find((node) => node.textContent === label)
      await act(async () => {
        chip.click()
      })
      await settle(900)
      check(
        `the ${label} table shows ${expected} day rows with a pager`,
        rowCount() === expected && pager() !== null && pager().getAttribute('data-dtc-pager') === '1/1',
        `${rowCount()} rows, pager=${pager()?.getAttribute('data-dtc-pager') ?? 'none'}`,
      )
    }
  }

  /* --------- 今天视图的 x 轴是时间，不是序号 ----------------------------- */
  {
    // 面板图表走 dailyChart，配置页里第二个卡片才是它
    const dailyChip = (label) =>
      [...container.querySelectorAll('section.dtc-card')][1]
        ? [...[...container.querySelectorAll('section.dtc-card')][1].querySelectorAll('button')].find(
            (node) => node.textContent === label,
          )
        : undefined
    await mount(settings, { t })
    const chip = dailyChip('柱状图')
    if (chip !== undefined) {
      await act(async () => {
        chip.click()
      })
      await settle(800)
    }
    await mount(panel, { t })
    const labels =
      chartLibrary.getInstanceByDom(container.querySelector('.dtc-echarts'))?.getOption().xAxis[0].data ?? []
    check(
      'today axis labels are clock times',
      labels.length > 0 && labels.every((label) => /^\d{2}:\d{2}(:\d{2})?$/.test(label)),
      JSON.stringify(labels.slice(0, 5)),
    )
    check(
      'today axis never falls back to an ordinal',
      labels.includes('1') === false,
      JSON.stringify(labels.slice(0, 5)),
    )

    // 近 7 天仍按天，标签是日期
    const weekChip = [...container.querySelectorAll('button')].find((node) => node.textContent === '近 7 天')
    await act(async () => {
      weekChip.click()
    })
    await settle(900)
    const weekLabels =
      chartLibrary.getInstanceByDom(container.querySelector('.dtc-echarts'))?.getOption().xAxis[0].data ?? []
    check(
      'a multi-day range keeps date labels',
      weekLabels.length === 7 && weekLabels.every((label) => /^\d{2}-\d{2}$/.test(label)),
      JSON.stringify(weekLabels.slice(0, 3)),
    )
  }

  /* --------- 口径脚注与交叉校验提示 ------------------------------------- */
  {
    const markup = await mount(drawer, { t, sessionId: SESSION_ID })
    check(
      'drawer states the accounting rule',
      markup.includes('总量按计费口径累计'),
      markup.includes('计费口径') ? '' : 'no footnote',
    )

    // 与产品投影不一致时必须显式提示，而不是静默显示一个不同的数字
    apiOverrides.set('/token-chart/api/session', {
      ok: true,
      value: {
        sessionId: SESSION_ID,
        totals: {
          input: 100,
          output: 50,
          cacheRead: 850,
          cacheWrite: 0,
          cache: 850,
          total: 1000,
          cacheHitRate: 0.8947,
          turns: 1,
          routes: [],
        },
        turns: [
          {
            turn: 1,
            time: Date.now(),
            label: '10:00',
            routes: [],
            input: 100,
            output: 50,
            cacheRead: 850,
            cacheWrite: 0,
            cache: 850,
            total: 1000,
            cacheHitRate: 0.8947,
          },
        ],
        crossCheck: { source: 'sessionProjection', total: 2000, matches: false },
      },
    })
    // Render a different component first: React reuses a fibre for the same type,
    // and the drawer only refetches on a fresh mount.
    await mount(panel, { t })
    const mismatch = await mount(drawer, { t, sessionId: SESSION_ID })
    check(
      'divergence from the product projection is surfaced',
      mismatch.includes('data-dtc-crosscheck="mismatch"'),
      mismatch.includes('不一致') ? '' : 'no warning',
    )
    apiOverrides.delete('/token-chart/api/session')
  }

  /* --------- 标题栏用量入口：常驻，不受任何开关影响 --------------------- */
  {
    const headerSeat = seats('conversation.session.header.utilities')[0][1].component
    const settingsMarkup = await mount(settings, { t })
    check(
      'the header-entry switch is gone from settings',
      settingsMarkup.includes('会话标题栏') === false && settingsMarkup.includes('sessionHeaderAction') === false,
    )

    const shown = await mount(headerSeat, { sessionId: SESSION_ID, open: () => {}, t })
    check('header usage entry is always rendered', shown.includes('dtc-header-button'), shown.slice(0, 60))

    // 配置文档里也不再有这个键
    const stored = await (await fetch(`${ORIGIN}/token-chart/api/prefs`)).json()
    check(
      'the preference key no longer exists',
      Object.prototype.hasOwnProperty.call(stored.value, 'sessionHeaderAction') === false,
      JSON.stringify(stored.value),
    )
  }

  /* ------------------- the usage pill opens the drawer, not the dialog ---- */

  const pill = document.createElement('button')
  pill.setAttribute('aria-haspopup', 'dialog')
  const label = document.createElement('span')
  label.textContent = '用量 2.7M tok'
  pill.appendChild(label)
  document.body.appendChild(pill)
  pill.click()
  check(
    'usage pill opens the drawer',
    openedTabs.length === 1 && openedTabs[0].kind === 'dsh-token-chart',
    JSON.stringify(openedTabs),
  )
  check('usage pill names the session', openedTabs[0]?.options?.params?.sessionId === SESSION_ID)

  /* ------------------------------------- restore whatever the user had set */

  if (prefsSnapshot !== undefined) {
    const restored = await fetch(`${ORIGIN}/token-chart/api/prefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patch: prefsSnapshot }),
    }).then((response) => response.json())
    const kept = Object.entries(prefsSnapshot).every(
      ([key, value]) => JSON.stringify(restored.value?.[key]) === JSON.stringify(value),
    )
    check('the user configuration is restored after the run', kept, JSON.stringify(restored.value))
  }

  // A degraded run stops here: everything below describes the chunk being
  // present, and hands the user's preferences back before returning.
  if (chunkFailure) {
    if (prefsSnapshot !== undefined) {
      await fetch(`${ORIGIN}/token-chart/api/prefs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch: prefsSnapshot }),
      })
    }
    return results
  }

  // Hand the borrowed preferences back before returning.
  if (globalThis.__dtcBorrowedPrefs !== undefined) {
    await fetch(`${ORIGIN}/token-chart/api/prefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patch: globalThis.__dtcBorrowedPrefs }),
    })
    globalThis.__dtcBorrowedPrefs = undefined
  }

  return results
}
