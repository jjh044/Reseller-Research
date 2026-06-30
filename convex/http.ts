import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/brand-files",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: corsHeaders() })),
});

http.route({
  path: "/marketplace-cache",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: corsHeaders() })),
});

http.route({
  path: "/brand-files",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const clientId = getClientId(request);
    if (!clientId) return json({ error: "Missing brand file client id" }, 400);

    const files = await ctx.runQuery(api.brandFiles.list, { clientId });
    return json(files);
  }),
});

http.route({
  path: "/marketplace-cache",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const cacheKey = new URL(request.url).searchParams.get("key") || "";
    if (!cacheKey) return json({ error: "Missing cache key" }, 400);

    const cached = await ctx.runQuery(api.marketplaceCache.get, { cacheKey });
    return json(cached);
  }),
});

http.route({
  path: "/marketplace-cache",
  method: "PUT",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const cacheKey = String(body?.cacheKey || "").trim();
    const brand = String(body?.brand || "").trim();
    const generatedAt = String(body?.generatedAt || "").trim();
    const expiresAt = String(body?.expiresAt || "").trim();
    const responseData = body?.responseData;

    if (!cacheKey || !brand || !generatedAt || !expiresAt || !responseData) {
      return json({ error: "Expected cacheKey, brand, generatedAt, expiresAt, and responseData" }, 400);
    }

    const saved = await ctx.runMutation(api.marketplaceCache.save, {
      cacheKey,
      brand,
      generatedAt,
      expiresAt,
      responseData,
    });
    return json(saved);
  }),
});

http.route({
  path: "/brand-files",
  method: "PUT",
  handler: httpAction(async (ctx, request) => {
    const clientId = getClientId(request);
    if (!clientId) return json({ error: "Missing brand file client id" }, 400);

    const body = await request.json();
    const brand = String(body?.brand || body?.reportData?.brand || "").trim();
    const id = String(body?.id || slugify(brand)).trim();
    const reportData = body?.reportData;

    if (!brand || !id || !reportData || typeof reportData !== "object") {
      return json({ error: "Expected brand, id, and reportData" }, 400);
    }

    const savedFile = await ctx.runMutation(api.brandFiles.save, {
      clientId,
      id,
      brand,
      reportData,
    });
    return json(savedFile);
  }),
});

function getClientId(request: Request) {
  return String(request.headers.get("x-reseller-client-id") || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Reseller-Client-Id",
  };
}

function slugify(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default http;
