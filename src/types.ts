export interface HolidayYear {
  $schema?: string;
  $id?: string;
  year: number;
  papers: string[];
  days: HolidayDay[];
}

export interface HolidayDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

export interface Env {
  HOLIDAYS: KVNamespace;
  GITHUB_RAW_BASE: string;
  ALLOWED_ORIGINS: string;
}
