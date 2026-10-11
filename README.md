# dsh-token-chart

DeepSeek Harness 插件：统计并以图表方式可视化 Token 用量。

## 功能

| 场景     | 入口                                            | 内容                                                                                                            |
| -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 单个会话 | 会话标题栏「用量」按钮 / 消息底部的「用量」胶囊 | 右侧边栏抽屉：默认文字统计（总 Token、输入、输出、缓存读取/写入、缓存命中率、轮次、模型）+ 多轮对话的用量趋势图 |
| 时间区间 | 左侧边栏「Token 用量」菜单                      | 今天 / 近 3 天 / 近 7 天：KPI 卡片 + 趋势图 + 数据表格                                                          |
| 图表配置 | 设置 →「Token 用量」                            | 分别配置会话抽屉与每日面板的图表形式、展示指标与开关；标题行显示插件名、版本号，并在有新版本时给出「更新版本」  |

三个「用量」入口彼此独立，容易混淆，这里写明各自由谁控制：

| 看到「Token 用量」的位置                    | 由什么控制                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 消息底部 / 输入框上方的「用量」胶囊         | 产品自身的组件；插件只拦截点击，把它改成打开抽屉（开关：点击「用量」按钮打开侧边抽屉） |
| 会话标题栏右上角的小按钮（与 ⋯ 菜单同一行） | 本插件注册在 `conversation.session.header.utilities` 的入口，**常驻显示**（不设开关）  |
| 右侧边栏的标签页标题                        | 本插件的 `sidebar.right.pane.tab.title` 座位，**不受**上面那个开关影响                 |

图表形式：柱状图、折线图、饼图、表格、多柱状图、多折线图、柱状折线组合图。开启「叠加缓存命中率折线」后，柱状 / 折线 / 多柱状 / 多折线 / 组合图都会在右轴叠加一条缓存命中率折线（默认开启）。

x 轴标签按视图区分：**每日面板的「今天」用时间 `HH:mm`**（跨会话逐轮，一个点是一轮的用量；同一分钟内出现多轮时自动补到 `HH:mm:ss`），「近 3 天 / 近 7 天」用日期；**会话抽屉用 `#轮次`**（单会话内编号即真实轮次）。早先「今天」用的是数据点序号（1、2、3…），会被读成轮次并与表格的「轮次」列对不上。

图表下方的数据表（会话抽屉与每日面板共用同一个表格组件）带**分页**：默认每页 20 条，页大小以**下拉选择**切换（10 / 20 / 50 条/页），页码是**数字按钮 + 省略号**（`1 … 4 5 [6] 7 8 … 50`，当前页用品牌色描边），整条分页栏居**右下角**、行数统计留左侧。切换页大小或数据变化回到第一页，页码自动收敛；分页栏在所有视图常驻，「近 3 天 / 近 7 天」只有一页时两个翻页按钮置灰但页大小仍可切换。

柱状 / 折线 / 组合类图形在坐标轴下方带一条**范围选择条**：拖动两端或中间窗口即可只看某一段 x 范围（滚轮与触控板捏合同样生效）。缩放只改变可见窗口，不改变统计口径——数据表、KPI 卡片与总量始终是完整区间的值。

数据只保留最近 7 个自然日：`~/.dsh/storages/dsh-token-chart/usage.json`，7 天前的轮次在每次落盘前被裁剪。

## 结构

```
dsh-token-chart/
├── package.json         # dsh.bundle.patch + dsh.client（web）
├── cordis.patch.yml     # 插入 token-chart 这一 Host 行
├── index.js             # Host 半边：用量折叠、7 天存储、/token-chart/api
├── client.js            # 浏览器半边：插槽注册、ECharts 挂载、设置页
├── client.echarts.js    # 包内懒加载 chunk（ECharts 6.1.0，构建产物，已随包发布）
├── chunk/
│   ├── echarts.entry.js # 构建入口：core + bar/line/pie + grid/tooltip/legend + SVG 渲染器
│   └── build.mjs        # esbuild 打包 + __ModuleLoader__ 自注册包装 + 产物断言
├── icon.svg
├── locale/{zh,en}.json
└── test/{host,client}.test.mjs
```

## 为什么 ECharts 必须打包（而不是 dependencies）

`echarts` 放在 **devDependencies** 里是正确且唯一的放法——它是**构建期**依赖：

- 浏览器半边运行在页面里，`require` 只能解析加载器模块表里的平台种子（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、几个 `dsh-client-*`）。写 `dependencies` 也一样：Node 侧的 `node_modules` 到不了页面。
- 所以 ECharts 的代码必须在构建时**打进产物**。两种形态：

