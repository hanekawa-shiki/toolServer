# HANEKAWA-TOOL-SERVER AI 交接文档

> 本文档供 AI 助手快速理解项目全貌，以便高效地进行后续开发、调试和维护。

---

## 1. 项目概览

| 项目 | 说明 |
|------|------|
| **名称** | hanekawa-tool-server |
| **版本** | 1.1.0 |
| **仓库** | `git@github.com:hanekawa-shiki/hanekawa-tool-server.git` |
| **运行时** | Cloudflare Workers (V8 isolates) |
| **语言** | TypeScript 6.0 (ESNext, strict mode) |
| **包管理** | pnpm (锁文件: pnpm-lock.yaml) |
| **部署工具** | Wrangler 4.108 |

### 核心功能

本项目是一个部署在 Cloudflare Workers 上的后端 API 服务，提供两个主要功能：

1. **中国节假日查询** — 从 GitHub 开源数据源同步节假日数据到 Cloudflare KV，提供按年份查询接口。
2. **成品油油价数据** — 从公开 API 抓取全国各城市油价数据到 Cloudflare D1 数据库，提供按日期、城市查询接口。

### 技术架构图

```
                    ┌─ GitHub (NateScarlet/holiday-cn) ─→ KV Storage
Cloudflare Worker ──┤
(Cron 定时同步)     └─ datacenter-web.eastmoney.com  ─→ D1 Database
                                                              ↓
                                                     HTTP API (前端调用)
```

---

## 2. 项目结构

```
hanekawa-tool-server/
├── .gitignore          # 忽略 node_modules, .wrangler, dist 等
├── .npmrc              # save-exact=true（精确版本锁定）
├── package.json        # 项目配置和脚本
├── pnpm-lock.yaml      # pnpm 锁文件
├── tsconfig.json       # TypeScript 配置
├── wrangler.toml       # Cloudflare Workers 部署配置（含 KV/D1 绑定、Cron）
├── README.md           # 项目说明文档
├── HANDOVER.md         # 本文档（AI 交接文档）
└── src/
    ├── index.ts        # Worker 入口：路由分发 + Cron 任务调度
    ├── types.ts        # 共享类型定义（HolidayYear, HolidayDay, Env）
    ├── sync.ts         # 节假日全量同步逻辑（GitHub API → KV）
    └── oil.ts          # 油价数据抓取、存储、查询（公开 API → D1）
```

---

## 3. 技术栈详解

### 3.1 运行时与工具链

| 技术 | 版本 | 用途 |
|------|------|------|
| TypeScript | 6.0.3 | 开发语言 |
| @cloudflare/workers-types | 5.20260708.1 | Cloudflare Workers 类型定义 |
| Wrangler | 4.108.0 | Workers 开发/部署/管理 CLI |
| pnpm | - | 包管理器 |

### 3.2 Cloudflare 服务

| 服务 | 绑定名称 | 用途 |
|------|----------|------|
| Workers | - | 运行时计算（fetch + scheduled 事件） |
| KV | `HOLIDAYS` | 存储节假日 JSON 数据 + 油价日期索引 |
| D1 | `OIL_PRICES_DB` | 存储油价数据（SQLite 兼容关系型数据库） |
| Cron Triggers | - | 定时触发数据同步任务 |

### 3.3 TypeScript 配置要点

- **target/module**: ESNext
- **moduleResolution**: Bundler（Wrangler 内部使用 esbuild）
- **strict**: true
- **noEmit**: true（由 Wrangler/esbuild 处理编译）
- **types**: 仅 `@cloudflare/workers-types`
- **allowImportingTsExtensions**: true（支持 `./types.ts` 形式导入）

---

## 4. 环境变量与 Secrets

### 4.1 Wrangler Vars（明文，写入 wrangler.toml）

| 名称 | 值 | 说明 |
|------|-----|------|
| `GITHUB_RAW_BASE` | `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master` | 节假日数据源 base URL |

### 4.2 Secrets（加密存储，部署后通过 CLI 设置）

