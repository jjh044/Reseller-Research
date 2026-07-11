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
const maximumResalePrice = 500;
const unusableCompTitlePattern = /\b(damaged|damage|fake|replica|counterfeit|broken|parts only|for parts|repair)\b/i;
const minimumCategoryComps = 2;
const maximumResultCategories = 4;
const cacheTtlMilliseconds = 1000 * 60 * 60 * 6;
const persistentCacheTtlMilliseconds = 1000 * 60 * 60 * 24;
const responseCache = new Map();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || OPENAI_MODEL;
const OPENAI_WEB_SEARCH_TOOL_TYPE = process.env.OPENAI_WEB_SEARCH_TOOL_TYPE || "web_search";
const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_API_KEY || "";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID || "";
const RAPIDAPI_GOOGLE_IMAGES_HOST = process.env.RAPIDAPI_GOOGLE_IMAGES_HOST || "google-search72.p.rapidapi.com";
const RAPIDAPI_GOOGLE_IMAGES_PATH = process.env.RAPIDAPI_GOOGLE_IMAGES_PATH || "/imagesearch";
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
  const forceRefresh = /^(1|true|yes)$/i.test(String(req.query.refresh || ""));
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

    const cachedResponse = forceRefresh ? null : getCachedResponse(brand);
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
    if (!forceRefresh && persistentCache && new Date(persistentCache.expiresAt).getTime() > Date.now()) {
      res.status(200).json(markCachedResponse(persistentCache.responseData, "persistent-cache", persistentCache));
      return;
    }

    const marketplaceData = await getMarketplaceData(brand);

    const categories = selectTopResultCategories(
      marketplaceData.categories.filter((category) => category.soldListings >= minimumCategoryComps),
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
  return {
    categories: categories.map((category) => mapCategoryResponse(brand, category, data)),
    tagReferences: await getTagReferences(brand),
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

async function getTagReferences(brand) {
  const rapidApiGoogleReferences = await getRapidApiGoogleImageTagReferences(brand);
  if (rapidApiGoogleReferences.length > 0) return rapidApiGoogleReferences;
  const openAiReferences = await getOpenAiTagReferences(brand);
  if (openAiReferences.length > 0) return openAiReferences;
  return getGoogleImageTagReferences(brand);
}

function normalizeMarketplaceResponseCategories(responseData) {
  if (!responseData || !Array.isArray(responseData.categories)) return responseData;
  const categories = selectTopResultCategories(responseData.categories).map(normalizeCategoryImages);
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

function normalizeCategoryImages(category) {
  return {
    ...category,
    topItems: Array.isArray(category.topItems)
      ? category.topItems.map((item) => ({
          ...item,
          imageUrl: getFullSizeEbayImageUrl(item.imageUrl),
        }))
      : [],
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

async function getGoogleImageTagReferences(brand) {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_ID) return [];

  const queries = [
    `${brand} tags`,
    `${brand} tag label close up`,
    `${brand} clothing label`,
    `${brand} vintage neck tag`,
  ];
  const candidates = [];
  const seenImages = new Set();

  for (const query of queries) {
    try {
      const searchParams = new URLSearchParams({
        key: GOOGLE_CSE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: query,
        searchType: "image",
        num: "10",
        safe: "active",
      });
      const response = await getJson("customsearch.googleapis.com", `/customsearch/v1?${searchParams.toString()}`);
      for (const item of Array.isArray(response.items) ? response.items : []) {
        const imageUrl = String(item.link || "").trim();
        if (!imageUrl || seenImages.has(imageUrl)) continue;
        seenImages.add(imageUrl);
        candidates.push({
          title: String(item.title || item.snippet || `${brand} clothing tag`).trim(),
          imageUrl,
          listingUrl: String(item.image?.contextLink || item.displayLink || "").trim(),
        });
      }
    } catch (error) {
      console.warn(`Google image tag lookup unavailable for ${brand}:`, error.message);
    }

    if (candidates.length >= 12) break;
  }

  const seenVerifiedCandidates = new Set();
  const imageCandidates = candidates
    .filter((reference) => isLikelyTagImageUrl(reference.imageUrl))
    .filter((reference) => !seenVerifiedCandidates.has(reference.imageUrl) && seenVerifiedCandidates.add(reference.imageUrl))
    .slice(0, 12);
  return verifyTagReferenceImages(brand, imageCandidates);
}

async function getRapidApiGoogleImageTagReferences(brand) {
  if (!process.env.RAPIDAPI_KEY || !RAPIDAPI_GOOGLE_IMAGES_HOST) return [];

  const queries = [
    `${brand} clothing tag label close up`,
    `${brand} vintage neck tag`,
    `${brand} care tag`,
    `${brand} inside label`,
  ];
  const candidates = [];
  const seenImages = new Set();

  for (const query of queries) {
    try {
      const searchParams = new URLSearchParams({
        q: query,
        query,
        lr: "en-US",
        num: "10",
      });
      const response = await getJson(
        RAPIDAPI_GOOGLE_IMAGES_HOST,
        `${RAPIDAPI_GOOGLE_IMAGES_PATH}?${searchParams.toString()}`,
        {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
          "x-rapidapi-host": RAPIDAPI_GOOGLE_IMAGES_HOST,
        },
      );

      for (const reference of extractRapidApiImageReferences(response, brand)) {
        if (!reference.imageUrl || seenImages.has(reference.imageUrl)) continue;
        seenImages.add(reference.imageUrl);
        candidates.push(reference);
      }
    } catch (error) {
      console.warn(`RapidAPI Google image tag lookup unavailable for ${brand}:`, error.message);
    }

    if (candidates.length >= 12) break;
  }

  return verifyTagReferenceImages(brand, sanitizeTagReferences(candidates, 12));
}

async function getOpenAiTagReferences(brand) {
  if (!process.env.OPENAI_API_KEY) return [];

  const payload = {
    model: OPENAI_SEARCH_MODEL,
    tools: [
      {
        type: OPENAI_WEB_SEARCH_TOOL_TYPE,
        search_content_types: ["image", "text"],
        image_settings: {
          max_results: 10,
          caption: true,
        },
      },
    ],
    include: ["web_search_call.results"],
    input: `Search for real close-up image references of ${brand} clothing tags or sewn labels. Favor neck labels, care tags, waist tags, size tags, inside labels, and vintage brand tags. Avoid outfit photos, product listings that only say NWT or with tags, logos, model photos, flat lays, and storefront images.`,
    max_output_tokens: 350,
  };

  try {
    const response = await postJson("api.openai.com", "/v1/responses", payload, {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    });
    const references = extractOpenAiImageSearchReferences(response, brand);
    return verifyTagReferenceImages(brand, sanitizeTagReferences(references, 10));
  } catch (error) {
    console.warn(`OpenAI tag reference lookup unavailable for ${brand}:`, error.message);
    return [];
  }
}

function extractRapidApiImageReferences(response, brand) {
  const resultGroups = [
    response?.image_results,
    response?.images,
    response?.items,
    response?.results,
    response?.data,
    response?.organic,
  ];
  const references = [];

  for (const group of resultGroups) {
    for (const item of Array.isArray(group) ? group : []) {
      const imageUrl = String(
        item.image ||
          item.image_url ||
          item.imageUrl ||
          item.original ||
          item.originalImageUrl ||
          item.original_image ||
          item.thumbnail ||
          item.thumbnailImageUrl ||
          item.thumbnail_url ||
          "",
      ).trim();
      const listingUrl = String(
        item.contextLink || item.link || item.url || item.source || item.source_url || item.sourceUrl || "",
      ).trim();
      if (!imageUrl) continue;

      references.push({
        title: String(item.title || item.caption || item.snippet || `${brand} clothing tag reference`).trim(),
        imageUrl,
        listingUrl,
      });
    }
  }

  return references;
}

function extractOpenAiImageSearchReferences(response, brand) {
  const references = [];

  for (const item of Array.isArray(response?.output) ? response.output : []) {
    const results = Array.isArray(item.results)
      ? item.results
      : Array.isArray(item.action?.results)
        ? item.action.results
        : [];

    for (const result of results) {
      const imageUrl = String(result.image_url || result.imageUrl || "").trim();
      const sourceUrl = String(result.source_website_url || result.sourceUrl || "").trim();
      if (!imageUrl) continue;

      references.push({
        title: String(result.caption || result.title || `${brand} clothing tag reference`).trim(),
        imageUrl,
        listingUrl: sourceUrl,
      });
    }
  }

  if (references.length > 0) return references;

  try {
    const parsed = JSON.parse(extractResponseText(response));
    return Array.isArray(parsed.references) ? parsed.references : [];
  } catch (error) {
    return [];
  }
}

function sanitizeTagReferences(references, limit = 3) {
  const seenImages = new Set();
  return (Array.isArray(references) ? references : [])
    .map((reference) => ({
      title: String(reference.title || "").trim(),
      imageUrl: String(reference.imageUrl || "").trim(),
      listingUrl: String(reference.sourceUrl || reference.listingUrl || "").trim(),
    }))
    .filter(
      (reference) =>
        isLikelyTagImageUrl(reference.imageUrl) &&
        !seenImages.has(reference.imageUrl) &&
        seenImages.add(reference.imageUrl),
    )
    .slice(0, limit);
}

async function verifyTagReferenceImages(brand, references) {
  if (!process.env.OPENAI_API_KEY || references.length === 0) return [];

  const verified = [];
  for (const reference of references) {
    try {
      if (await verifyTagReferenceImage(brand, reference)) verified.push(reference);
    } catch (error) {
      console.warn(`Could not verify tag image for ${brand}:`, error.message);
    }
    if (verified.length >= 3) break;
  }

  return verified;
}

async function verifyTagReferenceImage(brand, reference) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      isTagCloseup: { type: "boolean" },
      reason: { type: "string" },
    },
    required: ["isTagCloseup", "reason"],
  };
  const payload = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You verify reseller clothing tag reference images. Accept only images where a sewn clothing label, neck tag, care tag, waist tag, size tag, or brand tag is clearly visible and is the main subject. Reject product photos, people wearing clothes, flat lays, logos, placeholders, and images where the tag is not visible.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Does this image clearly show an actual ${brand} clothing tag or sewn label close-up?`,
          },
          {
            type: "input_image",
            image_url: reference.imageUrl,
            detail: "low",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tag_image_verification",
        strict: true,
        schema,
      },
    },
    max_output_tokens: 120,
  };
  const response = await postJson("api.openai.com", "/v1/responses", payload, {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  });
  return Boolean(JSON.parse(extractResponseText(response)).isTagCloseup);
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

function getMarketplaceCacheKey(brand) {
  return `marketplace:v13:${normalizeBrand(brand)}:${lookbackDays}`;
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
        imageUrl: getProductImageUrl(product),
        listingUrl: /^https:\/\//i.test(String(product.link || "")) ? product.link : "",
        itemId: String(product.item_id || ""),
      })),
  };
}

function getProductImageUrl(product) {
  const candidates = [
    product.image_url,
    product.imageUrl,
    product.gallery_url,
    product.galleryURL,
    product.thumbnail,
    product.thumbnail_url,
    product.picture_url,
    product.pictureURL,
  ];
  const imageUrl = candidates.map((value) => String(value || "").trim()).find((value) => /^https:\/\//i.test(value));
  return getFullSizeEbayImageUrl(imageUrl);
}

function getFullSizeEbayImageUrl(value) {
  const url = String(value || "").trim();
  if (!/^https:\/\//i.test(url)) return "";
  return url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)([?#].*)?$/i, "/s-l500.$1$2");
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

function getJson(hostname, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: "GET",
        hostname,
        path: requestPath,
        headers,
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

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed.error?.message || `Request failed with ${response.statusCode}`));
            return;
          }

          resolve(parsed);
        });
      },
    );

    request.on("error", reject);
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

function isSoldWithinDays(dateSold, days) {
  const soldAt = new Date(dateSold);
  if (Number.isNaN(soldAt.getTime())) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return soldAt >= cutoff;
}

function hasUsableResalePrice(product) {
  const price = Number(product.sale_price);
  const title = String(product?.title || "");
  return Number.isFinite(price) && price > 0 && price <= maximumResalePrice && !unusableCompTitlePattern.test(title);
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}
