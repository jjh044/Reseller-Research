const https = require("https");

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
const lookbackDays = 90;
const minimumResalePrice = 5;
const maximumResalePrice = 500;
const minimumCategoryComps = 2;
const maximumResultCategories = 4;
const cacheTtlMilliseconds = 1000 * 60 * 60 * 6;
const persistentCacheTtlMilliseconds = 1000 * 60 * 60 * 24;
const responseCache = new Map();
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

module.exports = async function handler(req, res) {
  let requestedBrand = String(req.query.brand || "").trim();
  try {
    if (!process.env.RAPIDAPI_KEY) {
      res.status(500).json({ error: "Missing RAPIDAPI_KEY environment variable" });
      return;
    }

    const brand = requestedBrand;
    if (!brand) {
      res.status(400).json({ error: "Missing brand query parameter" });
      return;
    }

    const cachedResponse = getCachedResponse(brand);
    if (cachedResponse) {
      res.status(200).json({
        ...cachedResponse,
        source: "Cached eBay Average Selling Price API",
        dataMode: "cached-live",
      });
      return;
    }

    const cacheKey = getMarketplaceCacheKey(brand);
    const persistentCache = await getPersistentMarketplaceCache(cacheKey);
    if (persistentCache && new Date(persistentCache.expiresAt).getTime() > Date.now()) {
      res.status(200).json(markCachedResponse(persistentCache.responseData, "persistent-cache", persistentCache));
      return;
    }

    const marketplaceData = await getMarketplaceData(brand);

    const verifiedCategories = marketplaceData.categories.filter((category) => category.soldListings >= minimumCategoryComps);
    const categories = selectTopResultCategories(
      await enrichCategoriesWithSellThroughRates(brand, verifiedCategories),
    );
    if (categories.length === 0) {
      res.status(404).json({
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
      lookbackDays,
      sampleSize,
      confidence: getDataConfidence(sampleSize, categories),
      cache: {
        status: "miss",
        ttlHours: Math.round(cacheTtlMilliseconds / 1000 / 60 / 60),
      },
      categories,
      tagReferences: marketplaceData.tagReferences,
    };

    responseCache.set(normalizeBrand(brand), {
      expiresAt: Date.now() + cacheTtlMilliseconds,
      responseBody,
    });
    await savePersistentMarketplaceCache(cacheKey, brand, responseBody);
    res.status(200).json(responseBody);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "marketplace_api_failure",
        provider: "rapidapi-ebay-average-selling-price",
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
    const staleCache = await getPersistentMarketplaceCache(getMarketplaceCacheKey(requestedBrand));
    if (staleCache) {
      res.status(200).json(markCachedResponse(staleCache.responseData, "stale-cache", staleCache, error.message));
      return;
    }
    if (isRateLimitError(error) && requestedBrand) {
      res.status(200).json(getEstimatedMarketplaceResponse(requestedBrand, error.message));
      return;
    }
    res.status(isRateLimitError(error) ? 429 : 500).json(getMarketplaceErrorBody(error));
  }
};

function getCachedResponse(brand) {
  const cacheKey = normalizeBrand(brand);
  const cached = responseCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return {
    ...normalizeMarketplaceResponseCategories(cached.responseBody),
    cache: {
      status: "hit",
      ttlHours: Math.max(0, Math.round((cached.expiresAt - Date.now()) / 1000 / 60 / 60)),
    },
  };
}

function getCategoriesForBrand(brand) {
  return marketplaceCategories;
}

async function getMarketplaceData(brand) {
  const categories = getCategoriesForBrand(brand);
  const data = await findCompletedItems(brand);
  const products = Array.isArray(data.products) ? data.products : [];
  return {
    categories: categories.map((category) => mapCategoryResponse(brand, category, data)),
    tagReferences: getTagReferencesFromProducts(brand, products),
  };
}

function getTagReferencesFromProducts(brand, products) {
  const seenImages = new Set();
  return products
    .filter(
      (product) =>
        titleMatchesBrand(product.title, brand) &&
        /^https:\/\//i.test(String(product.image_url || "")) &&
        tagReferenceScore(product.title) > 0,
    )
    .sort((a, b) => tagReferenceScore(b.title) - tagReferenceScore(a.title))
    .filter((product) => {
      if (seenImages.has(product.image_url)) return false;
      seenImages.add(product.image_url);
      return true;
    })
    .slice(0, 3)
    .map((product) => ({
      title: product.title,
      imageUrl: product.image_url,
      listingUrl: /^https:\/\//i.test(String(product.link || "")) ? product.link : "",
    }));
}

function tagReferenceScore(title) {
  const value = String(title || "");
  let score = 0;
  if (/\b(vintage|old tag|older tag|tag label|single stitch|made in usa)\b/i.test(value)) score += 4;
  if (/\b(tag|label|patch)\b/i.test(value)) score += 2;
  if (/\b(nwt|new with tag|new w\/tag|no tag|no size tag)\b/i.test(value)) score -= 3;
  return score;
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
    lookbackDays,
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
    listedListings: soldListings * 4,
    sellThroughRate: 0.25,
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
  const sellThroughRate = Number(category.sellThroughRate);
  const velocity = Number.isFinite(sellThroughRate)
    ? sellThroughRate * Math.log2(Number(category.soldListings || 0) + 1)
    : Math.log2(Number(category.soldListings || 0) + 1);
  return Number(category.averageSalePrice || 0) * velocity;
}

async function enrichCategoriesWithSellThroughRates(brand, categories) {
  const enrichedCategories = await Promise.all(
    categories.map(async (category) => {
      const searchQuery = buildActiveListingQuery(brand, category);
      const [soldListings, listedListings] = await Promise.all([
        getEbaySearchResultCount(searchQuery, { sold: true }),
        getEbaySearchResultCount(searchQuery, { sold: false }),
      ]);
      return withSellThroughRate(category, listedListings, soldListings);
    }),
  );
  return enrichedCategories;
}

function buildActiveListingQuery(brand, category) {
  const cleanBrand = String(brand || "").trim().replace(/"/g, "");
  const cleanCategory = String(category?.name || "").trim();
  return `"${cleanBrand}" ${cleanCategory}`.trim();
}

function withSellThroughRate(category, listedListings, soldListingsOverride = null) {
  const soldListings = Number.isFinite(Number(soldListingsOverride))
    ? Number(soldListingsOverride)
    : Number(category.soldListings || 0);
  const activeListings = Number(listedListings);
  const hasListedListings = Number.isFinite(activeListings) && activeListings > 0;

  return {
    ...category,
    soldListings,
    soldSampleSize: Number(category.soldListings || 0),
    listedListings: hasListedListings ? activeListings : null,
    sellThroughRate: hasListedListings ? soldListings / activeListings : null,
  };
}

async function getEbaySearchResultCount(query, options = {}) {
  try {
    const html = await getEbaySearchHtml(query, options);
    return parseEbayResultCount(html);
  } catch (error) {
    const resultType = options.sold ? "sold" : "active";
    console.warn(`Could not load ${resultType} eBay listing count for "${query}":`, error.message);
    return null;
  }
}

function getEbaySearchHtml(query, options = {}, redirectCount = 0) {
  const searchParams = new URLSearchParams({
    _nkw: query,
    _sacat: "0",
  });
  if (options.sold) {
    searchParams.set("LH_Complete", "1");
    searchParams.set("LH_Sold", "1");
  }
  const searchPath = `/sch/i.html?${searchParams.toString()}`;
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: "www.ebay.com",
        path: searchPath,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 6500,
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location &&
          redirectCount < 2
        ) {
          response.resume();
          const redirectUrl = new URL(response.headers.location, "https://www.ebay.com");
          getEbaySearchHtml(redirectUrl.searchParams.get("_nkw") || query, options, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`eBay search failed with ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString()));
      },
    );

    request.on("timeout", () => request.destroy(new Error("eBay active listing count timed out")));
    request.on("error", reject);
  });
}

function parseEbayResultCount(html) {
  const value = String(html || "");
  const patterns = [
    /"totalCount"\s*:\s*"?([\d,]+)"?/i,
    /"resultCount"\s*:\s*"?([\d,]+)"?/i,
    /([\d,]+)\s+results?\s+for/i,
    /([\d,]+)\s+results?/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const count = Number(String(match[1]).replace(/,/g, ""));
    if (Number.isFinite(count)) return count;
  }

  return null;
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

function getMarketplaceCacheKey(brand) {
  return `marketplace:v7:${normalizeBrand(brand)}:${lookbackDays}`;
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

function findCompletedItems(keywords) {
  return postJsonWithRetry(
    "ebay-average-selling-price.p.rapidapi.com",
    "/findCompletedItems",
    {
      keywords,
      excluded_keywords: excludedKeywords,
      max_search_results: "240",
    },
    {
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": "ebay-average-selling-price.p.rapidapi.com",
      "Content-Type": "application/json",
    },
  );
}

function mapCategoryResponse(brand, category, data) {
  const products = Array.isArray(data.products) ? data.products : [];
  const recentProducts = products.filter(
    (product) =>
      isSoldWithinDays(product.date_sold, lookbackDays) &&
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

async function postJsonWithRetry(hostname, requestPath, payload, headers) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await postJson(hostname, requestPath, payload, headers);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === 2) break;
      await wait(350 * attempt);
    }
  }

  throw lastError;
}

function isRetryableError(error) {
  return /500|502|503|504|timeout|ECONNRESET|ETIMEDOUT/i.test(String(error.message || error));
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

function postJson(hostname, requestPath, payload, headers) {
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
          let parsed;

          try {
            parsed = JSON.parse(rawBody);
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${rawBody.slice(0, 160)}`));
            return;
          }

          if (response.statusCode < 200 || response.statusCode >= 300 || parsed.success === false) {
            reject(new Error(parsed.error || `Request failed with ${response.statusCode}`));
            return;
          }

          resolve(parsed);
        });
      },
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function isSoldWithinDays(dateSold, days) {
  const soldAt = new Date(dateSold);
  if (Number.isNaN(soldAt.getTime())) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return soldAt >= cutoff;
}

function hasUsableResalePrice(product) {
  const price = Number(product.sale_price);
  return Number.isFinite(price) && price >= minimumResalePrice && price <= maximumResalePrice;
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}
