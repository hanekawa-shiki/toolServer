import type { OilPriceRecord, OilPriceRecordWithHighlight } from "./types";

const REGION_CN_MAP: Record<string, string> = {
  // 直辖市
  Beijing: "北京",
  Shanghai: "上海",
  Tianjin: "天津",
  Chongqing: "重庆",
  // 省份
  Hebei: "河北",
  Shanxi: "山西",
  Liaoning: "辽宁",
  Jilin: "吉林",
  Heilongjiang: "黑龙江",
  Jiangsu: "江苏",
  Zhejiang: "浙江",
  Anhui: "安徽",
  Fujian: "福建",
  Jiangxi: "江西",
  Shandong: "山东",
  Henan: "河南",
  Hubei: "湖北",
  Hunan: "湖南",
  Guangdong: "广东",
  Hainan: "海南",
  Sichuan: "四川",
  Guizhou: "贵州",
  Yunnan: "云南",
  Shaanxi: "陕西",
  Gansu: "甘肃",
  Qinghai: "青海",
  Taiwan: "台湾",
  // 自治区
  Guangxi: "广西",
  Neimenggu: "内蒙古",
  Xizang: "西藏",
  Ningxia: "宁夏",
  Xinjiang: "新疆",
};

/** 油价数据源 API 返回的原始记录（字段名为大写） */
interface EastMoneyRecord {
  /** 城市维度 ID */
  DIM_ID: string;
  /** 数据日期（格式：2026-06-19 00:00:00） */
  DIM_DATE: string;
  /** 城市名称 */
  CITYNAME: string;
  /** 城市首字母 */
  FIRST_LETTER: string;
  /** 0# 柴油价格 */
  V0: number;
  /** 95# 汽油价格 */
  V95: number;
  /** 92# 汽油价格 */
  V92: number;
  /** 89# 汽油价格 */
  V89: number;
  /** 0# 柴油涨跌 */
  ZDE0: number;
  /** 92# 汽油涨跌 */
  ZDE92: number;
  /** 95# 汽油涨跌 */
  ZDE95: number;
  /** 89# 汽油涨跌 */
  ZDE89: number;
  /** 0# 柴油前一期价格 */
  QE0: number;
  /** 92# 汽油前一期价格 */
  QE92: number;
  /** 95# 汽油前一期价格 */
  QE95: number;
  /** 89# 汽油前一期价格 */
  QE89: number;
}

/** 油价数据源 API 响应结构 */
interface EastMoneyResponse {
  success: boolean;
  result: {
    pages: number;
    data: EastMoneyRecord[];
  } | null;
}

function getBeijingDateStr(): string {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
  return beijingTime.toISOString().split("T")[0];
}

/** 抓取指定日期的成品油油价数据，不传则取当天 */
export async function fetchOilPrices(date?: string): Promise<OilPriceRecord[]> {
  const targetDate = date || getBeijingDateStr();
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_YJ_JH&columns=ALL&filter=(DIM_DATE%3D%27${encodeURIComponent(targetDate)}%27)&sortColumns=FIRST_LETTER&sortTypes=1&pageNumber=1&pageSize=100&source=WEB&_=${Date.now()}`;

  console.log(`Fetching oil prices for date: ${targetDate}`);

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Referer": "https://data.eastmoney.com/",
    },
  });

  if (!resp.ok) {
    throw new Error(`Oil price API error: ${resp.status} ${resp.statusText}`);
  }

  const json: EastMoneyResponse = await resp.json() as EastMoneyResponse;

  if (!json.success || !json.result || !json.result.data || json.result.data.length === 0) {
    console.log(`No oil price data found for date: ${targetDate}`);
    return [];
  }

  return json.result.data.map((r) => ({
    dim_id: r.DIM_ID,
    dim_date: r.DIM_DATE.split(" ")[0], // "2026-06-19 00:00:00" -> "2026-06-19"
    city_name: r.CITYNAME,
    first_letter: r.FIRST_LETTER,
    v0: r.V0,
    v95: r.V95,
    v92: r.V92,
    v89: r.V89,
    zde0: r.ZDE0,
    zde92: r.ZDE92,
    zde95: r.ZDE95,
    zde89: r.ZDE89,
    qe0: r.QE0,
    qe92: r.QE92,
    qe95: r.QE95,
    qe89: r.QE89,
  }));
}

/** 批量写入油价数据到 D1（INSERT OR REPLACE），每批 50 条 */
export async function upsertOilPrices(
  db: D1Database,
  records: OilPriceRecord[],
): Promise<{ inserted: number; date: string }> {
  if (records.length === 0) {
    return { inserted: 0, date: "" };
  }

  const date = records[0].dim_date;

  // D1 支持批量执行，但有参数数量限制，分批处理
  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const stmts: D1PreparedStatement[] = [];

    for (const r of batch) {
      stmts.push(
        db.prepare(
          `INSERT OR REPLACE INTO oil_prices
           (dim_id, dim_date, city_name, first_letter, v0, v95, v92, v89, zde0, zde92, zde95, zde89, qe0, qe92, qe95, qe89)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          r.dim_id, r.dim_date, r.city_name, r.first_letter,
          r.v0, r.v95, r.v92, r.v89,
          r.zde0, r.zde92, r.zde95, r.zde89,
          r.qe0, r.qe92, r.qe95, r.qe89,
        ),
      );
    }

    const results = await db.batch(stmts);
    inserted += results.length;
  }

  console.log(`Upserted ${inserted} oil price records for date: ${date}`);
  return { inserted, date };
}

