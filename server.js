const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const brandFilesHandler = require("./api/brand-files");
const configHandler = require("./api/config");
const tagImageHandler = require("./api/tag-image");

loadLocalEnv();

const PORT = Number(process.env.PORT || 3000);
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || OPENAI_MODEL;
const OPENAI_WEB_SEARCH_TOOL_TYPE = process.env.OPENAI_WEB_SEARCH_TOOL_TYPE || "web_search_preview";
const ROOT = __dirname;

const categoryProfiles = {
  default: [
    { name: "Jeans", query: "jeans", keywords: ["jeans", "denim"] },
    { name: "Jackets", query: "jacket", keywords: ["jacket", "coat", "vest", "shell"] },
    { name: "Shirts", query: "shirt", keywords: ["shirt", "tee", "t-shirt", "flannel", "button"] },
    { name: "Pants", query: "pants", keywords: ["pants", "trousers", "joggers", "leggings"] },
  ],
  levis: [
    { name: "Jeans", query: "jeans", keywords: ["jeans", "denim", "501", "505", "550", "wedgie"] },
    { name: "Jackets", query: "jacket", keywords: ["jacket", "trucker", "sherpa", "coat"] },
    { name: "Shirts", query: "shirt", keywords: ["shirt", "tee", "t-shirt", "western", "flannel"] },
    { name: "Shorts", query: "shorts", keywords: ["shorts", "cutoff", "cutoffs", "shortalls"] },
  ],
  patagonia: [
    { name: "Fleece", query: "fleece", keywords: ["fleece", "synchilla", "sweater", "pullover"] },
    { name: "Jackets", query: "jacket", keywords: ["jacket", "coat", "parka", "shell", "vest"] },
    { name: "Shirts", query: "shirt", keywords: ["shirt", "tee", "t-shirt", "flannel", "button"] },
    { name: "Pants", query: "pants", keywords: ["pants", "shorts", "trousers", "joggers"] },
  ],
  "free people": [
    { name: "Dresses", query: "dress", keywords: ["dress", "maxi", "midi", "mini"] },
    { name: "Tops", query: "top", keywords: ["top", "blouse", "cami", "henley", "tunic"] },
    { name: "Sweaters", query: "sweater", keywords: ["sweater", "cardigan", "pullover"] },
    { name: "Jeans", query: "jeans", keywords: ["jeans", "denim", "flare", "barrel"] },
  ],
};

