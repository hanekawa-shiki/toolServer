import type { Env, HolidayYear } from "./types";

const GITHUB_API_BASE = "https://api.github.com/repos/NateScarlet/holiday-cn/contents";

/**
 * 从 GitHub API 获取所有可用年份列表
 */
async function getAvailableYears(githubRawBase: string): Promise<number[]> {
  const resp = await fetch(GITHUB_API_BASE, {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "holiday-cn-worker/1.0" },
  });
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);

  const files = (await resp.json()) as Array<{ name: string; type: string }>;
  return files
    .filter((f) => f.type === "file" && /^\d{4}\.json$/.test(f.name))
    .map((f) => parseInt(f.name, 10))
    .sort((a, b) => a - b);
}

/**
 * 获取指定年份的节假日 JSON
 */
async function fetchHolidayData(githubRawBase: string, year: number): Promise<HolidayYear> {
  const resp = await fetch(`${githubRawBase}/${year}.json`, {
    headers: { Accept: "application/json", "User-Agent": "holiday-cn-worker/1.0" },
  });
  if (!resp.ok) throw new Error(`Fetch ${year}.json failed: ${resp.status}`);

  const data = (await resp.json()) as HolidayYear;
  if (!data.year || !Array.isArray(data.days)) throw new Error(`Invalid data for year ${year}`);
  return data;
}

/**
 * 全量同步：拉取所有年份数据，写入 KV（全量覆盖）
 * Key 格式: holiday:year:2025
 * 索引 Key: holiday:years → [2007, 2008, ..., 2027]
 */
export async function syncAll(env: Env): Promise<{ total: number; success: number; failed: number }> {
  const years = await getAvailableYears(env.GITHUB_RAW_BASE);
  const successYears: number[] = [];
  let failed = 0;

  for (const year of years) {
    try {
      const data = await fetchHolidayData(env.GITHUB_RAW_BASE, year);
      await env.HOLIDAYS.put(`holiday:year:${year}`, JSON.stringify(data));
      successYears.push(year);
    } catch (err) {
      failed++;
      console.error(`Sync year ${year} failed:`, err);
    }
  }

  // 全量覆盖年份索引
  await env.HOLIDAYS.put("holiday:years", JSON.stringify(successYears));

  return { total: years.length, success: successYears.length, failed };
}