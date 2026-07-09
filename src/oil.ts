/**
 * 成品油油价数据抓取与查询模块
 * 数据来源：东方财富网 datacenter-web API
 */

export interface OilPriceRecord {
  dim_id: string;
  dim_date: string;
  city_name: string;
  first_letter: string;
  /** 0#柴油价格 */
  v0: number;
  /** 95#汽油价格 */
  v95: number;
  /** 92#汽油价格 */
  v92: number;
  /** 89#汽油价格 */
  v89: number;
  /** 0#柴油涨跌 */
  zde0: number;
  /** 92#汽油涨跌 */
  zde92: number;
  /** 95#汽油涨跌 */
  zde95: number;
  /** 89#汽油涨跌 */
  zde89: number;
  /** 0#柴油前一期价格 */
  qe0: number;
  /** 92#汽油前一期价格 */
  qe92: number;
  /** 95#汽油前一期价格 */
  qe95: number;
  /** 89#汽油前一期价格 */
  qe89: number;
}

interface EastMoneyRecord {
  DIM_ID: string;
  DIM_DATE: string;
  CITYNAME: string;
  FIRST_LETTER: string;
  V0: number;
  V95: number;
  V92: number;
  V89: number;
  ZDE0: number;
  ZDE92: number;
  ZDE95: number;
  ZDE89: number;
  QE0: number;
  QE92: number;
  QE95: number;
  QE89: number;
}

interface EastMoneyResponse {
  success: boolean;
  result: {
    pages: number;
    data: EastMoneyRecord[];
  } | null;
}

/**
 * 获取北京时间的日期字符串 YYYY-MM-DD
 */
function getBeijingDateStr(): string {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
  return beijingTime.toISOString().split("T")[0];
}

/**
 * 从东方财富网抓取指定日期的成品油油价数据
 */
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
    throw new Error(`Eastmoney API error: ${resp.status} ${resp.statusText}`);
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

/**
 * 将油价数据写入 D1 数据库
 * 使用 INSERT OR REPLACE 避免重复
 */
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

/**
 * 初始化 D1 数据库表结构
 */
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

/**
 * 查询指定日期的所有城市油价
 * 如果未指定日期，返回最近一次的数据
 */
export async function queryOilPrices(
  db: D1Database,
  options: { date?: string; city?: string; page?: number; pageSize?: number } = {},
): Promise<{ data: OilPriceRecord[]; total: number; date: string }> {
  const { date, city, page = 1, pageSize = 50 } = options;

  let targetDate = date;

  if (!targetDate) {
    // 获取最新日期
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

  // 获取总数
  const countRow = await db
    .prepare(`SELECT COUNT(*) as total FROM oil_prices ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();
  const total = countRow?.total || 0;

  // 分页查询
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

  return {
    data: results.results || [],
    total,
    date: targetDate,
  };
}

/**
 * 获取所有可用的油价日期列表
 */
export async function queryOilDates(db: D1Database): Promise<string[]> {
  const results = await db
    .prepare("SELECT DISTINCT dim_date FROM oil_prices ORDER BY dim_date DESC")
    .all<{ dim_date: string }>();
  return (results.results || []).map((r) => r.dim_date);
}

/**
 * 定时抓取任务：抓取指定日期的油价并存入数据库
 * 未指定日期时抓取当天，无数据则跳过
 */
export async function syncOilPrices(db: D1Database, targetDate?: string): Promise<{ success: boolean; date: string; count: number; message: string }> {
  try {
    // 先初始化表
    await initOilPricesTable(db);

    const fetchDate = targetDate || getBeijingDateStr();
    const records = await fetchOilPrices(fetchDate);

    if (records.length === 0) {
      return { success: true, date: targetDate || getBeijingDateStr(), count: 0, message: "No oil price data available" };
    }

    const result = await upsertOilPrices(db, records);
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