| 名称 | 用途 | 设置命令 |
|------|------|----------|
| `ALLOWED_ORIGINS` | CORS 白名单域名，逗号分隔 | `echo "https://domain.com" \| npx wrangler secret put ALLOWED_ORIGINS` |
| `ADMIN_KEY` | 管理员密钥，用于手动触发油价同步 | `echo "your-key" \| npx wrangler secret put ADMIN_KEY` |

### 4.3 环境变量类型定义（`Env` 接口）

```typescript
export interface Env {
  HOLIDAYS: KVNamespace;         // KV 绑定
  OIL_PRICES_DB: D1Database;     // D1 绑定
  GITHUB_RAW_BASE: string;       // Vars
  ALLOWED_ORIGINS: string;       // Secret
  ADMIN_KEY?: string;            // Secret（可选）
}
```

---

## 5. Cloudflare 资源配置

### 5.1 KV 命名空间

- **绑定名**: `HOLIDAYS`
- **namespace ID**: `f58c791eeef1498796e76ce8fbb7febb`
- **创建命令**: `pnpm run kv:create`
- **查看命令**: `pnpm run kv:list`

### 5.2 D1 数据库

- **绑定名**: `OIL_PRICES_DB`
- **数据库名**: `oil-prices-db`
- **数据库 ID**: `ffd832d6-8cbe-4b19-b92c-b455acb7ba62`
- **创建命令**: `npx wrangler d1 create oil-prices-db`
- **表结构**: 在代码中自动初始化（`initOilPricesTable`）

### 5.3 Cron 定时任务

| Cron 表达式 | 匹配方式 | 功能 | 执行时间 (UTC / 北京时间) |
|-------------|----------|------|--------------------------|
| `0 1 */10 * *` | cron 包含 `*/10` | 全量同步节假日数据 | 每 10 天 UTC 01:00 / 北京 09:00 |
| `0 19 * * *` | 其他 | 抓取当天油价数据 | 每天 UTC 19:00 / 北京 03:00 |

> **注意**: Cron 区分逻辑在 `index.ts` 的 `scheduled` handler 中，通过 `event.cron.includes("*/10")` 判断。

---

## 6. 数据存储设计

### 6.1 KV 存储

| Key | Value 类型 | 说明 |
|-----|-----------|------|
| `holiday:years` | `number[]` (JSON) | 可用年份数组，如 `[2007, 2008, ..., 2027]` |
| `holiday:year:{year}` | `HolidayYear` (JSON) | 某年完整节假日数据 |
| `oil:dates` | `string[]` (JSON) | 油价日期列表（降序），如 `["2026-06-19", ...]` |

### 6.2 D1 数据库表结构

**表名**: `oil_prices`

```sql
CREATE TABLE IF NOT EXISTS oil_prices (
  dim_id TEXT NOT NULL,
  dim_date TEXT NOT NULL,
  city_name TEXT NOT NULL,
  first_letter TEXT,
  v0 REAL,        -- 0# 柴油价格
  v95 REAL,       -- 95# 汽油价格
  v92 REAL,       -- 92# 汽油价格
  v89 REAL,       -- 89# 汽油价格
  zde0 REAL,      -- 0# 柴油涨跌
  zde92 REAL,     -- 92# 汽油涨跌
  zde95 REAL,     -- 95# 汽油涨跌
  zde89 REAL,     -- 89# 汽油涨跌
  qe0 REAL,       -- 0# 柴油前一期价格
  qe92 REAL,      -- 92# 汽油前一期价格
  qe95 REAL,      -- 95# 汽油前一期价格
  qe89 REAL,      -- 89# 汽油前一期价格
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (dim_id, dim_date)
);

CREATE INDEX IF NOT EXISTS idx_oil_prices_date ON oil_prices(dim_date);
CREATE INDEX IF NOT EXISTS idx_oil_prices_city ON oil_prices(city_name);
```

**注意**: 表在每次 `syncOilPrices` 调用时自动执行 `CREATE TABLE IF NOT EXISTS`，无需手动初始化。

