/** 节假日年度数据（来源于 holiday-cn） */
export interface HolidayYear {
  $schema?: string;
  $id?: string;
  year: number;
  papers: string[];
  days: HolidayDay[];
}

/** 单个节假日条目 */
export interface HolidayDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

/** Cloudflare Workers 环境变量与绑定 */
export interface Env {
  HOLIDAYS: KVNamespace;
  OIL_PRICES_DB: D1Database;
  GITHUB_RAW_BASE: string;
  ALLOWED_ORIGINS: string;
  ADMIN_KEY?: string;
}

/** 成品油油价记录 */
export interface OilPriceRecord {
  /** 城市维度 ID */
  dim_id: string;
  /** 数据日期 YYYY-MM-DD */
  dim_date: string;
  /** 城市名称 */
  city_name: string;
  /** 城市首字母（用于排序） */
  first_letter: string;
  /** 0# 柴油价格 */
  v0: number;
  /** 95# 汽油价格 */
  v95: number;
  /** 92# 汽油价格 */
  v92: number;
  /** 89# 汽油价格 */
  v89: number;
  /** 0# 柴油涨跌 */
  zde0: number;
  /** 92# 汽油涨跌 */
  zde92: number;
  /** 95# 汽油涨跌 */
  zde95: number;
  /** 89# 汽油涨跌 */
  zde89: number;
  /** 0# 柴油前一期价格 */
  qe0: number;
  /** 92# 汽油前一期价格 */
  qe92: number;
  /** 95# 汽油前一期价格 */
  qe95: number;
  /** 89# 汽油前一期价格 */
  qe89: number;
}

/** 带高亮标记的油价记录（cf-region 匹配时 highlight 为 true） */
export type OilPriceRecordWithHighlight = OilPriceRecord & { highlight?: boolean };