| 形态               | 产物                                                 | 代价                                           |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------- |
| 包内 chunk（当前） | `client/client.echarts.js`，`require.async` 按需加载 | 首次出图多一次 234 KB(gz) 请求；启动路径 22 KB |
| 内联进 client.js   | 单文件 ~700 KB 原始 / 257 KB(gz)                     | 每次打开页面都要下整包，哪怕从不看图           |

参考实现：dsh-market 同样把它的构建期依赖 `marked` 直接打进 `client/client.js`，运行时 `dependencies` 只留宿主侧用的包（`js-yaml`、`undici`）。

## 图表渲染：包内 chunk

图表由 **ECharts 6.1.0**（Apache-2.0，含 zrender BSD-3-Clause）绘制，作为**包内懒加载 chunk** 交付：

- 浏览器半边用 `require.async('./client.echarts.js')` 请求；客户端模块系统按
  `/plugins/dsh-token-chart/client.echarts.js?rev=<client.js 的 rev>` 取文件（gzip + immutable 缓存），
  首次画图时才下载，**页面启动不受影响**（`client.js` 仍是 67 KB / gzip 19 KB）。
- chunk 自注册为 `window.__ModuleLoader__.load({ id: 'dsh-token-chart', chunk: 'client.echarts.js', factory })`；
  `id` 是**客户端条目 id（包名）**，模块系统据此登记为 `dsh-token-chart/client.echarts.js`——正是 `require.async` 查的键。
  `chunk/build.mjs` 会在写盘后断言这三个字段，写错即构建失败。
- chunk 必须自包含：只有平台种子（`react` 等）与兄弟 chunk 可用，其它裸包名在浏览器里无法解析。
- 体积：**619 KB / gzip 240 KB**（树摇后保留 ECharts 核心、柱/折线/饼三种系列、grid/tooltip/legend/dataZoom 与 SVG 渲染器；完整 dist 是 1.12 MB / 436 KB）。
- 主题：ECharts 需要具体颜色，插件用 `getComputedStyle` 读 `--dsw-alias-*` token 并在明暗切换时重绘。
- 降级：chunk 拉取失败（离线 profile、请求被拦、产物损坏）时自动回退到内置自绘 SVG 渲染器，
  界面上不再显示渲染引擎，降级时仅在控制台给出告警。

重新构建 chunk：

```sh
npm install            # 安装 devDependencies（echarts + esbuild，仅构建需要）
npm run build:chunk    # 产出 client.echarts.js 并打印体积与自检结果
```

> 注意：chunk 的 URL 版本号跟随**入口 `client.js`** 的 rev，因此每次改动 `client.js`（开发热更新、插件升级）
> 都会让浏览器重新拉取这个 chunk，即使 chunk 本身没变。要避免，可把 vendor 文件改由插件自己的 Host 路由
> 以内容哈希做 immutable 缓存——代价是脱离模块系统统一的加载与失效语义。

## 样式：Tailwind + Less，独立 CSS 文件

样式不再内联在 `client.js` 里，而是编译成一份真实的样式表：

```
src/client/styles/tokens.less      设计 token 的 Less 变量（值仍是产品的 CSS 自定义属性）
src/client/styles/components.less  组件规则（dtc- 前缀命名空间）
src/client/styles/index.less       Less 入口
src/client/styles/tailwind.css     Tailwind 入口（theme + utilities，显式类名清单）
        ↓ npm run build:styles
client/token-chart.css             产物：13 KB / 3.5 KB(gz)
        ↓ 宿主以文件形式下发
GET /token-chart/assets/token-chart.css
        ↓ 浏览器半边引用
<link rel="stylesheet" href="/token-chart/assets/token-chart.css">   （客户端只插入 link，卸载时移除）
```

三个刻意的取舍，都是因为插件在**别人的页面**里：

1. **不引入 Tailwind 的 preflight**。preflight 是全局 reset，插件绝不能改产品的基础样式；入口只 `@import` theme 与 utilities 两层。
2. **关闭 Tailwind 的自动扫描，改用 `@source inline(...)` 列出用到的工具类**。扫描仓库会把注释与文档里的普通单词（`block`、`table`、`hidden`）当成类名，生成一批全局规则。
3. **组件规则用 `dtc-` 前缀，工具类留在 `@layer utilities`**。CSS 级联层里，分层样式的优先级低于产品自身的无层样式，因此插件即使与产品撞名也不会覆盖产品。

