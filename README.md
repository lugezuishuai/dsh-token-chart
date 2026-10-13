# dsh-token-chart

一个 **DeepSeek Harness** 插件：把本机会话的 Token 用量采集下来，以图表与统计的形式放回你正在用的界面里——会话抽屉、每日面板、可自由配置的图表形式。交互参考 DSH 产品自带的「用量」，数据口径与它一致（计费口径，含缓存重读）。

![dsh](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.0--rc.2-1c3c3c.svg)
![node](https://img.shields.io/badge/node-%E2%89%A5%2020-339933.svg)
![license](https://img.shields.io/badge/license-MIT-007ec6.svg)

## 🚀 快速开始

```bash
dsh plugin --profile web add dsh-token-chart
```

> 安装的是发布时预构建好的产物（`lib/` 已构建好），在你的机器上不执行任何构建脚本；用量数据全部留在本机，不上报任何遥测。装好之后怎么用见 [使用指南](#-使用指南)。

## 📖 使用指南

### 三个入口

| 位置 | 入口 | 内容 |
| --- | --- | --- |
| 左侧边栏 | 「Token 用量」菜单 | 今天 / 近 3 天 / 近 7 天 / 近 30 天：KPI 卡片 + 趋势图 + 分页表格 |
| 会话标题栏 | 「用量」小按钮（与 ⋯ 菜单同一行，**常驻**） | 右侧边栏抽屉：总 Token、输入/输出、缓存读取/写入、命中率、轮次、模型 + 逐轮趋势图 |
| 设置页 | 设置 →「Token 用量」 | 图表形式、展示指标、开关；标题行含插件版本与「更新版本」按钮 |

页面上会出现三个「用量」入口，它们彼此独立，各由不同的东西控制：

| 你看到的「Token 用量」 | 由什么控制 |
| --- | --- |
| 消息底部 / 输入框上方的「用量」胶囊 | 产品自身的组件；插件只拦截点击，把它改成打开本抽屉（开关：**拦截产品用量按钮**） |
| 会话标题栏右上角的小按钮 | 本插件注册在 `conversation.session.header.utilities` 的入口，**常驻显示**（不设开关） |
| 右侧边栏的标签页标题 | 本插件的 `sidebar.right.pane.tab.title` 座位，**不受**上面那个开关影响 |

### 图表形式与交互

图表形式有 7 种：柱状、折线、饼图、表格、多柱状、多折线、柱状折线组合，会话抽屉与每日面板可以分别配置。

- **缓存命中率叠加**：柱状 / 折线 / 多柱状 / 多折线 / 组合图都可在右轴叠加一条命中率折线（默认开）。
- **范围选择条**：坐标轴下方的 dataZoom，拖动两端或中间窗口即可只看某一段 x 范围（滚轮与触控板捏合同样生效）。缩放只改变可见窗口，不改统计口径——数据表、KPI 卡片与总量始终是完整区间的值。
- **分页数据表**：默认每页 20 条，页大小用下拉切换（10 / 20 / 50），页码为数字按钮 + 省略号（`1 … 4 5 [6] 7 8 … 50`），整条分页栏常驻右下角。切换页大小或数据变化会回到第一页。

x 轴按视图区分，口径如下：

| 视图 | x 轴 | 一个点是什么 |
| --- | --- | --- |
| 每日面板「今天」 | 时间 `HH:mm`（同分钟多轮自动补到 `HH:mm:ss`） | 一轮的用量 |
| 每日面板「近 3 / 7 / 30 天」 | 日期 | 一天 |
| 会话抽屉 | `#轮次` | 会话内的一轮 |

### 配置

配置在**设置 →「Token 用量」**里改，落盘到 `$DSH_HOME/storages/dsh-token-chart/prefs.json`（默认 `~/.dsh/...`）。

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

### 数据与口径

- 数据目录：`$DSH_HOME/storages/dsh-token-chart/`（默认 `~/.dsh/storages/dsh-token-chart/`），`usage.json` 是用量库，`prefs.json` 是界面偏好。
- **只保留最近 30 个自然日**，更早的轮次在每次落盘前滚动丢弃（超出窗口的会话会被整条移除）。
- **幂等采集**：按 `(轮次, 步骤, 重试世代)` 存槽位，重放会话日志不重复计数；存储 schema 不符时丢弃并从日志重建。
- **会话总量**取会话级折叠，而不是把逐轮数字相加；运行时还会与产品的 `tokenUsage` 投影交叉校验，不一致时抽屉里会显式提示。
- **口径提醒**：这里的「总 Token」是计费口径——每次请求的上下文（含缓存重读）都计入，所以一个约 1.5M 上下文的会话跑 350 步会得到约 150M；它不是「上下文大小」。
- **网络**：唯一的出网行为是版本检查（profile 的 `.npmrc` registry，缺省 `https://registry.npmmirror.com/`，宿主侧缓存 30 分钟、超时 12 秒）；用量数据只写本机。

### 进阶：用 HTTP API 读写

宿主半边在 Harness 的 web server 上提供这些路由（`/token-chart/api` 前缀），脚本与外部工具可以直接用：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/token-chart/api/health` | 采集器状态（保留天数、已跟踪会话数、偏好是否加载、回填是否完成） |
| GET | `/token-chart/api/prefs` | 读取配置（含默认值） |
| POST | `/token-chart/api/prefs` | 保存配置补丁 |
| GET | `/token-chart/api/overview?range=today\|3d\|7d\|30d` | 区间统计（按天分桶 + 今天逐轮明细；未知区间回退到 `today`） |
| GET | `/token-chart/api/session?sessionId=…` | 单会话逐轮用量 |
| GET | `/token-chart/api/version` | 插件版本、registry 最新版与更新状态 |
| POST | `/token-chart/api/update` | 触发一次版本更新 |
| POST | `/token-chart/api/reset` | 清空本地用量库 |

改配置（补丁式，只写要改的键）：

```bash
curl -s -X POST http://127.0.0.1:19387/token-chart/api/prefs \
  -H 'content-type: application/json' \
  -d '{"dailyChart":"bar-line","showCacheHitRate":false}'
```

## ✨ 特性

- **会话抽屉**：单个会话的逐轮用量趋势 + 文字统计，从会话标题栏一键打开。
- **每日面板**：今天 / 近 3 天 / 近 7 天 / 近 30 天四个区间，KPI + 趋势图 + 数据表。
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

发布也可以交给 CI：[.github/workflows/release.yml](.github/workflows/release.yml) 在**推送到 main**（含 PR 合并）与**手动触发**时运行——跑门禁 → 版本还不在 npm 上就自动发布、打 `v<version>` tag、建 GitHub Release；版本已存在则只跑门禁。认证走 **npm Trusted Publishing（OIDC）**，仓库里不存任何 npm token；预发布版本按 preid 走独立 dist-tag（`0.1.1-rc.1` → `rc`），不会顶掉 `latest`。

发布流水线要点：

1. **`prepack` = 全量构建 + `scripts/preflight.mjs`**，因此 tarball 一定带着四件产物与 `lib/types`；产物不进 git，`files` 白名单决定包内容。
2. **安装与发布都走 npmjs 源站**：项目 `.npmrc` 与 `package.json#publishConfig.registry` 都指向 `https://registry.npmjs.org/`——镜像是只读的、不接受发布，统一在源站可以让"消费者装到的版本"与"发布出去的版本"始终一致。
3. **preflight 检查**：包名与 loader id 一致（改名事故的护栏）、四件产物存在、`cordis.patch.yml` 按包名插入、`private` 已移除、`engines.dsh` 已声明、lockfile 不含内网/私有 registry。

三种分发方式的产物来源：

| 分发方式 | 产物从哪来 |
| --- | --- |
| npm / tarball | 发布机上的 `prepack` 预构建，消费者零构建 |
| git 安装 | 消费者机器上的 `prepare` 现场构建（需先授权构建脚本） |
| 本地 link | 工作区里的 `lib/`，由你 `npm run build` 产出 |

## 📄 License

MIT © 2026 lugezuishuai. 详见 [LICENSE](./LICENSE)。