const excludedKeywords = "damaged fake replica lot read stains broken parts only";
const boloLookbackDays = 90;
const maximumResalePrice = 500;
const unusableCompTitlePattern = /\b(damaged|damage|fake|replica|counterfeit|broken|parts only|for parts|repair)\b/i;
const minimumCategoryComps = 2;
const maximumResultCategories = 4;
const marketplaceCategories = [
  { name: "Jeans", keywords: ["jeans", "denim pants"] },
  { name: "Jackets", keywords: ["jacket", "jackets", "coat", "coats", "parka", "blazer", "vest"] },
  { name: "Shirts", keywords: ["shirt", "shirts", "t shirt", "tee", "polo", "blouse", "top", "tops"] },
  { name: "Pants", keywords: ["pants", "trousers", "chinos", "joggers", "leggings"] },
  { name: "Dresses", keywords: ["dress", "dresses", "gown"] },
  { name: "Sweaters", keywords: ["sweater", "sweaters", "cardigan", "pullover", "fleece"] },
  { name: "Skirts", keywords: ["skirt", "skirts"] },
  { name: "Shorts", keywords: ["shorts", "cutoffs"] },
  { name: "Shoes", keywords: ["shoes", "sneakers", "boots", "sandals", "heels", "loafers"] },
  { name: "Bags", keywords: ["bag", "bags", "purse", "handbag", "backpack", "tote"] },
];
const estimatedCategorySeeds = {
  patagonia: [
    ["Fleece", 64, 18, ["Synchilla Snap-T Pullover", "Better Sweater Jacket", "Retro Pile Vest"]],
    ["Jackets", 92, 16, ["Nano Puff Jacket", "Torrentshell Rain Jacket", "Houdini Windbreaker"]],
    ["Shirts", 31, 12, ["Capilene Cool Tee", "Organic Cotton Flannel", "P-6 Logo Tee"]],
    ["Pants", 47, 10, ["Quandary Hiking Pants", "Baggies Shorts", "Terrebonne Joggers"]],
  ],
  levis: [
    ["Jeans", 42, 20, ["501 Original Fit Jeans", "Wedgie Straight Jeans", "505 Regular Jeans"]],
    ["Jackets", 58, 14, ["Type III Trucker Jacket", "Sherpa Trucker Jacket", "Vintage Denim Jacket"]],
    ["Shirts", 27, 9, ["Western Denim Shirt", "Graphic Logo Tee", "Plaid Work Shirt"]],
    ["Shorts", 24, 7, ["501 Cutoff Shorts", "High Loose Shorts", "Bermuda Denim Shorts"]],
  ],
  "free people": [
    ["Dresses", 54, 15, ["Adella Slip Dress", "Feeling Groovy Maxi", "Oasis Midi Dress"]],
    ["Tops", 36, 13, ["Intimately Cami", "Easy Street Tunic", "We The Free Henley"]],
    ["Sweaters", 49, 11, ["Ottoman Slouchy Tunic", "Bonfire Cardigan", "Low Tide Pullover"]],
    ["Jeans", 46, 8, ["CRVY Flare Jeans", "Good Luck Barrel Jeans", "Moxie Pull-On Jeans"]],
  ],
};
const defaultEstimatedCategorySeed = [
  ["Jackets", 61, 10, ["Utility Jacket", "Quilted Coat", "Denim Trucker Jacket"]],
  ["Jeans", 38, 12, ["High Rise Straight Jeans", "Vintage Wash Denim", "Relaxed Fit Jeans"]],
  ["Shirts", 29, 9, ["Logo Tee", "Linen Button Down", "Plaid Overshirt"]],
  ["Dresses", 44, 8, ["Midi Dress", "Wrap Dress", "Sleeveless Maxi Dress"]],
];
const cacheTtlMilliseconds = 1000 * 60 * 60 * 6;
const persistentCacheTtlMilliseconds = 1000 * 60 * 60 * 24;
const ebayResponseCache = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/ebay-average-selling-price") {
      await handleEbayAverageSellingPrice(url, res);
      return;
    }

    if (url.pathname === "/api/ai-insights") {
      await handleAiInsights(req, res);
      return;
    }

    if (url.pathname === "/api/identify-label") {
      await handleIdentifyLabel(req, res);
      return;
    }

    if (url.pathname === "/api/brand-files") {
      await handleBrandFiles(req, res);
      return;
    }

    if (url.pathname === "/api/config") {
      await handleConfig(req, res);
      return;
    }

    if (url.pathname === "/api/tag-image") {
      await handleTagImage(url, res);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: "Server error", message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Reseller Research AI running at http://localhost:${PORT}`);
});

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.join(__dirname, filename);
    if (!fs.existsSync(envPath)) continue;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || String(process.env[key] || "").trim()) continue;

      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

async function handleAiInsights(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!OPENAI_API_KEY) {
    sendJson(res, 500, { error: "Missing OPENAI_API_KEY environment variable" });
    return;
  }

  const marketplaceData = await readJsonRequest(req);
  if (!marketplaceData || !Array.isArray(marketplaceData.categories)) {
    sendJson(res, 400, { error: "Expected marketplace data with categories[]" });
    return;
  }

  const aiInsights = await generateOpenAiInsights(marketplaceData);
  sendJson(res, 200, normalizeAiInsights(aiInsights, marketplaceData.categories));
}

