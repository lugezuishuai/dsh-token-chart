# dsh-token-chart — Agent 指南

> 面向在本仓库工作的 agent 与协作者：**动手前必须知道的事**都在这里。
> 面向用户的安装、功能与配置说明在 [README.md](README.md)；两处冲突时以本文的约束为准。

---

## 1. 这是什么

DeepSeek Harness（DSH）插件：采集本机会话的 provider 上报用量，做图表与统计展示。

| 用户可见入口 | 座位 | 内容 |
| --- | --- | --- |
| 会话标题栏「用量」按钮 / 消息底部「用量」胶囊 | `conversation.session.header.utilities` | 右侧边栏抽屉：文字统计 + 逐轮趋势图 |
| 左侧边栏「Token 用量」 | `sidebar.panellist` + `main` | 今天 / 近 3 天 / 近 7 天：KPI + 趋势图 + 分页表格 |
| 设置 →「Token 用量」 | `settings.section` | 图表形式、指标与开关；插件版本与更新按钮 |

- **零运行时依赖**：宿主半边不 import 任何 `@deepseek-ai/*`；浏览器半边的 external 只有 react 平台种子。安装不需要 peer 解析。
- 数据只落本机：`~/.dsh/storages/dsh-token-chart/usage.json`（7 个自然日滚动），偏好另存 `prefs.json`。
- 唯一出网行为是版本检查（profile 的 `.npmrc` registry，缺省 `https://registry.npmmirror.com/`，宿主侧缓存 30 分钟）。

---

## 2. 技术栈

| 层 | 选型 |
| --- | --- |
| 语言 | TypeScript（宿主）+ TSX/JSX automatic runtime（浏览器），全 ESM |
| 宿主半边 | `tsc` → `lib/**`（含 `lib/types/*.d.ts`） |
| 浏览器半边 | `esbuild` → `lib/client.js`（CJS `__ModuleLoader__` 工厂，**不压缩**，逐行可审阅） |
| 懒加载 chunk | `esbuild` → `lib/client.echarts.js`（压缩，自包含，ECharts 6.1.0 树摇后 ≈618 KB / gzip 234 KB） |
| 样式 | Tailwind v4（只 theme + utilities，`@source inline(...)` 白名单）+ Less（`dtc-` 前缀组件）→ `lib/token-chart.css` |
| 测试 | vitest 两个 project：`host`（假 Cordis ctx，纯 Node）、`client`（jsdom + React 18 + 活宿主 API） |
| 运行时要求 | Node ≥20（`engines.node`）；**构建建议 Node ≥22.22.2**（jsdom 30 的实际下限） |
| DSH 基线 | `engines.dsh: ">=0.2.0-rc.2"`（仅声明，安装器不强制校验） |

---

## 3. 硬约束（违反即坏）

1. **`src/` 是唯一事实来源；`lib/` 是产物且不入 git**（`.gitignore`）。**永远不要手改 `lib/` 下任何文件**，下一次 `npm run build` 会覆盖它。
2. **所有产物只能落在 `lib/`**。当前四件 + 类型：`lib/index.js`、`lib/client.js`、`lib/client.echarts.js`、`lib/token-chart.css`、`lib/types/**`。新增产物要同步改三处：构建脚本的 `OUT`、`package.json#files`、`scripts/preflight.mjs` 的 `artifacts` 清单。
3. **浏览器半边不得 import 宿主代码或 Node 内建**。可用模块只有平台种子（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`）与包内 chunk；`scripts/build-client.mjs` 会断言产物里没有别的裸 `require`。
4. **chunk 必须自包含并自注册**为 `id: '<包名>'` + `chunk: 'client.echarts.js'`；不许同步 require 兄弟 `client*.js`。`scripts/build-chunk.mjs` 与 preflight 都断言这一点。
5. **样式不许引入 Tailwind preflight**（插件活在别人的页面里）；组件类一律 `dtc-` 前缀；工具类必须显式列进 `src/client/styles/tailwind.css` 的 `@source inline(...)` 白名单。
6. **两半边的共享契约只能放** `src/types.ts`、`src/constants.ts`、`src/prefs.ts`，且**不得引用 Node/DOM 全局**（浏览器半边也 import 同一份文件）。
7. **改完源码必须 `npm run build`**。宿主半边由 profile 的 `dsh-hmr` 监听产物 mtime 热重载，浏览器半边由 client-hmr 按产物 mtime 热替换——**不构建等于没改**。
8. **改动客户端产物「路径」需要重启 DSH 一次**（client-modules 的包元数据缓存到重启）；只改内容不用重启，硬刷新即可。
9. **提交前跑 `npm run check`**（typecheck + build + preflight + 宿主用例）。不要提交 `lib/`、`*.tgz`、`node_modules/`。
10. **版本号必须与 git tag 一致**：插件内建更新检查按版本号比较，tag 与 `package.json` 漂移会让用户端的「有新版本」判断出错。
11. **安装与发布都走 npmjs 源站**：项目 `.npmrc` 与 `package.json#publishConfig.registry` 都是 `https://registry.npmjs.org/`。镜像是只读的、不接受发布；不要为了"装得快"把项目 `.npmrc` 改回镜像——那会让本地装到的版本与发出去的版本出现时间差。

