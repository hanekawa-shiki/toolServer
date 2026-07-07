import type { Env } from "./types";
import { syncAll } from "./sync";

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
        return json(origin, { message: "Holiday CN API", version: "1.0.0" });
      }

      if (path === "/api/holidays/year" && method === "POST") {
        const body = await request.json<{ year?: number }>();
        if (!body.year) return json(origin, { error: "Missing 'year' field" }, 400);

        const data = await env.HOLIDAYS.get(`holiday:year:${body.year}`, "json");
        if (!data) return json(origin, { error: `No data for year ${body.year}` }, 404);
        return json(origin, data);
      }

      return json(origin, { error: "Not Found" }, 404);
    } catch (err) {
      console.error("Request error:", err);
      return json(origin, { error: err instanceof Error ? err.message : "Internal Error" }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Weekly sync triggered");
    ctx.waitUntil(
      syncAll(env)
        .then((r) => console.log("Sync done:", JSON.stringify(r)))
        .catch((e) => console.error("Sync failed:", e))
    );
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