职责划分：**Tailwind 负责布局类工具**（分页栏、间距/对齐/排版等），**Less 负责有语义的组件**（卡片、图表容器、抽屉、设置行），两者编译进同一份产物。

## 数据来源

Host 半边订阅 `session/event`，按 `@deepseek-ai/dsh-token-meter` 的 `tokenUsage` 投影语义折叠用量：
`assistant/message` / `assistant/attempt` 贡献其 stream 中最后一个 `usage` 分片；同一槽位的重复采样是替换而非累加；
`llm/retry-started` 打开新槽位，因此重试的尝试会再次计费。激活时会后台回填最近若干会话的历史日志，使「今天」
在安装当刻即完整。

**折叠是幂等的。** 每个 `(轮次, 步骤, 重试世代)` 各存一份桶值（重试世代用 `llm/retry-started` 事件的 `seq` 作键，
因此重放同一份日志得到同一组槽位），于是「先实时收了一段、再被回填重放整份日志」不会重复计数——这正是
早期版本虚高约 4.7 倍的原因（当时只保留一个替换槽，每次插件重载都会把每一步再加一遍）。存储 schema 版本不符时
直接丢弃并从会话日志重建：日志才是唯一事实来源。

**会话总量是一次会话级折叠**，而不是把逐轮数字相加——两者数值相等（同一组槽位），但语义由数据层定义，展示层
不能改写它。运行时还会与产品自身的 `tokenUsage` 投影交叉校验，接口返回 `crossCheck`，抽屉在两者不一致时显式提示。

**口径提醒**：这里的「总 Token」采用计费口径——每次请求的上下文（含缓存重读）都计入，所以一个上下文约 1.5M
的会话跑 350 步会得到约 150M，这正是 DSH 产品内「用量」的含义；它不是「上下文大小」。

## 版本与更新

设置页标题行显示 `插件名 · 包名 · v0.1.0`，并在打开时自动向 profile 的 registry 查询最新版本（Host 侧缓存 30 分钟，超时 12 秒）：

- 有新版本时，版本右侧出现「更新版本」按钮；点击后由 `ctx.pluginManager.installBundle('<包名>@<最新版>')` 执行与 `dsh plugin add` 相同的安装与激活流程，结果回填到同一行。
- 插件由本地目录挂载（本机就是这种：patch 行 + 软链，profile 依赖里没有包名）时，按钮不会出现自动安装，而是返回 `local-install` 与确切命令——本地检出应在源码处更新。
- 包未发布到 registry 时状态为 `unpublished`，只显示版本号，不会给出误导性的更新按钮。

`/token-chart/api/version` 返回 `{ name, version, registry, status, latest, updateAvailable, install, run }`；
`POST /token-chart/api/update` 触发一次更新（`up-to-date` / `local-install` / `already-running` / `no-plugin-manager` 为可预期状态）。

## HTTP API

| 方法 | 路径                                            | 说明                                                      |
| ---- | ----------------------------------------------- | --------------------------------------------------------- |
| GET  | `/token-chart/api/health`                       | 采集器状态                                                |
| GET  | `/token-chart/api/prefs`                        | 读取配置                                                  |
| POST | `/token-chart/api/prefs`                        | 保存配置补丁                                              |
| GET  | `/token-chart/api/overview?range=today\|3d\|7d` | 区间统计（按天分桶 + 今天逐轮明细）                       |
| GET  | `/token-chart/api/session?sessionId=…`          | 单会话逐轮用量                                            |
| GET  | `/token-chart/api/version`                      | 插件版本、registry 最新版与更新状态                       |
| POST | `/token-chart/api/update`                       | 触发一次版本更新（受安装方式与 pluginManager 可用性约束） |
| POST | `/token-chart/api/reset`                        | 清空本地用量库                                            |

## 工程结构

源码全部是 TypeScript（浏览器半边用 TSX + JSX），构建产物按 DSH 的包契约发布：