---

## 4. 命令

| 命令 | 作用 |
| --- | --- |
| `npm run typecheck` | 两个工程分别类型检查（`tsconfig.json` + `tsconfig.client.json`） |
| `npm run build` | **清空 `lib/` 后全量重建**：`build:host` → `build:styles` → `build:client` → `build:chunk` |
| `npm run build:host` | `tsc` → 宿主半边 + `lib/types` |
| `npm run build:styles` | tailwind + lessc → `lib/token-chart.css` |
| `npm run build:client` | esbuild → `lib/client.js`（含 loader 前缀断言） |
| `npm run build:chunk` | esbuild → `lib/client.echarts.js`（含自注册与自包含断言） |
| `npm run check` | 发布门禁：typecheck + build + preflight + `test:host` |
| `npm run preflight` | 产物与元数据自检（见 §7） |
| `npm run test:host` | 宿主套件：折叠语义、跨天分桶、API、版本检查、落盘 |
| `npm run test:client` | 浏览器套件：**需要活宿主**（见 §8） |
| `npm run test` | 两个 project 串行跑 |
| `npm run clean` | 删除 `lib/` |
| `npm run format` | prettier：`src/**`、`tests/**`、`scripts/**` |
| `npm pack` | 打 tarball（自动触发 `prepack`：全量构建 + preflight） |

**构建必须用你自己的 Node**（本机为 `~/.nvm/versions/node/v22.22.0`）。DSH 自带的 Node 在 macOS 上无法 dlopen tailwind 的 `lightningcss` 原生模块（签名 Team ID 不匹配），`build:styles` 会失败。

---

## 5. 架构

### 5.1 两个半边，一条 HTTP 契约

```
浏览器页面                                   DSH 宿主进程（Node）
┌───────────────────────────────┐            ┌──────────────────────────────────────┐
│ lib/client.js                 │            │ lib/index.js  (Cordis 插件 apply)     │
│  · 注册 5 类座位               │  JSON API  │  · 订阅 session/event 折叠用量        │
│  · 拦截产品「用量」胶囊        │ ─────────► │  · 7 天滚动落盘 usage.json            │
│  · 偏好读写、轮询              │ /token-    │  · GET  /token-chart/api/{health,     │
│ lib/client.echarts.js         │  chart/api │         prefs,overview,session,version}│
│  · require.async 懒加载        │            │  · POST /token-chart/api/{prefs,      │
│ lib/token-chart.css           │ ◄───────── │         update,reset}                 │
│  · <link> 由宿主路由下发       │  样式表     │  · GET  /token-chart/assets/          │
└───────────────────────────────┘            │         token-chart.css（ETag）       │
                                             └──────────────────────────────────────┘
```

### 5.2 宿主半边（`src/*.ts`）

- `index.ts`：插件入口。`apply(ctx)` 里持有 `UsageStore` 与偏好，注入 `sessionQuery` / `sessions` / `sessionProjections` / `pluginManager` / `webServer`，并注册上面那张路由表。
- `store.ts`：`session → turn → (turn, step, attempt)` 槽位。**折叠幂等**是关键不变量——重放同一份日志必须得到同一组槽位（早期只留一个替换槽，重载一次就把每步再加一遍，虚高约 4.7 倍）。
- `buckets.ts`：分桶算术与时间助手（`zeroBuckets` / `addInto` / `derived` / `dayKey` / `startOfLocalDay`）。
- `prefs.ts` `paths.ts` `constants.ts` `types.ts` `update.ts`：偏好的唯一定义、磁盘位置、两半边共享常量、共享类型、版本比较与 registry 查询。
- `chunk/echarts.entry.ts`：**构建入口**（不是运行时模块），只 `use` bar/line/pie + grid/tooltip/legend/dataZoom + SVG 渲染器。