async function handleIdentifyLabel(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const requestBody = await readJsonRequest(req, 7 * 1024 * 1024);
  const image = String(requestBody.image || "");

  if (!isSupportedImageDataUrl(image)) {
    sendJson(res, 400, { error: "Expected image as a JPEG, PNG, or WebP data URL" });
    return;
  }

  if (!OPENAI_API_KEY) {
    const remote = await postJsonResponse(
      "reseller-research.vercel.app",
      "/api/identify-label",
      { image },
      { "Content-Type": "application/json" },
    );
    sendJson(res, remote.statusCode, remote.body);
    return;
  }

  const labelResult = await identifyLabelBrand(image);
  const normalized = normalizeLabelResult(labelResult);

  if (!normalized.brand || normalized.confidence < 0.2) {
    sendJson(res, 422, {
      error: "Could not confidently identify a brand label",
      message: "No readable brand name was found. Try another angle with the label in view.",
      ...normalized,
    });
    return;
  }

  sendJson(res, 200, normalized);
}

async function handleBrandFiles(req, res) {
  const serverlessReq = req;
  if (req.method === "PUT" || req.method === "POST") {
    serverlessReq.body = await readJsonRequest(req);
  }

  await brandFilesHandler(serverlessReq, {
    status(statusCode) {
      return {
        json(body) {
          sendJson(res, statusCode, body);
        },
      };
    },
  });
}

async function handleConfig(req, res) {
  await configHandler(req, {
    status(statusCode) {
      return {
        json(body) {
          sendJson(res, statusCode, body);
        },
      };
    },
  });
}

async function handleTagImage(url, res) {
  const responseHeaders = {};
  let statusCode = 200;

  await tagImageHandler(
    {
      method: "GET",
      query: Object.fromEntries(url.searchParams.entries()),
    },
    {
      status(nextStatusCode) {
        statusCode = nextStatusCode;
        return this;
      },
      setHeader(name, value) {
        responseHeaders[name] = value;
      },
      send(body) {
        const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
        res.writeHead(statusCode, {
          "Content-Type": responseHeaders["Content-Type"] || "text/plain; charset=utf-8",
          ...responseHeaders,
          "Content-Length": buffer.length,
        });
        res.end(buffer);
      },
    },
  );
}

async function handleEbayAverageSellingPrice(url, res) {
  if (!RAPIDAPI_KEY) {
    sendJson(res, 500, { error: "Missing RAPIDAPI_KEY environment variable" });
    return;
  }

  const brand = (url.searchParams.get("brand") || "").trim();
  if (!brand) {
    sendJson(res, 400, { error: "Missing brand query parameter" });
    return;
  }

  const cachedResponse = getCachedEbayResponse(brand);
  if (cachedResponse) {
    sendJson(res, 200, cachedResponse);
    return;
  }

  const cacheKey = getMarketplaceCacheKey(brand);
  const persistentCache = await getPersistentMarketplaceCache(cacheKey);
  if (persistentCache && new Date(persistentCache.expiresAt).getTime() > Date.now()) {
    sendJson(res, 200, markCachedResponse(persistentCache.responseData, "persistent-cache", persistentCache));
    return;
  }

  try {
    const marketplaceData = await getMarketplaceData(brand);

    const categories = selectTopResultCategories(
      marketplaceData.categories.filter((category) => category.soldListings >= minimumCategoryComps),
    );
    if (categories.length === 0) {
      sendJson(res, 404, {
        error: "No verified category comps found",
        message: `No categories had at least ${minimumCategoryComps} recent sold listings for ${brand}.`,
      });
      return;
    }
    const sampleSize = categories.reduce((sum, category) => sum + category.soldListings, 0);

    const responseBody = {
      brand,
      generatedAt: new Date().toISOString(),
      source: "eBay Average Selling Price API",
      dataMode: "live",
      lookbackDays: boloLookbackDays,
      sampleSize,
      confidence: getDataConfidence(sampleSize, categories),
      cache: {
        status: "miss",
        ttlHours: Math.round(cacheTtlMilliseconds / 1000 / 60 / 60),
      },
      categories,
      tagReferences: marketplaceData.tagReferences,
    };

    ebayResponseCache.set(normalizeBrand(brand), {
      expiresAt: Date.now() + cacheTtlMilliseconds,
      responseBody,
    });
    await savePersistentMarketplaceCache(cacheKey, brand, responseBody);
    sendJson(res, 200, responseBody);
  } catch (error) {
    const staleCache = persistentCache || (await getPersistentMarketplaceCache(cacheKey));
    if (staleCache) {
      sendJson(res, 200, markCachedResponse(staleCache.responseData, "stale-cache", staleCache, error.message));
      return;
    }
    if (isRateLimitError(error)) {
      sendJson(res, 200, getEstimatedMarketplaceResponse(brand, error.message));
      return;
    }
    sendJson(res, isRateLimitError(error) ? 429 : 500, getMarketplaceErrorBody(error));
  }
}

