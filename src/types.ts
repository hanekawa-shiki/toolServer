/** holiday-cn 仓库的 JSON 数据结构 */
export interface HolidayYear {
  $schema?: string;
  $id?: string;
  year: number;
  papers: string[];
  days: HolidayDay[];
}

export interface HolidayDay {
  name: string;
  date: string; // "YYYY-MM-DD"
  isOffDay: boolean;
}

/** Worker 环境变量 */
export interface Env {
  HOLIDAYS: KVNamespace;
  GITHUB_RAW_BASE: string;
  ALLOWED_ORIGINS: string; // 逗号分隔的允许域名
}