```
src/                     源码（唯一事实来源）
  index.ts               宿主半边入口（Cordis 插件）
  store.ts               用量折叠（按 (轮次, 步骤, 重试世代) 的槽位，幂等）
  buckets.ts prefs.ts paths.ts constants.ts types.ts update.ts
  chunk/echarts.entry.ts ECharts chunk 入口（tree-shaken）
  client/                浏览器半边，按 dsh-market 的扁平模块组织
    styles/              Tailwind + Less 源文件 → client/token-chart.css
    index.tsx            入口：注册各座位 + 拦截「用量」胶囊
    api.ts               偏好存储与轮询 hooks
    charts.tsx           内置 SVG 回退图（chunk 不可用时）
    mount.tsx            ECharts 挂载：懒加载 chunk、主题 token、option
    series.tsx table.tsx ui.tsx drawer.tsx panel.tsx settings.tsx
    chrome.tsx pill.tsx styles.ts contract.ts models.ts format.ts locales.ts react.ts
lib/                     宿主半边产物（tsc 输出 + lib/types/*.d.ts）
client/                  浏览器半边产物
  client.js              esbuild 打包的 __ModuleLoader__ 工厂（不含任何 CSS 文本）
  client.echarts.js      包内懒加载 chunk
  token-chart.css        Tailwind + Less 编译出的样式表，由宿主路由下发
scripts/                 build-client.mjs / build-chunk.mjs / client-contract.mjs
tests/                   vitest 用例
  host.test.mjs          宿主半边：折叠、存储、API、版本检查、配置持久化
  client.test.mjs        浏览器半边：座位注册、图表、表格分页、设置页、抽屉
  client-degraded.test.mjs  chunk 不可用时的内置渲染器
  support/               两个夹具与断言辅助（自带 jsdom 窗口，按需加载产物）
```

技术栈与 dsh-market 对齐：**TypeScript + ESM + React 18（JSX，automatic runtime）**，`react` / `react/jsx-runtime` 作为平台种子保持 external，由加载器的模块表在运行时提供；宿主半边 `tsc` 编译，浏览器半边 `esbuild` 打包成 DSH 客户端模块契约的 CJS 工厂（`window.__ModuleLoader__.load({ id, factory })`）。

| 命令                | 作用                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | 两个项目分别类型检查（宿主 + 浏览器）                                                                             |
| `npm run build`     | `build:host`(tsc → lib/) + `build:client`(esbuild → client/client.js) + `build:chunk`(→ client/client.echarts.js) |
| `npm run test`      | 宿主与浏览器用例（浏览器用例在 jsdom 中驱动真实构建产物）                                                         |
| `npm run format`    | prettier 格式化 `src/**` 与脚本                                                                                   |

`package.json` 的 `main` 指向 `lib/index.js`，`exports["./client"]` 指向 `client/client.js`——与 dsh-market 相同。改动宿主半边后由 profile 的 hmr 监听根热重载；改动**客户端产物路径**（本次重构即属此类）需要重启应用一次，DSH 对「替换已安装包」的既有语义如此。

> 注：根目录下的 `client.js` / `client.echarts.js` 是重构前的旧产物，仅供本次重启前的当前页面继续使用，重启后可删除。

## 开发：Host 半边热加载

浏览器半边由 client-hmr 按产物 mtime 自动热替换；Host 半边默认不重载源码（profile 的 `dsh-hmr` 通常 `root: []`）。
把插件目录加进 hmr 的监听根即可让 Host 改动也即时生效（无需重启应用）：

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root:
      - /Users/bytedance/own/dsh-token-chart
```

## 安装

```sh
dsh plugin --profile <profile> add /Users/bytedance/own/dsh-token-chart
```

或在 Harness 中通过 `plugin_manager` 的 `install_bundle`，target 为该包的绝对目录。

## 验证

```sh
# Host 半边：折叠语义、跨天分桶、配置校验、落盘（需要 Node 20+）
DSH_HOME=$(mktemp -d) npm run test:host

# 浏览器半边：jsdom + React 18 加载真实 client.js，通过 HTTP 连运行中的 Harness。
# 它会按模块系统的语义执行真实 chunk 产物、捕获其 __ModuleLoader__ 注册、以
# <entry>/<file> 键调用工厂，因此“chunk 注册键写错”在这里就会失败。
# 结束时会在子进程里再跑一遍“chunk 不可用”的降级用例。
DSH_ORIGIN=http://127.0.0.1:19387 npm run test:client
```

`client.test.mjs` 需要 `react`/`react-dom` 18 与 `jsdom`；默认从 npx 缓存目录解析，可用 `REACT_DIR` / `JSDOM_DIR` 覆盖。
jsdom 没有 canvas 与布局，脚本会补 `HTMLCanvasElement.getContext`（文本测量）与 `clientWidth`，浏览器端不需要这些垫片。

<small>注：`test/host.test.mjs` 必须用独立的 `DSH_HOME` 运行，否则会写入真实用量库。</small>