function getCachedEbayResponse(brand) {
  const cacheKey = normalizeBrand(brand);
  const cached = ebayResponseCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    ebayResponseCache.delete(cacheKey);
    return null;
  }

  return normalizeMarketplaceResponseCategories(cached.responseBody);
}

function getMarketplaceCacheKey(brand) {
  return `marketplace:v9:${normalizeBrand(brand)}:${boloLookbackDays}`;
}

function markCachedResponse(responseData, status, cacheRecord, refreshError = "") {
  const normalizedResponse = normalizeMarketplaceResponseCategories(responseData);
  return {
    ...normalizedResponse,
    source: status === "stale-cache" ? "Stale cached eBay comps" : "Cached eBay comps",
    dataMode: status === "stale-cache" ? "stale-cache" : "cached-live",
    cache: {
      status,
      generatedAt: cacheRecord.generatedAt,
      expiresAt: cacheRecord.expiresAt,
      refreshError,
    },
  };
}

async function getPersistentMarketplaceCache(cacheKey) {
  if (!getConvexHttpUrl() || !cacheKey) return null;

  try {
    return await requestConvex("GET", `/marketplace-cache?key=${encodeURIComponent(cacheKey)}`);
  } catch (error) {
    console.warn("Could not read marketplace cache:", error.message);
    return null;
  }
}

async function savePersistentMarketplaceCache(cacheKey, brand, responseData) {
  if (!getConvexHttpUrl()) return;

  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + persistentCacheTtlMilliseconds).toISOString();
  try {
    await requestConvex("PUT", "/marketplace-cache", {
      cacheKey,
      brand,
      generatedAt,
      expiresAt,
      responseData,
    });
  } catch (error) {
    console.warn("Could not save marketplace cache:", error.message);
  }
}

function requestConvex(method, requestPath, body) {
  const convexUrl = new URL(getConvexHttpUrl());
  const requestBody = body === undefined ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method,
        hostname: convexUrl.hostname,
        path: requestPath,
        headers: {
          "Content-Type": "application/json",
          ...(requestBody ? { "Content-Length": Buffer.byteLength(requestBody) } : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString();
          let parsed = null;

          if (rawBody) {
            try {
              parsed = JSON.parse(rawBody);
            } catch (error) {
              reject(new Error(`Invalid Convex JSON response: ${rawBody.slice(0, 160)}`));
              return;
            }
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed?.message || parsed?.error || `Convex request failed with ${response.statusCode}`));
            return;
          }

          resolve(parsed);
        });
      },
    );

    request.on("error", reject);
    if (requestBody) request.write(requestBody);
    request.end();
  });
}

function getConvexHttpUrl() {
  if (process.env.CONVEX_HTTP_URL) return process.env.CONVEX_HTTP_URL;
  if (!process.env.CONVEX_URL) return "";
  return process.env.CONVEX_URL.replace(".convex.cloud", ".convex.site");
}

