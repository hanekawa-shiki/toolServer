import type { Env, HolidayDay } from "./types";
import { syncAll } from "./sync";

export default {
  /**
   * HTTP 请求处理
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 获取请求 Origin 并校验
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = env.ALLOWED_ORIGINS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const matchedOrigin = allowedOrigins.includes(origin) ? origin : "";

    // CORS 预检：仅允许的域名通过
    if (method === "OPTIONS") {
      if (!matchedOrigin) return new Response(null, { status: 403 });
      return corsResponse(matchedOrigin, null, 204);
    }

    try {
      // GET / - 服务信息
      if (path === "/" || path === "") {
        return json(matchedOrigin, { message: "Holiday CN API", version: "1.0.0" });
      }

      // POST /api/holidays/year - 获取指定年份完整数据
      if (path === "/api/holidays/year" && method === "POST") {
        const body = await request.json<{ year?: number }>();
        if (!body.year) return json(matchedOrigin, { error: "Missing 'year' field" }, 400);

        const data = await env.HOLIDAYS.get(`holiday:year:${body.year}`, "json");
        if (!data) return json(matchedOrigin, { error: `No data for year ${body.year}` }, 404);
        return json(matchedOrigin, data);
      }

      // POST /api/holidays/days - 获取指定年份假期列表
      if (path === "/api/holidays/days" && method === "POST") {
        const body = await request.json<{ year?: number }>();
        if (!body.year) return json(matchedOrigin, { error: "Missing 'year' field" }, 400);

        const data = await env.HOLIDAYS.get(`holiday:year:${body.year}`, "json") as { days?: HolidayDay[] } | null;
        if (!data) return json(matchedOrigin, { error: `No data for year ${body.year}` }, 404);
        return json(matchedOrigin, data.days ?? []);
      }

      // POST /api/holidays/check - 查询某天状态
      if (path === "/api/holidays/check" && method === "POST") {
        const body = await request.json<{ date?: string }>();
        const date = body.date;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return json(matchedOrigin, { error: "Missing or invalid 'date' field (YYYY-MM-DD)" }, 400);
        }

        const year = date.substring(0, 4);
        const data = await env.HOLIDAYS.get(`holiday:year:${year}`, "json") as { days?: HolidayDay[] } | null;
        if (!data) return json(matchedOrigin, { error: `No data for year ${year}` }, 404);

        const day = data.days?.find((d: HolidayDay) => d.date === date);
        if (!day) return json(matchedOrigin, { date, isHoliday: false, isOffDay: false, name: null });

        return json(matchedOrigin, { date, isHoliday: true, isOffDay: day.isOffDay, name: day.name });
      }

      return json(matchedOrigin, { error: "Not Found" }, 404);
    } catch (err) {
      console.error("Request error:", err);
      return json(matchedOrigin, { error: err instanceof Error ? err.message : "Internal Error" }, 500);
    }
  },

  /**
   * Cron 定时任务：每周同步一次
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Weekly sync triggered");
    ctx.waitUntil(
      syncAll(env)
        .then((r) => console.log("Sync done:", JSON.stringify(r)))
        .catch((e) => console.error("Sync failed:", e))
    );
  },
};

/**
 * 构建 CORS 响应头，只有匹配到的 origin 才设置 Allow-Origin
 */
function buildCorsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function json(origin: string, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: buildCorsHeaders(origin),
  });
}

function corsResponse(origin: string, body: string | null, status = 200): Response {
  return new Response(body, {
    status,
    headers: buildCorsHeaders(origin),
  });
}