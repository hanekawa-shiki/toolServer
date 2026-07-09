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

      // ========== 原有节假日接口 ==========
      if (path === "/api/holidays/year" && method === "POST") {
        const body = await request.json<{ year?: number }>();
        if (!body.year) return json(origin, { error: "Missing 'year' field" }, 400);

        const data = await env.HOLIDAYS.get(`holiday:year:${body.year}`, "json");
        if (!data) return json(origin, { days: [] });
        return json(origin, data);
      }

      // ========== 成品油油价接口 ==========

      // 获取所有可用日期列表
      if (path === "/api/oil-prices/dates" && (method === "GET" || method === "POST")) {
        const dates = await queryOilDates(env.OIL_PRICES_DB);
        return json(origin, { dates });
      }

      // 查询油价数据
      if (path === "/api/oil-prices" && (method === "GET" || method === "POST")) {
        let date: string | undefined;
        let city: string | undefined;
        let page: number | undefined;
        let pageSize: number | undefined;

        if (method === "POST") {
          const body = await request.json<{
            date?: string;
            city?: string;
            page?: number;
            pageSize?: number;
          }>();
          date = body.date;
          city = body.city;
          page = body.page;
          pageSize = body.pageSize;
        } else {
          date = url.searchParams.get("date") || undefined;
          city = url.searchParams.get("city") || undefined;
          const p = url.searchParams.get("page");
          const ps = url.searchParams.get("pageSize");
          page = p ? Number(p) : undefined;
          pageSize = ps ? Number(ps) : undefined;
        }

        const result = await queryOilPrices(env.OIL_PRICES_DB, { date, city, page, pageSize });
        return json(origin, result);
      }

      // 手动触发同步（需要管理员权限）
      if (path === "/api/oil-prices/sync" && method === "POST") {
        let body: { admin_key?: string; date?: string } = {};
        try {
          body = await request.json<{ admin_key?: string; date?: string }>();
        } catch {
          // ignore parse errors
        }
        const adminKey = env.ADMIN_KEY;

        if (!adminKey || body.admin_key !== adminKey) {
          return json(origin, { error: "Unauthorized" }, 401);
        }

        const result = await syncOilPrices(env.OIL_PRICES_DB, body.date);
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
    // 根据 cron 表达式区分任务
    // */10 = 每10天同步节假日; 其他 = 每天抓取油价
    if (event.cron.includes("*/10")) {
      ctx.waitUntil(
        syncAll(env)
          .then((r) => console.log("Holiday sync done:", JSON.stringify(r)))
          .catch((e) => console.error("Holiday sync failed:", e))
      );
    } else {
      ctx.waitUntil(
        syncOilPrices(env.OIL_PRICES_DB)
          .then((r) => console.log("Oil price sync done:", JSON.stringify(r)))
          .catch((e) => console.error("Oil price sync failed:", e))
      );
    }
  },
};

function buildCorsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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