function getCategoriesForBrand(brand) {
  return marketplaceCategories;
}

async function getMarketplaceData(brand) {
  const categories = getCategoriesForBrand(brand);
  const data = await findCompletedItems(brand);
  return {
    categories: categories.map((category) => mapCategoryResponse(brand, category, data)),
    tagReferences: await getOpenAiTagReferences(brand),
  };
}

function isRateLimitError(error) {
  return /\b429\b|rate limit|too many requests|quota/i.test(String(error?.message || ""));
}

function getMarketplaceErrorBody(error) {
  if (isRateLimitError(error)) {
    return {
      error: "Marketplace rate limit reached",
      message:
        "The live eBay sold-comps provider is rate limiting requests right now. Wait a minute and try again; cached reports will still load when available.",
    };
  }

  return { error: "Server error", message: error.message };
}

function getEstimatedMarketplaceResponse(brand, refreshError = "") {
  const categories = selectTopResultCategories(getEstimatedCategories(brand));
  const sampleSize = categories.reduce((sum, category) => sum + category.soldListings, 0);

  return {
    brand,
    generatedAt: new Date().toISOString(),
    source: "Estimated fallback data",
    dataMode: "estimated",
    lookbackDays: boloLookbackDays,
    sampleSize,
    confidence: {
      level: "low",
      sampleSize,
      note:
        "Live eBay sold comps are temporarily rate limited. Use this only as directional guidance and verify eBay sold listings before buying.",
    },
    cache: {
      status: "rate-limit-fallback",
      refreshError,
    },
    categories,
    tagReferences: [],
  };
}

function getEstimatedCategories(brand) {
  const seed = estimatedCategorySeeds[normalizeBrand(brand)] || defaultEstimatedCategorySeed;
  return seed.map(([name, averageSalePrice, soldListings, itemTitles]) => ({
    name,
    averageSalePrice,
    soldListings,
    topItems: itemTitles.slice(0, 3).map((title, index) => ({
      title: `${brand} ${title}`,
      salePrice: Math.max(5, Math.round(averageSalePrice * (1.18 - index * 0.11))),
      soldDate: "Estimated fallback",
      imageUrl: "",
      listingUrl: "",
      itemId: "",
    })),
  }));
}

function normalizeMarketplaceResponseCategories(responseData) {
  if (!responseData || !Array.isArray(responseData.categories)) return responseData;
  const categories = selectTopResultCategories(responseData.categories);
  const sampleSize = categories.reduce((sum, category) => sum + Number(category.soldListings || 0), 0);

  return {
    ...responseData,
    categories,
    sampleSize,
    confidence: responseData.confidence
      ? {
          ...responseData.confidence,
          sampleSize,
        }
      : responseData.confidence,
  };
}

function selectTopResultCategories(categories) {
  return [...categories]
    .sort((a, b) => {
      const scoreDifference = getCategoryOpportunityScore(b) - getCategoryOpportunityScore(a);
      if (scoreDifference !== 0) return scoreDifference;
      const aspDifference = Number(b.averageSalePrice || 0) - Number(a.averageSalePrice || 0);
      if (aspDifference !== 0) return aspDifference;
      return Number(b.soldListings || 0) - Number(a.soldListings || 0);
    })
    .slice(0, maximumResultCategories);
}

function getCategoryOpportunityScore(category) {
  return Number(category.averageSalePrice || 0) * Math.log2(Number(category.soldListings || 0) + 1);
}