/** 初始化 D1 oil_prices 表结构 */
export async function initOilPricesTable(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS oil_prices (
      dim_id TEXT NOT NULL,
      dim_date TEXT NOT NULL,
      city_name TEXT NOT NULL,
      first_letter TEXT,
      v0 REAL,
      v95 REAL,
      v92 REAL,
      v89 REAL,
      zde0 REAL,
      zde92 REAL,
      zde95 REAL,
      zde89 REAL,
      qe0 REAL,
      qe92 REAL,
      qe95 REAL,
      qe89 REAL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (dim_id, dim_date)
    );
    CREATE INDEX IF NOT EXISTS idx_oil_prices_date ON oil_prices(dim_date);
    CREATE INDEX IF NOT EXISTS idx_oil_prices_city ON oil_prices(city_name);
  `);
  console.log("oil_prices table initialized");
}

function regionToCn(region: string): string | null {
  return REGION_CN_MAP[region] || null;
}

/** 分页查询油价，支持日期/城市筛选，可选根据 cf-region 高亮用户所在省份 */
export async function queryOilPrices(
  db: D1Database,
  options: { date?: string; city?: string; page?: number; pageSize?: number; region?: string } = {},
): Promise<{ data: OilPriceRecordWithHighlight[]; total: number; date: string }> {
  const { date, city, page = 1, pageSize = 50, region } = options;

  let targetDate = date;

  if (!targetDate) {
    const latest = await db
      .prepare("SELECT DISTINCT dim_date FROM oil_prices ORDER BY dim_date DESC LIMIT 1")
      .first<{ dim_date: string }>();
    if (!latest) {
      return { data: [], total: 0, date: "" };
    }
    targetDate = latest.dim_date;
  }

  let whereClause = "WHERE dim_date = ?";
  const params: string[] = [targetDate];

  if (city) {
    whereClause += " AND city_name LIKE ?";
    params.push(`%${city}%`);
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM oil_prices ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();
  const total = countRow?.total || 0;

  const offset = (page - 1) * pageSize;
  const results = await db
    .prepare(
      `SELECT dim_id, dim_date, city_name, first_letter,
              v0, v95, v92, v89, zde0, zde92, zde95, zde89,
              qe0, qe92, qe95, qe89
       FROM oil_prices ${whereClause}
       ORDER BY first_letter ASC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, pageSize, offset)
    .all<OilPriceRecord>();

  const regionCn = region ? regionToCn(region) : null;
  const data: OilPriceRecordWithHighlight[] = (results.results || []).map((r) => ({
    ...r,
    ...(regionCn ? { highlight: r.city_name.includes(regionCn) } : {}),
  }));

  return {
    data,
    total,
    date: targetDate,
  };
}

/** 从 KV 读取油价日期索引列表（降序） */
export async function getOilDateList(kv: KVNamespace): Promise<string[]> {
  const dates = await kv.get<string[]>("oil:dates", "json");
  return dates || [];
}

/** 向 KV 日期索引追加新日期（去重，保持降序） */
export async function addOilDate(kv: KVNamespace, date: string): Promise<void> {
  const dates = await kv.get<string[]>("oil:dates", "json") || [];
  if (!dates.includes(date)) {
    dates.push(date);
    dates.sort((a, b) => b.localeCompare(a));
    await kv.put("oil:dates", JSON.stringify(dates));
  }
}

/** 获取所有可用油价日期，优先从 KV 读取，KV 为空则回退到 D1 查询并回填 */
export async function queryOilDates(kv: KVNamespace, db: D1Database): Promise<string[]> {
  let dates = await getOilDateList(kv);
  if (dates.length > 0) return dates;

  const results = await db
    .prepare("SELECT DISTINCT dim_date FROM oil_prices ORDER BY dim_date DESC")
    .all<{ dim_date: string }>();
  dates = (results.results || []).map((r) => r.dim_date);
  if (dates.length > 0) {
    await kv.put("oil:dates", JSON.stringify(dates));
  }
  return dates;
}

/** 完整同步流程：初始化表 → 抓取 → 写入 D1 → 更新 KV 日期索引 */
export async function syncOilPrices(db: D1Database, kv: KVNamespace, targetDate?: string): Promise<{ success: boolean; date: string; count: number; message: string }> {
  try {
    await initOilPricesTable(db);

    const fetchDate = targetDate || getBeijingDateStr();
    const records = await fetchOilPrices(fetchDate);

    if (records.length === 0) {
      return { success: true, date: targetDate || getBeijingDateStr(), count: 0, message: "No oil price data available" };
    }

    const result = await upsertOilPrices(db, records);

    await addOilDate(kv, result.date);

    return {
      success: true,
      date: result.date,
      count: result.inserted,
      message: `Synced ${result.inserted} records for ${result.date}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Oil price sync failed:", message);
    return { success: false, date: "", count: 0, message };
  }
}