### 5.3 浏览器半边（`src/client/*.tsx`）

- `index.tsx`：注册座位（`settings.section` / `sidebar.panellist` / `main` / `conversation.session.header.utilities` / `sidebar.right.pane.tab(.title)`）、拦截产品自己的用量胶囊、注册 zh·en 字典、装样式、预热偏好。
- `mount.tsx`：ECharts 挂载——`require.async('./client.echarts.js')`、读 `--dsw-alias-*` 主题 token、组装 option、每容器一个实例。
- `charts.tsx`：**降级路径**。chunk 拉不到时用内置自绘 SVG，UI 必须仍然可用（`tests/client-degraded.test.mjs` 守这条）。
- `series.tsx` `table.tsx` `ui.tsx` `drawer.tsx` `panel.tsx` `settings.tsx` `chrome.tsx` `api.ts` `contract.ts` `models.ts` `format.ts` `locales.ts` `pill.ts` `react.ts`：按职责拆的扁平模块。

### 5.4 DSH 侧契约（改这里要连带改）

| 位置 | 内容 |
| --- | --- |
| `package.json#main` | `lib/index.js` —— 宿主半边入口 |
| `package.json#exports["./client"]` | `lib/client.js` —— client 扫描据此挂载浏览器半边 |
| `package.json#dsh.bundle.patch` | `./cordis.patch.yml`（按包名插入一行 Host 插件） |
| `package.json#dsh.client` | `platform: 'web'` + `inject`（`dsh-client-locale` / `ui-slots` / `ui-conversation` / `ui-sidebar` / `ui-sidebar-right` / `ui-settings`） |
| 路由键 | 模块系统按文件名寻址：`<包名>/client.js`、`<包名>/client.<name>.js`——**目录无所谓，文件名不能改** |

---

## 6. 发布与三条安装通道

```
                     ┌── npm / tarball  → prepack 预构建，消费者零构建
一次构建，三种送达   ├── git 安装       → prepare 在消费者机器上构建（需 allowBuilds 授权）
                     └── 本地 link      → 你自己 npm run build
```

| 通道 | 产物来源 | 发布/使用要点 |
| --- | --- | --- |
| npm（主通道） | 发布时 `prepack`（`npm run build && preflight`） | `npm publish` 走 `publishConfig` 的 npmjs；`npm version` 后 tag 与版本必须一致 |
| tarball | 同上，在打包机上构建 | `npm pack` → `dsh plugin --profile <p> add ./dsh-token-chart-0.1.0.tgz` |
| git | 消费者机器上的 `prepare` | pnpm ≥10 默认拦截，需把 pnpm 打印的精确键（含 sha）写进 profile 的 `pnpm-workspace.yaml`；npmmirror 对新包可能滞后，必要时 `--registry https://registry.npmjs.org` |
| 本地 link | 工作区 `lib/` | `npm install`（触发 `prepare`）或 `npm run build` 后再挂载 |

发布前：`npm run check` → `npm pack` 核对内容 → `npm publish`。**已发布的版本收不回**，`prepack` 里的 preflight 是唯一的自动保险。

**CI 发布**：`.github/workflows/release.yml` 在**推送到 main**（含 PR 合并）与**手动触发**时运行 —— 跑门禁 → 该版本不在 npm 上就发布 → 打 `v<version>` tag → 建 GitHub Release；版本已存在则只跑门禁（日常推送不会红）。认证走 **npm Trusted Publishing（OIDC）**，仓库与 secret 里都不存 npm token；手动触发可带 `bump=prepatch|patch|…` 让 CI 自己递增版本（提交带 `[skip ci]`，job 有 bot 守卫，不会循环）。一次性前置：npmjs 上把本包绑定到本仓库的 `release.yml`（Trusted Publisher）。预发布版本按 preid 走独立 dist-tag（`0.1.1-rc.1` → `rc`），**永不移动 `latest`**。

---

## 7. preflight 检查什么

`scripts/preflight.mjs`（挂在 `prepack` / `prepublishOnly`，也被 `check` 调用）：