async function getOpenAiTagReferences(brand) {
  if (!OPENAI_API_KEY) return [];

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      references: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            imageUrl: { type: "string" },
            sourceUrl: { type: "string" },
          },
          required: ["title", "imageUrl", "sourceUrl"],
        },
      },
    },
    required: ["references"],
  };

  const payload = {
    model: OPENAI_SEARCH_MODEL,
    tools: [{ type: OPENAI_WEB_SEARCH_TOOL_TYPE }],
    input: [
      {
        role: "system",
        content:
          "You find visual clothing label references for resellers. Return only references that visibly show actual neck labels, care tags, waist tags, or brand tags. imageUrl should be the direct image src or og:image URL for that tag image, not a Google/Bing thumbnail or search-result URL. sourceUrl should be the page where the image appears. Do not return product-only photos, outfit photos, stock photos, BOLO listings, or logo-only graphics.",
      },
      {
        role: "user",
        content: `Find up to 3 image references for actual ${brand} clothing brand tags or labels. Search phrases like "${brand} brand tags", "${brand} clothing label", "${brand} vintage tag", and "${brand} neck label". Prefer source pages where the tag image appears clearly, then return the best direct image URL plus that source page URL.`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "brand_tag_references",
        strict: true,
        schema,
      },
    },
    max_output_tokens: 700,
  };

  try {
    const response = await postJson("api.openai.com", "/v1/responses", payload, {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    });
    const parsed = JSON.parse(extractResponseText(response));
    return sanitizeTagReferences(parsed.references);
  } catch (error) {
    console.warn(`OpenAI tag reference lookup unavailable for ${brand}:`, error.message);
    return [];
  }
}

function sanitizeTagReferences(references) {
  const seenImages = new Set();
  return (Array.isArray(references) ? references : [])
    .map((reference) => ({
      title: String(reference.title || "Brand tag reference").trim(),
      imageUrl: String(reference.imageUrl || "").trim(),
      listingUrl: String(reference.sourceUrl || "").trim(),
    }))
    .filter(
      (reference) =>
        isLikelyTagImageUrl(reference.imageUrl) &&
        !seenImages.has(reference.imageUrl) &&
        seenImages.add(reference.imageUrl),
    )
    .slice(0, 3);
}

function isLikelyTagImageUrl(value) {
  const url = String(value || "").trim();
  if (/\.(?:svg|gif|avif|heic|ico)(?:[?#].*)?$/i.test(url)) return false;
  if (/\b(?:avatar|profile|sprite|logo|icon|placeholder|blank|transparent|tracking|pixel)\b/i.test(url)) return false;

  return (
    /^https:\/\//i.test(url) &&
    (/\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(url) ||
      /\b(?:image|images|img|photo|photos|media|cdn|i\.ebayimg|pinimg|etsystatic|cloudfront)\b/i.test(url))
  );
}

function normalizeBrand(brand) {
  const normalized = String(brand)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
  if (normalized === "levi" || normalized === "levis" || normalized === "levi s") return "levis";
  return normalized;
}

function generateOpenAiInsights(marketplaceData) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string" },
      recommendation: { type: "string" },
      strongestCategoryNames: {
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: { type: "string" },
      },
    },
    required: ["headline", "recommendation", "strongestCategoryNames"],
  };

  const payload = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a practical clothing resale analyst. Use only the supplied eBay marketplace data. Keep advice concise, specific, and useful for sourcing decisions.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Create a reseller intelligence readout. Choose the one or two strongest categories from the supplied category names only. Use ASP and sold-comp depth; do not claim sell-through or active-listing velocity.",
          marketplaceData,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "reseller_ai_insights",
        strict: true,
        schema,
      },
    },
    max_output_tokens: 450,
  };

  return postJson("api.openai.com", "/v1/responses", payload, {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  }).then((response) => JSON.parse(extractResponseText(response)));
}