---

## 7. API 接口文档

### 7.1 安全机制

所有请求必须满足：
1. **HTTPS** 协议
2. 携带 **Origin** 头
3. Origin 在 `ALLOWED_ORIGINS` 白名单中（逗号分隔匹配）

不满足时返回 `403`。

### 7.2 接口列表

#### `POST /` — 服务信息

```json
{ "message": "HANEKAWA-TOOLS API", "version": "1.1.0" }
```

#### `POST /api/holidays/year` — 查询节假日

**请求体**:
```json
{ "year": 2025 }
```

**响应**: 原始 holiday-cn JSON（含 `year`, `days[]`, `papers[]`）

```json
{
  "year": 2025,
  "days": [
    { "name": "元旦", "date": "2025-01-01", "isOffDay": true },
    ...
  ]
}
```

#### `POST /api/oil-prices/dates` — 获取可用油价日期列表

**响应**:
```json
{ "dates": ["2026-06-19", "2026-05-29", ...] }
```

**数据来源优先级**: KV → D1（KV 为空时自动从 D1 回填）

#### `POST /api/oil-prices` — 查询油价

**请求头**:
- `cf-region`（可选）：Cloudflare 请求头，值为英文省级行政区名（如 `Shanghai`），用于高亮用户所在省份的油价数据

**请求体**:
```json
{
  "date": "2026-06-19",   // 可选，不传返回最新
  "city": "北京",          // 可选，模糊匹配
  "page": 1,              // 可选，默认 1
  "pageSize": 50          // 可选，默认 50
}
```

**高亮逻辑**：当 `cf-region` 存在时，后端通过 `REGION_CN_MAP` 将其转换为中文省份名，与每条记录的 `city_name` 比对，匹配项返回 `highlight: true`。`cf-region` 不存在时不做比对。

**响应**:
```json
{
  "data": [{ "dim_id": "...", "city_name": "上海", "highlight": true, "v92": 7.15, ... }],
  "total": 31,
  "date": "2026-06-19"
}
```

#### `POST /api/oil-prices/sync` — 手动触发油价同步（需管理员）

**请求体**:
```json
{
  "admin_key": "your-admin-key",
  "date": "2026-06-19"   // 可选
}
```

---

## 8. 源码模块详解

### 8.1 `src/index.ts` — Worker 入口

**职责**:
- **fetch handler**: 路由分发、CORS 处理、Origin 校验
- **scheduled handler**: 根据 cron 表达式分发定时任务

**路由表**:
| 方法 | 路径 | 功能 |
|------|------|------|
| ALL | `/` 或 `""` | 返回服务信息 |
| POST | `/api/holidays/year` | 查询节假日 |
| POST | `/api/oil-prices/dates` | 油价日期列表 |
| POST | `/api/oil-prices` | 查询油价 |
| POST | `/api/oil-prices/sync` | 手动同步油价（需 admin_key） |

**辅助函数**:
- `buildCorsHeaders(origin)` — 构建 CORS 响应头
- `json(origin, data, status)` — JSON 响应封装
- `corsResponse(origin, body, status)` — CORS 响应封装

### 8.2 `src/types.ts` — 类型定义

```typescript
interface HolidayDay {
  name: string;       // 节假日名称
  date: string;       // 日期 "YYYY-MM-DD"
  isOffDay: boolean;  // 是否休息日
}

interface HolidayYear {
  year: number;
  papers: string[];   // 文件名称列表
  days: HolidayDay[]; // 节假日列表
}

interface Env {
  HOLIDAYS: KVNamespace;
  OIL_PRICES_DB: D1Database;
  GITHUB_RAW_BASE: string;
  ALLOWED_ORIGINS: string;
  ADMIN_KEY?: string;
}

interface OilPriceRecord {
  dim_id: string;
  dim_date: string;
  city_name: string;
  first_letter: string;
  v0: number; v95: number; v92: number; v89: number;
  zde0: number; zde92: number; zde95: number; zde89: number;
  qe0: number; qe92: number; qe95: number; qe89: number;
}

type OilPriceRecordWithHighlight = OilPriceRecord & { highlight?: boolean };
```

