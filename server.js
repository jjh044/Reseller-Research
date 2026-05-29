const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
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
const minimumResalePrice = 5;
const maximumResalePrice = 500;
const cacheTtlMilliseconds = 1000 * 60 * 60 * 6;
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

    serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: "Server error", message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Reseller Research AI running at http://localhost:${PORT}`);
});

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

  const categories = getCategoriesForBrand(brand);
  const apiResults = [];

  for (const category of categories) {
    const data = await findCompletedItems(`${brand} ${category.query}`);
    apiResults.push(mapCategoryResponse(category, data));
  }

  const categoriesWithData = apiResults.filter((category) => category.soldListings > 0);

  const responseBody = {
    brand,
    generatedAt: new Date().toISOString(),
    source: "eBay Average Selling Price API",
    categories: categoriesWithData.length > 0 ? categoriesWithData : apiResults,
  };

  ebayResponseCache.set(normalizeBrand(brand), {
    expiresAt: Date.now() + cacheTtlMilliseconds,
    responseBody,
  });
  sendJson(res, 200, responseBody);
}

function getCachedEbayResponse(brand) {
  const cacheKey = normalizeBrand(brand);
  const cached = ebayResponseCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    ebayResponseCache.delete(cacheKey);
    return null;
  }

  return cached.responseBody;
}

function getCategoriesForBrand(brand) {
  return categoryProfiles[normalizeBrand(brand)] || categoryProfiles.default;
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
            "Create a reseller intelligence readout. Choose the one or two strongest categories from the supplied category names only. Mention ASP, velocity, and BOLO logic where relevant.",
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

function findCompletedItems(keywords) {
  const body = JSON.stringify({
    keywords,
    excluded_keywords: excludedKeywords,
    max_search_results: "60",
    category_id: "15724",
    remove_outliers: "true",
    site_id: "0",
    aspects: [],
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
          reject(new Error(parsed.error || `RapidAPI request failed with ${response.statusCode}`));
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

function readJsonRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
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

function mapCategoryResponse(category, data) {
  const products = Array.isArray(data.products) ? data.products : [];
  const recentProducts = products.filter(
    (product) => isSoldWithinDays(product.date_sold, boloLookbackDays) && hasUsableResalePrice(product),
  );
  const matchedProducts = recentProducts.filter((product) => {
    const title = String(product.title || "").toLowerCase();
    return category.keywords.some((keyword) => title.includes(keyword));
  });
  const categoryProducts = matchedProducts;
  const soldListings = categoryProducts.length;
  const averageSalePrice = average(categoryProducts.map((product) => Number(product.sale_price)));
  const sellThroughRate = estimateSellThroughRate(soldListings, recentProducts.length);

  return {
    name: category.name,
    averageSalePrice: Math.round(averageSalePrice || Number(data.average_price || 0)),
    sellThroughRate,
    soldListings,
    activeListings: Math.max(1, Math.round((soldListings * (1 - sellThroughRate)) / sellThroughRate)),
    topItems: categoryProducts
      .filter((product) => Number.isFinite(Number(product.sale_price)))
      .sort((a, b) => Number(b.sale_price) - Number(a.sale_price))
      .slice(0, 3)
      .map((product) => ({
        title: product.title,
        salePrice: Number(product.sale_price),
        soldDate: product.date_sold || "Recent sale",
      })),
  };
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
  return Number.isFinite(price) && price >= minimumResalePrice && price <= maximumResalePrice;
}

function estimateSellThroughRate(results, totalResults) {
  const returnedVolume = Math.min(results, 60) / 120;
  const marketDepth = Math.min(totalResults, 5000) / 50000;
  return clamp(0.34 + returnedVolume + marketDepth, 0.32, 0.86);
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
