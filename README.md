# dsh-token-chart

一个 **DeepSeek Harness** 插件：把本机会话的 Token 用量采集下来，以图表与统计的形式放回你正在用的界面里——会话抽屉、每日面板、可自由配置的图表形式。交互参考 DSH 产品自带的「用量」，数据口径与它一致（计费口径，含缓存重读）。

![dsh](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.0--rc.2-1c3c3c.svg)
![node](https://img.shields.io/badge/node-%E2%89%A5%2020-339933.svg)
![language](https://img.shields.io/badge/language-TypeScript-3178c6.svg)
![ui](https://img.shields.io/badge/UI-React%2018-61dafb.svg)
![charts](https://img.shields.io/badge/charts-ECharts%206.1-aa344d.svg)
![deps](https://img.shields.io/badge/runtime%20deps-0-44bb00.svg)
![license](https://img.shields.io/badge/license-MIT-007ec6.svg)

> 客户端半边遵循 DSH 的 client 模块契约，包布局与 [dsh-market](https://github.com/dsh-market/dsh-market)、[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 同形：**两个半边同处一个 `lib/`**，浏览器产物自注册为 `window.__ModuleLoader__` 工厂，懒加载 chunk 走 `require.async`。
>
> 开发约束、架构与发布规则详见 [AGENTS.md](./AGENTS.md)。

## 🚀 快速开始

dsh-token-chart 追求「装完即用」——**发布为预构建产物**（`lib/` 在发布时构建好），因此 npm 与 tarball 安装**不需要在你机器上执行任何构建脚本**。装好后数据全部留在本机，不上报任何遥测。

### 方式一：npm 安装（推荐）

```bash
dsh plugin --profile <profile> add dsh-token-chart
```

> 安装的是发布时预构建好的产物，不触发构建脚本，也不需要任何授权。项目 `.npmrc` 把安装指向 `registry.npmmirror.com`。

### 方式二：tarball 安装（离线分发）

```bash
npm pack                                          # 触发 prepack：全量构建 + 产物自检
dsh plugin --profile <profile> add ./dsh-token-chart-0.1.0.tgz
```

> 打包机需要能跑构建（Node ≥ 20）：`prepack` 会重建 `lib/` 并运行 `scripts/preflight.mjs`，因此 tarball 一定带着四件产物与类型声明。

### 方式三：git 安装（源码构建）

```bash
dsh plugin --profile <profile> add github:lugezuishuai/dsh-token-chart#<sha>
```

这条路径会在你的机器上用包的 `prepare` 现场构建。**pnpm ≥10 默认拦截依赖的构建脚本**，第一次 `add` 会失败并打印需要写入的键与值（含 commit sha，要原样照抄）；把它加进该 profile 的 `pnpm-workspace.yaml` 再重试：

```yaml
# ~/.dsh/profiles/<profile>/pnpm-workspace.yaml
allowBuilds: # pnpm ≥11
  dsh-token-chart@git+https://github.com/lugezuishuai/dsh-token-chart#<sha>: true

# onlyBuiltDependencies: # pnpm 10 的等价键
#   - "dsh-token-chart@git+https://github.com/lugezuishuai/dsh-token-chart#<sha>"
```

> 授权意味着**允许该包在你的机器上执行代码**（这里是它的 `prepare` 构建），只对信任的来源授权。建议连同 commit 一起锁定（`#<sha>`）。
>
> **构建环境提醒**：安装期构建跑在 dsh 进程继承到的环境里——图形界面 / launchd / systemd / 开始菜单启动的 dsh **不会**继承你终端的环境。`build:styles` 依赖 tailwind 的原生模块（lightningcss），若该环境的 Node 加载不了原生模块（macOS 上常见于带硬化运行时、签名 Team ID 不匹配的 Node），`prepare` 会失败；此时改用 npm / tarball 方式，或从终端执行安装。

### 方式四：本地 link（开发调试）

```bash
git clone https://github.com/lugezuishuai/dsh-token-chart.git && cd dsh-token-chart
npm install                       # 触发 prepare，产出 lib/
dsh plugin --profile <profile> add "$PWD"
```

> `lib/` 不入 git，所以任何从源码使用的路径都要先构建；改完源码必须 `npm run build` 才生效。

### 装完在哪看

| 位置 | 入口 | 内容 |
| --- | --- | --- |
| 左侧边栏 | 「Token 用量」菜单 | 今天 / 近 3 天 / 近 7 天：KPI 卡片 + 趋势图 + 分页表格 |
| 会话标题栏 | 「用量」小按钮（与 ⋯ 菜单同一行，**常驻**） | 右侧边栏抽屉：总 Token、输入/输出、缓存读取/写入、命中率、轮次、模型 + 逐轮趋势图 |
| 设置页 | 设置 →「Token 用量」 | 图表形式、展示指标、开关；标题行含插件版本与「更新版本」按钮 |

### 什么时候需要重启

- 改插件**代码并重建产物**（路径不变）→ 不需要重启，最多硬刷新一次：宿主半边由 `dsh-hmr` 按产物 mtime 热重载，浏览器半边由 client-hmr 按 `mtime/ctime/size` 派生 rev 热替换。
- 改**客户端产物路径**、或新装 / 升级 / 卸载插件 → 需要重启 DSH 一次（client-modules 的包元数据按 Loader specifier 缓存至重启）。

## ✨ 特性

- **会话抽屉**：单个会话的逐轮用量趋势 + 文字统计，从会话标题栏一键打开。
- **每日面板**：今天 / 近 3 天 / 近 7 天三个区间，KPI + 趋势图 + 数据表。
- **7 种图表形式**：柱状、折线、饼图、表格、多柱状、多折线、柱状折线组合，会话与面板可分别配置。
- **缓存命中率叠加**：柱状 / 折线 / 多柱状 / 多折线 / 组合图都可在右轴叠加命中率折线（默认开）。
- **范围选择条**：坐标轴下方的 dataZoom，拖动只看某一段 x 范围；缩放不改变统计口径（KPI、总量、表格始终是完整区间）。
- **分页数据表**：默认 20 条/页，页大小 10 / 20 / 50 下拉切换，页码为数字按钮 + 省略号，常驻右下角。
- **接管产品「用量」胶囊**：点击改为打开本插件抽屉，而不是产品自带的对话框（可关）。
- **口径与产品一致**：总 Token 采用计费口径（每次请求的上下文含缓存重读都计入）；运行时与产品的 `tokenUsage` 投影交叉校验，不一致会在抽屉里显式提示。
- **幂等采集**：按 `(轮次, 步骤, 重试世代)` 存槽位，重放会话日志不重复计数；存储 schema 不符时丢弃并从日志重建。
- **降级可用**：ECharts chunk 拉取失败（离线、被拦、产物损坏）时自动回退到内置自绘 SVG，界面不会空掉。
- **零运行时依赖**：宿主半边不 import 任何 `@deepseek-ai/*`，浏览器半边只把 react 平台种子留作 external，安装不需要 peer 解析或共享实例授权。
- **懒加载图表库**：启动只需 ~70 KB 的 `client.js`（gzip 20 KB），首次出图才拉 618 KB 的 ECharts chunk（gzip 234 KB）。
- **可热更新**：设置页自动查一次新版本（30 分钟缓存），有新版时给出「更新版本」按钮，走 `ctx.pluginManager.installBundle`。

## 📊 图表与 x 轴口径

| 视图 | x 轴 | 一个点是什么 |
| --- | --- | --- |
| 每日面板「今天」 | 时间 `HH:mm`（同分钟多轮自动补到 `HH:mm:ss`） | 一轮的用量 |
| 每日面板「近 3 天 / 近 7 天」 | 日期 | 一天 |
| 会话抽屉 | `#轮次` | 会话内的一轮 |

> 早先「今天」用的是数据点序号（1、2、3…），会被读成轮次并与表格的「轮次」列对不上，现已改为真实时间。

## 🖱 三个「用量」入口各由谁控制

| 你看到的「Token 用量」 | 由什么控制 |
| --- | --- |
| 消息底部 / 输入框上方的「用量」胶囊 | 产品自身的组件；插件只拦截点击，把它改成打开抽屉（开关：**拦截产品用量按钮**） |
| 会话标题栏右上角的小按钮 | 本插件注册在 `conversation.session.header.utilities` 的入口，**常驻显示**（不设开关） |
| 右侧边栏的标签页标题 | 本插件的 `sidebar.right.pane.tab.title` 座位，**不受**上面那个开关影响 |

## ⚙️ 配置

配置在**设置 →「Token 用量」**里改，落盘到 `$DSH_HOME/storages/dsh-token-chart/prefs.json`（默认 `~/.dsh/...`）。也可以通过 HTTP API 打补丁（见下）。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `sessionChart` | 枚举 | `multi-bar` | 会话抽屉的图表形式 |
| `dailyChart` | 枚举 | `multi-bar` | 每日面板的图表形式 |
| `sessionMetrics` | 数组 | `["input","output","cache","total"]` | 会话抽屉展示的指标 |
| `dailyMetrics` | 数组 | `["input","output","cache","total"]` | 每日面板展示的指标 |
| `showTable` | 布尔 | `true` | 图表下方是否渲染数据表 |
| `showCacheHitRate` | 布尔 | `true` | 组合图是否叠加缓存命中率折线 |
| `interceptUsageButton` | 布尔 | `true` | 点击产品「用量」胶囊时打开本插件抽屉 |

枚举值：`bar` / `line` / `pie` / `table` / `multi-bar` / `multi-line` / `bar-line`；指标值：`input` / `output` / `cache` / `total`。非法值会被 `normalizePrefs()` 丢弃并回退到默认，不会让界面挂掉。

用 API 改配置（补丁式，只写要改的键）：

```bash
curl -s -X POST http://127.0.0.1:19387/token-chart/api/prefs \
  -H 'content-type: application/json' \
  -d '{"dailyChart":"bar-line","showCacheHitRate":false}'
```

## 🔌 HTTP API

宿主半边在 Harness 的 web server 上提供这些路由（`/token-chart/api` 前缀），浏览器半边只通过这些接口取数：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/token-chart/api/health` | 采集器状态（保留天数、已跟踪会话数、偏好是否加载、回填是否完成） |
| GET | `/token-chart/api/prefs` | 读取配置（含默认值） |
| POST | `/token-chart/api/prefs` | 保存配置补丁 |
| GET | `/token-chart/api/overview?range=today\|3d\|7d` | 区间统计（按天分桶 + 今天逐轮明细） |
| GET | `/token-chart/api/session?sessionId=…` | 单会话逐轮用量 |
| GET | `/token-chart/api/version` | 插件版本、registry 最新版与更新状态 |
| POST | `/token-chart/api/update` | 触发一次版本更新 |
| POST | `/token-chart/api/reset` | 清空本地用量库 |
| GET | `/token-chart/assets/token-chart.css` | 编译好的样式表（浏览器半边用 `<link>` 引它） |

## 🧰 真实响应示例

下面是从一个运行中的 Harness 上抓的真实返回（为便于阅读删去了部分字段与数组元素）。

`GET /token-chart/api/health`：

```json
{ "ok": true, "package": "dsh-token-chart", "retentionDays": 7, "sessions": 9, "prefsLoaded": true, "backfill": true }
```

`GET /token-chart/api/overview?range=3d`：

```json
{
  "ok": true,
  "value": {
    "range": "3d",
    "days": 3,
    "retentionDays": 7,
    "totals": {
      "input": 246371, "output": 461639, "cacheRead": 196140544, "cacheWrite": 0,
      "cache": 196140544, "total": 196848554, "cacheHitRate": 0.9987454815917852,
      "turns": 21, "sessions": 2
    },
    "buckets": [
      { "key": "2026-10-09", "label": "10-09", "turns": 7, "sessions": 2, "input": 135660, "output": 254386,
        "cache": 155394688, "total": 155784734, "cacheHitRate": 0.9991277586545361 },
      { "key": "2026-10-10", "label": "10-10", "turns": 0, "total": 0, "cacheHitRate": 0 }
    ]
  }
}
```

`GET /token-chart/api/session?sessionId=…`：

```json
{
  "ok": true,
  "value": {
    "sessionId": "session-427622bf-…",
    "turns": [
      { "turn": 1, "label": "21:31", "routes": ["deepseek-account/deepseek-flash"],
        "input": 281504, "output": 156348, "cacheRead": 38603392, "cache": 38603392,
        "total": 39041244, "cacheHitRate": 0.992760582412256 }
    ]
  }
}
```

## 💾 数据存储与统计口径

- 目录：`$DSH_HOME/storages/dsh-token-chart/`（默认 `~/.dsh/storages/dsh-token-chart/`）
- `usage.json`：用量库，**只保留最近 7 个自然日**，7 天前的轮次在每次落盘前裁掉
- `prefs.json`：界面偏好
- 采集方式：订阅 `session/event`，按 `assistant/message` / `assistant/attempt` 的最后一个 `usage` 分片记账，`llm/retry-started` 打开新槽位（重试会再次计费）；激活时后台回填最近若干会话，使「今天」在安装当刻即完整
- **幂等**：每个 `(轮次, 步骤, 重试世代)` 各存一份桶值，重放同一份日志得到同一组槽位——「先实时收一段、再被回填重放整份日志」不会重复计数
- **会话总量**取会话级折叠，而不是逐轮数字相加；两者数值相等，但语义由数据层定义，展示层不改写
- **口径提醒**：这里的「总 Token」是计费口径——每次请求的上下文（含缓存重读）都计入，所以一个约 1.5M 上下文的会话跑 350 步会得到约 150M；它不是「上下文大小」
- **网络**：唯一的出网行为是版本检查（profile 的 `.npmrc` registry，缺省 `https://registry.npmmirror.com/`，宿主侧缓存 30 分钟、超时 12 秒）；用量数据只写本机，没有任何遥测

## 🎨 工程取舍

**为什么 ECharts 必须打包进产物**：浏览器半边的 `require` 只能解析加载器模块表里的平台种子（`react` 等），Node 侧的 `node_modules` 到不了页面。所以 ECharts 只能构建期打进产物：

| 形态 | 产物 | 代价 |
| --- | --- | --- |
| 包内 chunk（当前） | `lib/client.echarts.js`，`require.async` 按需加载 | 首次出图多一次 234 KB(gz) 请求；启动路径 20 KB |
| 内联进 client.js | 单文件 ~700 KB 原始 / 257 KB(gz) | 每次打开页面都要下整包，哪怕从不看图 |

**样式为什么是独立文件**：Tailwind + Less 编译成 `lib/token-chart.css`，由宿主以真实文件下发（`ETag` 复验），浏览器半边只插一个 `<link>`——样式改动不会让 JS bundle 失效。三个刻意的取舍都因为插件活在**别人的页面**里：

1. **不引入 Tailwind preflight**（全局 reset 绝不能改产品的基础样式），入口只 `@import` theme 与 utilities 两层。
2. **关闭自动扫描，改用 `@source inline(...)` 白名单**，避免把注释与文档里的普通单词（`block`、`table`）当成类名生成全局规则。
3. **组件类一律 `dtc-` 前缀，工具类留在 `@layer utilities`**，分层样式优先级低于产品无层样式，撞名也不会覆盖产品。

**为什么 chunk 自注册**：`lib/client.echarts.js` 自注册为 `{ id: 'dsh-token-chart', chunk: 'client.echarts.js' }`，模块系统据此把键记成 `dsh-token-chart/client.echarts.js`——正是 `require.async` 查的键。构建脚本会在写盘后断言这三个字段，写错即构建失败。

## 🛠 本地开发与调试

源码全部是 TypeScript（浏览器半边 TSX + JSX automatic runtime）；`src/` 是唯一事实来源，**一切产物落在 `lib/` 且不入 git**。

```bash
git clone https://github.com/lugezuishuai/dsh-token-chart.git && cd dsh-token-chart
npm install              # 触发 prepare：全量构建出 lib/
npm run typecheck        # 两个工程分别类型检查（宿主 + 浏览器）
npm run build            # 清空 lib/ 后全量重建
npm run check            # 发布门禁：typecheck + build + preflight + 宿主用例
```

| 命令 | 作用 |
| --- | --- |
| `npm run build:host` / `:styles` / `:client` / `:chunk` | 单独重跑某一段（tsc / tailwind+less / esbuild / esbuild） |
| `npm run preflight` | 产物与元数据自检：loader id、包名、四件产物、registry、lockfile |
| `npm run test:host` | 宿主套件：折叠语义、跨天分桶、配置校验、落盘、版本检查 |
| `npm run test:client` | 浏览器套件：jsdom 加载**真实产物**，通过 HTTP 连**运行中的** Harness |
| `npm run format` | prettier：`src/**`、`tests/**`、`scripts/**` |

调试期建议隔离数据目录，避免污染真实用量库：

```bash
DSH_HOME=$(mktemp -d) npm run test:host     # 宿主用例必须用独立 DSH_HOME

# 浏览器用例需要运行中的 Harness（默认 http://127.0.0.1:19387）与一个真实会话 id
DSH_ORIGIN=http://127.0.0.1:19387 DSH_SESSION_ID=<session-id> npm run test:client
```

| 环境变量 | 作用 | 默认 |
| --- | --- | --- |
| `DSH_HOME` | 数据根目录（`usage.json` / `prefs.json` 在其下） | `~/.dsh` |
| `DSH_ORIGIN` | 浏览器用例连接的 Harness 地址 | `http://127.0.0.1:19387` |
| `DSH_SESSION_ID` | 浏览器用例打开的会话 | 内置一个示例 id |
| `REACT_DIR` / `JSDOM_DIR` | 用例解析 `react` / `jsdom` 的目录 | npx 缓存目录 |

> 浏览器用例会在跑前快照、跑后恢复你的真实偏好；jsdom 没有 canvas 与布局，脚本会补 `HTMLCanvasElement.getContext` 与 `clientWidth` 垫片，浏览器端不需要。

让宿主半边也热加载（默认只热替换浏览器半边）：把插件目录加进 profile 的 hmr 监听根，改 `src/**` 重建后即时生效，无需重启。

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root:
      - /path/to/dsh-token-chart
```

> 构建请用你自己的 Node（本机为 `~/.nvm/versions/node/v22.22.0`）。DSH 自带的 Node 在 macOS 上无法 dlopen tailwind 的 `lightningcss` 原生模块，`build:styles` 会失败。

## 📦 构建与发布

构建产物与 DSH 包契约一一对应，全部落在 `lib/`：

| 产物 | 生成方式 | 被谁读 |
| --- | --- | --- |
| `lib/index.js` + `lib/*.js` | `tsc`（`package.json#main`） | DSH 宿主进程 |
| `lib/types/*.d.ts` | `tsc`（`package.json#types`） | 消费方类型检查 |
| `lib/client.js` | `esbuild` → `__ModuleLoader__` CJS 工厂（**不压缩**，逐行可审阅） | 浏览器（`exports["./client"]`） |
| `lib/client.echarts.js` | `esbuild` → 压缩、自包含的懒加载 chunk | 浏览器（`require.async`） |
| `lib/token-chart.css` | `tailwindcss` + `lessc` | 浏览器（宿主路由下发） |

```bash
npm run check            # 发布门禁：typecheck + build + preflight + 宿主用例
npm pack                 # prepack 自动重建 + preflight，然后打包
npm version patch        # 版本号即 tag，更新检查按版本号比较，两者务必一致
npm publish              # publishConfig 固定发往 registry.npmjs.org
```

发布流水线要点：

1. **`prepack` = 全量构建 + `scripts/preflight.mjs`**，因此 tarball 一定带着四件产物与 `lib/types`；产物不进 git，`files` 白名单决定包内容。
2. **安装与发布走不同 registry**：项目 `.npmrc` 把**安装**指向 `registry.npmmirror.com`（国内镜像），**发布**由 `package.json#publishConfig.registry` 固定在 `https://registry.npmjs.org/`——npmmirror 是只读镜像，不接受发布。
3. **preflight 检查**：包名与 loader id 一致（改名事故的护栏）、四件产物存在、`cordis.patch.yml` 按包名插入、`private` 已移除、`engines.dsh` 已声明、lockfile 不含内网/私有 registry。

三条安装通道的产物来源：

| 通道 | 产物从哪来 |
| --- | --- |
| npm / tarball | 发布机上的 `prepack` 预构建，消费者零构建 |
| git | 消费者机器上的 `prepare` 现场构建（需授权，见 [方式三](#方式三git-安装源码构建)） |
| 本地 link | 工作区里的 `lib/`，由你 `npm run build` 产出 |

## 📄 License

MIT © 2026 lugezuishuai. 详见 [LICENSE](./LICENSE)。
