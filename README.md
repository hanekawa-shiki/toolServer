# hanekawa-tool-server

基于 Cloudflare Worker + KV + D1 的通用工具 API 服务，提供中国节假日查询和成品油油价数据。

## 架构

```
                    ┌─ GitHub (holiday-cn)  →  KV Storage
Cloudflare Worker ──┤
(Cron 定时同步)     └─ datacenter-web  →  D1 Database
                                                              ↓
                                                    HTTP API (前端调用)
```

- **节假日数据**：每 10 天从 [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn) 自动同步，存入 KV
- **油价数据**：每天自动抓取最新成品油油价，存入 D1

## 快速开始

```bash
pnpm install

# 创建 KV 命名空间（获取 id 填入 wrangler.toml）
pnpm run kv:create

# 创建 D1 数据库（获取 id 填入 wrangler.toml）
npx wrangler d1 create oil-prices-db

# 部署
pnpm run deploy

# 部署后设置 Secret
echo "https://your-app.example.com" | npx wrangler secret put ALLOWED_ORIGINS
echo "your-admin-key" | npx wrangler secret put ADMIN_KEY    # 可选，用于手动触发油价同步
```

如果忘记了 KV namespace id，运行 `pnpm run kv:list` 查看已有的命名空间列表。

修改 ALLOWED_ORIGINS（部署后随时可改，无需重新部署代码）：
```bash
echo "https://new-domain.example.com,https://another.com" | npx wrangler secret put ALLOWED_ORIGINS
```

## API 接口

所有接口均需携带 `Origin` 头，且域名必须在 `ALLOWED_ORIGINS` 白名单中。

### 根路径

```
GET /
```

返回服务信息：

```json
{ "message": "HANEKAWA-TOOLS API", "version": "1.1.0" }
```

### 节假日接口

#### 获取指定年份完整数据

```
POST /api/holidays/year
Content-Type: application/json

{ "year": 2025 }
```

返回原始 holiday-cn JSON，结构与仓库一致（包含 `year`、`days`、`papers` 字段）。

### 油价接口

#### 获取可用日期列表

```
GET /api/oil-prices/dates
```

返回所有已收录的油价日期（按时间倒序）：

```json
{ "dates": ["2026-06-19", "2026-05-29", "2026-05-19", ...] }
```

#### 查询油价数据

```
GET /api/oil-prices?date=2026-06-19&city=北京&page=1&pageSize=50
```

或：

```
POST /api/oil-prices
Content-Type: application/json

{
  "date": "2026-06-19",   // 可选，不传则返回最新日期
  "city": "北京",          // 可选，模糊匹配城市名
  "page": 1,              // 可选，默认 1
  "pageSize": 50          // 可选，默认 50
}
```

返回：

```json
{
  "data": [
    {
      "dim_id": "...",
      "dim_date": "2026-06-19",
      "city_name": "北京",
      "first_letter": "B",
      "v0": 6.82,       // 0# 柴油
      "v92": 7.15,      // 92# 汽油
      "v95": 7.62,      // 95# 汽油
      "v89": 6.65,      // 89# 汽油
      "zde0": 0.05,     // 0# 柴油涨跌
      "zde92": 0.05,
      "zde95": 0.05,
      "zde89": 0.05,
      "qe0": 6.77,
      "qe92": 7.10,
      "qe95": 7.57,
      "qe89": 6.60
    }
  ],
  "total": 31,
  "date": "2026-06-19"
}
```

#### 手动触发油价同步（需管理员权限）

```
POST /api/oil-prices/sync
Content-Type: application/json

{
  "admin_key": "your-admin-key",
  "date": "2026-06-19"   // 可选，指定同步某一天的数据；不传则抓取当天，无数据则跳过
}
```

## 项目结构

```
src/
├── index.ts    # Worker 入口（路由 + Cron 调度）
├── oil.ts      # 油价数据抓取与查询（datacenter-web → D1）
├── sync.ts     # 节假日全量同步（GitHub → KV）
└── types.ts    # 类型定义
```

## 存储设计

### KV

| Key | 说明 |
|-----|------|
| `holiday:years` | 年份索引 `[2007, 2008, ..., 2027]` |
| `holiday:year:2025` | 某年完整 JSON |
| `oil:dates` | 油价日期列表 `["2026-06-19", ...]`（降序，每次同步成功后自动维护） |

### D1

`oil_prices` 表，主键 `(dim_id, dim_date)`，索引 `dim_date` 和 `city_name`。

## 定时任务

| Cron 表达式 | 说明 |
|-------------|------|
| `0 1 */10 * *` | 每 10 天 UTC 01:00（北京时间 09:00）同步节假日 |
| `0 9 * * *` | 每天 UTC 09:00（北京时间 17:00）抓取当天油价 |



## 环境变量与 Secrets

| 名称 | 类型 | 说明 |
|------|------|------|
| `GITHUB_RAW_BASE` | Var | holiday-cn 数据源 base URL |
| `HOLIDAYS` | KV | 节假日数据存储 |
| `OIL_PRICES_DB` | D1 | 油价数据存储 |
| `ALLOWED_ORIGINS` | Secret | CORS 白名单域名（逗号分隔） |
| `ADMIN_KEY` | Secret | 管理员密钥（手动触发油价同步） |