function identifyLabelBrand(imageDataUrl) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      brand: { type: "string" },
      labelText: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      possibleBrands: {
        type: "array",
        maxItems: 5,
        items: { type: "string" },
      },
    },
    required: ["brand", "labelText", "confidence", "possibleBrands"],
  };

  const payload = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You identify clothing brands from fast, imperfect reseller photos. Inspect the entire image, including edges and corners. Mentally rotate angled or sideways text and account for perspective, wrinkles, shadows, glare, blur, partial cropping, and labels that are small or off-center. Use visible words, logos, monograms, distinctive typography, and tag design together. Return the most likely brand when there is useful evidence; use an empty brand only when no brand evidence is readable.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Find the clothing brand anywhere in this uncropped field photo. The label may be angled, folded, partly cut off, or away from the center. Identify the most likely brand for resale research. Do not mistake size, RN numbers, fabric content, care instructions, or country of origin for the brand, but use them as supporting clues when helpful.",
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "clothing_label_identification",
        strict: true,
        schema,
      },
    },
    max_output_tokens: 300,
  };

  return postJson("api.openai.com", "/v1/responses", payload, {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  }).then((response) => JSON.parse(extractResponseText(response)));
}

function findCompletedItems(keywords) {
  const body = JSON.stringify({
    keywords,
    excluded_keywords: excludedKeywords,
    max_search_results: "240",
  });

  const options = {
    method: "POST",
    hostname: "ebay-average-selling-price.p.rapidapi.com",
    path: "/findCompletedItems",
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": "ebay-average-selling-price.p.rapidapi.com",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const chunks = [];

      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const payload = Buffer.concat(chunks).toString();
        let parsed;

        try {
          parsed = JSON.parse(payload);
        } catch (error) {
          reject(new Error(`Invalid API JSON response: ${payload.slice(0, 160)}`));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300 || parsed.success === false) {
          const apiMessage = parsed.message || parsed.error?.message || parsed.error;
          reject(
            new Error(
              apiMessage
                ? `RapidAPI request failed with ${response.statusCode}: ${apiMessage}`
                : `RapidAPI request failed with ${response.statusCode}`,
            ),
          );
          return;
        }

        resolve(parsed);
      });
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function postJson(hostname, requestPath, payload, headers) {
  const body = JSON.stringify(payload);
  const options = {
    method: "POST",
    hostname,
    path: requestPath,
    headers: {
      ...headers,
      "Content-Length": Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const chunks = [];

      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString();
        let parsed;

        try {
          parsed = JSON.parse(rawBody);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${rawBody.slice(0, 160)}`));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(parsed.error?.message || `Request failed with ${response.statusCode}`));
          return;
        }

        resolve(parsed);
      });
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function postJsonResponse(hostname, requestPath, payload, headers) {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: "POST",
        hostname,
        path: requestPath,
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString();
          try {
            resolve({
              statusCode: response.statusCode,
              body: JSON.parse(rawBody),
            });
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${rawBody.slice(0, 160)}`));
          }
        });
      },
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  const message = response.output?.find((item) => item.type === "message");
  const textContent = message?.content?.find((item) => item.type === "output_text");
  if (textContent?.text) return textContent.text;

  throw new Error("OpenAI response did not include output text");
}

function normalizeAiInsights(aiInsights, availableCategories) {
  const selectedNames = new Set(
    aiInsights.strongestCategoryNames.map((name) => String(name).trim().toLowerCase()),
  );
  const strongestCategories = availableCategories.filter((category) =>
    selectedNames.has(String(category.name).trim().toLowerCase()),
  );

  return {
    headline: aiInsights.headline,
    recommendation: aiInsights.recommendation,
    strongestCategories: strongestCategories.length > 0 ? strongestCategories : availableCategories.slice(0, 2),
  };
}

function normalizeLabelResult(labelResult) {
  const brand = String(labelResult.brand || "").trim();
  const labelText = String(labelResult.labelText || "").trim();
  const confidence = clamp(Number(labelResult.confidence), 0, 1);
  const possibleBrands = Array.isArray(labelResult.possibleBrands)
    ? labelResult.possibleBrands.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];

  return {
    brand,
    labelText,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    possibleBrands,
  };
}