1. 元数据：`name`/`version` 存在；**没有 `private: true`**；有 `engines.dsh`；`publishConfig.registry` 必须是 `https://registry.npmjs.org/`；`exports["./client"]` 必须指向 `./lib/client.js`。
2. 产物：`lib/index.js`、`lib/client.js`、`lib/client.echarts.js`、`lib/token-chart.css`、`lib/types/index.d.ts` 必须存在（缺了就提示先 `npm run build`）。
3. 身份：`lib/client.js` 必须以 `window.__ModuleLoader__.load({ id: "<包名>"` 开头；chunk 必须注册同名 id + `chunk: 'client.echarts.js'`；`cordis.patch.yml` 必须按包名插入。
4. lockfile：`resolved` 主机只允许 `registry.npmjs.org` 与 `registry.npmmirror.com`——**内网/私有 registry 混进公开仓库会让消费者装不上**。

---

## 8. 已知的坑

- **`test:client` 需要活宿主**：默认连 `http://127.0.0.1:19387`，并用 `DSH_SESSION_ID`（有内置默认值）；React/jsdom 从 npx 缓存解析，可用 `REACT_DIR` / `JSDOM_DIR` 覆盖。它会在跑前快照、跑后恢复你的真实偏好。
- **`test:host` 必须用独立 `DSH_HOME`**：`DSH_HOME=$(mktemp -d) npm run test:host`，否则会写真实用量库。
- **构建环境**：安装期构建继承的是 dsh 进程的环境（图形界面/launchd 启动的 dsh 不继承终端）。构建用的 Node 必须能加载原生模块，否则 `build:styles` 失败——此时改用 npm/tarball 通道。
- **`prepare` 与 `prepack` 都会全量构建**（实测 npm/pnpm 的 pack 流程顺序是 `prepack → prepare`，两者都触发）。这是刻意的：任一入口单独执行都能产出完整产物，代价是 git 安装多花十几秒。
- **不要用 DSH 自带的 Node 跑构建**（见 §4）。
- **lockfile 由 `npm install --package-lock-only` 在干净目录重生成**，别让内网 registry 的 `resolved` 混进来（preflight 会拦）。

---

## 9. 文件树（两层）

```
dsh-token-chart/
├── src/                       源码（唯一事实来源）
│   ├── index.ts store.ts buckets.ts prefs.ts paths.ts constants.ts types.ts update.ts
│   ├── chunk/                 echarts.entry.ts —— chunk 的构建入口
│   └── client/                浏览器半边（18 个 TS/TSX）
│       └── styles/            index.less / components.less / tokens.less / tailwind.css
├── lib/                       全部产物（git 忽略，npm run build 生成）
├── scripts/                   build-client / build-chunk / build-styles / client-contract / preflight
├── tests/                     host.test.mjs / client.test.mjs / client-degraded.test.mjs
│   └── support/               client-harness.mjs（jsdom 夹具）/ expect-all.mjs
├── locale/                    zh.json / en.json（插件管理器的标题与描述）
├── cordis.patch.yml           插入 Host 插件行
├── package.json               main / exports / files / dsh / engines / publishConfig / scripts
├── tsconfig.json              Host 工程（src → lib，排除 src/client）
├── tsconfig.client.json       浏览器工程（仅类型检查，noEmit）
├── vitest.config.ts           两个 project：host / client，串行执行
├── .npmrc                     安装与发布都指向 registry.npmjs.org
├── .github/workflows/release.yml  CI：门禁 → npm 发布（OIDC）→ tag + Release
├── .gitignore                 node_modules / lib / *.tmp / *.log / *.tgz
├── AGENTS.md  README.md  LICENSE  icon.svg
```

---

## 10. 改哪里（常见任务导航）

| 任务 | 需要同步改的地方 |
| --- | --- |
| 新增图表形式 | `src/constants.ts#CHART_IDS` → `src/client/contract.ts` → `series.tsx` / `charts.tsx` / `mount.tsx` → `settings.tsx` → `locales.ts`（zh+en） |
| 新增指标 | `src/constants.ts#METRIC_IDS` → `buckets.ts#derived` → `src/types.ts` → `client/format.ts` + `locales.ts` |
| 新增座位 | `src/client/index.tsx` + `package.json#dsh.client.inject` |
| 新增 API | `src/index.ts` 的 `routes` 表 + README 的 API 表 + `tests/host.test.mjs` |
| 新增产物文件 | 构建脚本 `OUT` + `package.json#files` + `scripts/preflight.mjs#artifacts` |
| 改样式 | `src/client/styles/**` → `npm run build:styles`；不要引入 preflight，工具类要进 `@source inline(...)` |
| 升 DSH 基线 | `package.json#engines.dsh` + README 兼容性段 + 全量 `npm run check` + 真机挂载冒烟 |
