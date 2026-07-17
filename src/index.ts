import type { Env } from "./types";
import { syncAll } from "./sync";
import { syncOilPrices, queryOilPrices, queryOilDates } from "./oil";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (url.protocol !== "https:") {
      return json("", { error: "HTTPS required" }, 403);
    }

    const origin = request.headers.get("Origin") || "";
    if (!origin) return json("", { error: "Origin header required" }, 403);

    const allowedOrigins = env.ALLOWED_ORIGINS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowedOrigins.includes(origin)) {
      return json("", { error: "Origin not allowed" }, 403);
    }

    if (method === "OPTIONS") {
      return corsResponse(origin, null, 204);
    }

    try {
      if (path === "/" || path === "") {
        return json(origin, { message: "HANEKAWA-TOOLS API", version: "1.1.0" });
      }

      // POST /api/holidays/year — 查询指定年份节假日数据
      if (path === "/api/holidays/year" && method === "POST") {
        const body = await request.json<{ year?: number }>();
        if (!body.year) return json(origin, { error: "Missing 'year' field" }, 400);

        const data = await env.HOLIDAYS.get(`holiday:year:${body.year}`, "json");
        if (!data) return json(origin, { days: [] });
        return json(origin, data);
      }

      // POST /api/oil-prices/dates — 获取所有可用油价日期列表
      if (path === "/api/oil-prices/dates" && method === "POST") {
        const dates = await queryOilDates(env.HOLIDAYS, env.OIL_PRICES_DB);
        return json(origin, { dates });
      }

      // POST /api/oil-prices — 分页查询油价，支持日期/城市筛选，可选 cf-region 高亮
      if (path === "/api/oil-prices" && method === "POST") {
        let body: { date?: string; city?: string; page?: number; pageSize?: number } = {};
        try {
          body = await request.json<{
            date?: string;
            city?: string;
            page?: number;
            pageSize?: number;
          }>();
        } catch {}

        const region = request.headers.get("cf-region") || undefined;

        const result = await queryOilPrices(env.OIL_PRICES_DB, {
          date: body.date,
          city: body.city,
          page: body.page,
          pageSize: body.pageSize,
          region,
        });
        return json(origin, result);
      }

      // POST /api/oil-prices/sync — 手动触发油价同步（需管理员密钥）
      if (path === "/api/oil-prices/sync" && method === "POST") {
        let body: { admin_key?: string; date?: string } = {};
        try {
          body = await request.json<{ admin_key?: string; date?: string }>();
        } catch {}
        const adminKey = env.ADMIN_KEY;

        if (!adminKey || body.admin_key !== adminKey) {
          return json(origin, { error: "Unauthorized" }, 401);
        }

        const result = await syncOilPrices(env.OIL_PRICES_DB, env.HOLIDAYS, body.date);
        return json(origin, result);
      }

      return json(origin, { error: "Not Found" }, 404);
    } catch (err) {
      console.error("Request error:", err);
      return json(origin, { error: err instanceof Error ? err.message : "Internal Error" }, 500);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Cron triggered: ${event.cron}`);
    if (event.cron.includes("*/10")) {
      ctx.waitUntil(
        syncAll(env)
          .then((r) => console.log("Holiday sync done:", JSON.stringify(r)))
          .catch((e) => console.error("Holiday sync failed:", e))
      );
    } else {
      ctx.waitUntil(
        syncOilPrices(env.OIL_PRICES_DB, env.HOLIDAYS)
          .then((r) => console.log("Oil price sync done:", JSON.stringify(r)))
          .catch((e) => console.error("Oil price sync failed:", e))
      );
    }
  },
};

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