### 8.3 `src/sync.ts` — 节假日同步

**数据源**: `https://api.github.com/repos/NateScarlet/holiday-cn/contents`

**流程**:
1. 调用 GitHub API 获取仓库根目录文件列表
2. 过滤出 `YYYY.json` 格式的文件，提取年份
3. 逐个拉取 `{GITHUB_RAW_BASE}/{year}.json`
4. 写入 KV: `holiday:year:{year}` → 完整 JSON
5. 更新索引: `holiday:years` → 年份数组

**导出函数**:
- `syncAll(env)` — 全量同步，返回 `{ total, success, failed }`

**注意**: 使用 GitHub REST API（`api.github.com`）获取目录列表，而非 `GITHUB_RAW_BASE`。

### 8.4 `src/oil.ts` — 油价模块

**数据源**: `https://datacenter-web.eastmoney.com/api/data/v1/get`
- 报表名: `RPTA_WEB_YJ_JH`
- 按日期筛选，按首字母排序

**核心函数**:

| 函数 | 说明 |
|------|------|
| `getBeijingDateStr()` | 获取北京时间日期字符串 YYYY-MM-DD |
| `fetchOilPrices(date?)` | 从数据源抓取指定日期油价 |
| `upsertOilPrices(db, records)` | 批量写入 D1（INSERT OR REPLACE） |
| `initOilPricesTable(db)` | 初始化 D1 表结构 |
| `queryOilPrices(db, options)` | 分页查询油价（支持日期、城市筛选、省份高亮） |
| `getOilDateList(kv)` | 从 KV 读取日期索引 |
| `addOilDate(kv, date)` | 向 KV 日期索引追加新日期 |
| `queryOilDates(kv, db)` | 获取所有可用日期（KV → D1 回填） |
| `syncOilPrices(db, kv, date?)` | 完整同步流程（初始化+抓取+写入+索引） |

**油价数据结构**:
| 字段 | 说明 |
|------|------|
| `dim_id` | 城市维度 ID |
| `dim_date` | 数据日期 |
| `city_name` | 城市名称 |
| `first_letter` | 城市首字母（用于排序） |
| `v0` / `v92` / `v95` / `v89` | 各标号汽油/柴油价格 |
| `zde0` / `zde92` / `zde95` / `zde89` | 各标号涨跌 |
| `qe0` / `qe92` / `qe95` / `qe89` | 各标号前一期价格 |

---

## 9. 开发与部署

### 9.1 本地开发

```bash
pnpm install                    # 安装依赖
pnpm run dev                    # 启动本地开发服务器 (wrangler dev)
```

> **注意**: 本地开发时，KV 和 D1 会使用本地模拟存储。可通过 `.dev.vars` 文件（gitignore 已排除）设置本地 Secrets。

### 9.2 类型检查

```bash
pnpm run typecheck              # tsc --noEmit
```

### 9.3 首次部署流程

```bash
# 1. 安装依赖
pnpm install

# 2. 创建 KV 命名空间（获取 ID 填入 wrangler.toml）
pnpm run kv:create

# 3. 创建 D1 数据库（获取 ID 填入 wrangler.toml）
npx wrangler d1 create oil-prices-db

# 4. 部署 Worker
pnpm run deploy

# 5. 设置 Secrets（部署后）
echo "https://your-domain.com" | npx wrangler secret put ALLOWED_ORIGINS
echo "your-admin-key" | npx wrangler secret put ADMIN_KEY    # 可选
```

### 9.4 日常部署

```bash
pnpm run deploy                 # wrangler deploy
```

### 9.5 KV 管理命令

```bash
pnpm run kv:create              # 创建新 KV 命名空间
pnpm run kv:list                # 列出所有 KV 命名空间
```

---

## 10. 关键设计决策与注意事项