function isSupportedImageDataUrl(value) {
  return /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value);
}

function readJsonRequest(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch (error) {
        reject(new Error("Invalid request JSON"));
      }
    });
    req.on("error", reject);
  });
}

function mapCategoryResponse(brand, category, data) {
  const products = Array.isArray(data.products) ? data.products : [];
  const recentProducts = products.filter(
    (product) =>
      isSoldWithinDays(product.date_sold, boloLookbackDays) &&
      hasUsableResalePrice(product) &&
      titleMatchesBrand(product.title, brand),
  );
  const matchedProducts = recentProducts.filter((product) => {
    const title = normalizeListingText(product.title);
    return classifyListingCategory(title)?.name === category.name;
  });
  const categoryProducts = matchedProducts;
  const soldListings = categoryProducts.length;
  const averageSalePrice = average(categoryProducts.map((product) => Number(product.sale_price)));

  return {
    name: category.name,
    averageSalePrice: Math.round(averageSalePrice),
    soldListings,
    topItems: categoryProducts
      .filter((product) => Number.isFinite(Number(product.sale_price)))
      .sort((a, b) => Number(b.sale_price) - Number(a.sale_price))
      .slice(0, 3)
      .map((product) => ({
        title: product.title,
        salePrice: Number(product.sale_price),
        soldDate: product.date_sold || "Recent sale",
        imageUrl: /^https:\/\//i.test(String(product.image_url || "")) ? product.image_url : "",
        listingUrl: /^https:\/\//i.test(String(product.link || "")) ? product.link : "",
        itemId: String(product.item_id || ""),
      })),
  };
}

function titleMatchesBrand(title, brand) {
  const normalizedTitle = normalizeListingText(title).replace(/\blevi s\b/g, "levis");
  const normalizedBrand = normalizeBrand(brand);
  const titleWords = normalizedTitle.split(" ");
  const brandWords = normalizedBrand.split(" ");
  const brandStart = titleWords.findIndex((word, index) =>
    brandWords.every((brandWord, offset) => titleWords[index + offset] === brandWord),
  );
  return brandStart >= 0 && brandStart <= 5;
}

function classifyListingCategory(normalizedTitle) {
  return marketplaceCategories.find((category) =>
    category.keywords.some((keyword) => includesListingPhrase(normalizedTitle, keyword)),
  );
}

function includesListingPhrase(normalizedTitle, phrase) {
  const normalizedPhrase = normalizeListingText(phrase);
  return ` ${normalizedTitle} `.includes(` ${normalizedPhrase} `);
}

function normalizeListingText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSoldWithinDays(dateSold, days) {
  const soldAt = parseEbaySoldDate(dateSold);
  if (!soldAt) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return soldAt >= cutoff;
}

function parseEbaySoldDate(dateSold) {
  if (!dateSold) return null;

  const parsed = new Date(dateSold);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function hasUsableResalePrice(product) {
  const price = Number(product.sale_price);
  const title = String(product?.title || "");
  return Number.isFinite(price) && price > 0 && price <= maximumResalePrice && !unusableCompTitlePattern.test(title);
}

function getDataConfidence(sampleSize, categories) {
  const categoriesWithComps = categories.filter((category) => category.soldListings > 0).length;
  if (sampleSize >= 40 && categoriesWithComps >= 3) {
    return {
      level: "high",
      sampleSize,
      note: "Enough recent sold comps were found across multiple categories.",
    };
  }
  if (sampleSize >= 12 && categoriesWithComps >= 2) {
    return {
      level: "medium",
      sampleSize,
      note: "Usable recent comps were found, but validate high-value buys manually.",
    };
  }
  return {
    level: "low",
    sampleSize,
    note: "Thin recent comp sample. Treat prices as directional, not precise.",
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(ROOT, cleanPath);

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(contents);
  });
}

function getContentType(filePath) {
  const extension = path.extname(filePath);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