### 10.1 CORS 策略

- 所有 API 请求必须携带 `Origin` 头
- Origin 必须在 `ALLOWED_ORIGINS` 白名单中
- `OPTIONS` 请求返回 204（预检通过）
- 响应头包含 `Access-Control-Allow-Origin`、`Access-Control-Allow-Methods: POST, OPTIONS`、`Access-Control-Allow-Headers`

### 10.2 时区处理

- 油价数据使用北京时间（UTC+8）
- `getBeijingDateStr()` 手动计算北京时间，不依赖运行时时区
- Cron 任务在 UTC 19:00 执行，对应北京时间 03:00

### 10.3 数据一致性

- 节假日数据采用**全量覆盖**（每次同步写入所有年份）
- 油价数据采用 **INSERT OR REPLACE**（主键 dim_id + dim_date）
- 油价日期索引使用 **追加去重 + 排序** 策略（降序）
- D1 批量操作使用 `db.batch()`，每批 50 条（避免参数数量限制）

### 10.4 错误处理

- 所有 API 错误返回统一 JSON 格式: `{ "error": "..." }`
- Cron 任务使用 `ctx.waitUntil()` 确保异步执行不被中断
- 油价同步失败返回 `{ success: false, message: "..." }` 而非抛出异常

### 10.5 无外部依赖

项目 **没有 runtime dependencies**，仅使用 Cloudflare Workers 内置 API：
- `fetch()` — HTTP 请求
- `KV` — 键值存储
- `D1` — SQLite 数据库
- `ScheduledEvent` — Cron 触发

所有 npm 依赖均为 devDependencies。

---

## 11. 扩展指南

### 11.1 添加新的 API 接口

在 `src/index.ts` 的 `fetch` handler 中添加路由：

```typescript
if (path === "/api/new-endpoint" && method === "POST") {
  // 处理逻辑
  return json(origin, { result: "..." });
}
```

### 11.2 添加新的定时任务

1. 在 `wrangler.toml` 的 `crons` 数组中添加新的 cron 表达式
2. 在 `src/index.ts` 的 `scheduled` handler 中添加任务分发逻辑
3. 确保 cron 表达式的匹配方式不与现有任务冲突

### 11.3 添加新的 D1 表

1. 在 `src/oil.ts` 或新模块中创建 `init*Table()` 函数
2. 在对应的 sync 函数开头调用初始化
3. 使用 `db.prepare().bind().all()` / `db.batch()` 进行查询和写入

### 11.4 添加新的 KV 存储

直接使用 `env.KV_BINDING.put(key, value)` 和 `env.KV_BINDING.get(key, "json")` 操作。

---

## 12. 故障排查

### 常见问题

| 问题 | 排查方向 |
|------|----------|
| API 返回 403 | 检查 Origin 头是否在 ALLOWED_ORIGINS 白名单中 |
| 油价同步返回空数据 | 数据源 API 可能当日无数据（非交易日），正常现象 |
| Cron 未触发 | 检查 wrangler.toml 中 crons 配置，确认 Worker 已部署 |
| D1 查询返回空 | 表可能未初始化，syncOilPrices 会自动初始化；也可手动调用 sync 接口 |
| KV 日期列表为空 | queryOilDates 会自动从 D1 回填；首次使用需先同步数据 |

### 日志查看

```bash
npx wrangler tail                # 实时查看 Worker 日志
```

---

## 13. 版本历史摘要

基于当前代码状态（commit `84c14fe`），项目已实现：
- 中国节假日全量同步与查询
- 全国成品油油价每日自动抓取与存储
- 油价按日期/城市分页查询
- 通过 `cf-region` 请求头自动高亮用户所在省份的油价数据
- 管理员手动触发油价同步
- 完整的 CORS 安全策略

**类型拆分**：油价相关的接口类型（`OilPriceRecord`、`OilPriceRecordWithHighlight`）定义在 `src/types.ts` 中，`src/oil.ts` 通过 `import type` 引入，保持类型与业务逻辑分离。
