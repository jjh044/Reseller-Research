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
const cacheTtlMilliseconds = 1000 * 60 * 60 * 6;
const responseCache = new Map();

module.exports = async function handler(req, res) {
  try {
    if (!process.env.RAPIDAPI_KEY) {
      res.status(500).json({ error: "Missing RAPIDAPI_KEY environment variable" });
      return;
    }

    const brand = String(req.query.brand || "").trim();
    if (!brand) {
      res.status(400).json({ error: "Missing brand query parameter" });
      return;
    }

    const cachedResponse = getCachedResponse(brand);
    if (cachedResponse) {
      res.status(200).json(cachedResponse);
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

    responseCache.set(normalizeBrand(brand), {
      expiresAt: Date.now() + cacheTtlMilliseconds,
      responseBody,
    });
    res.status(200).json(responseBody);
  } catch (error) {
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

function getCachedResponse(brand) {
  const cacheKey = normalizeBrand(brand);
  const cached = responseCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
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

function findCompletedItems(keywords) {
  return postJson(
    "ebay-average-selling-price.p.rapidapi.com",
    "/findCompletedItems",
    {
      keywords,
      excluded_keywords: excludedKeywords,
      max_search_results: "60",
      category_id: "15724",
      remove_outliers: "true",
      site_id: "0",
      aspects: [],
    },
    {
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": "ebay-average-selling-price.p.rapidapi.com",
      "Content-Type": "application/json",
    },
  );
}

function mapCategoryResponse(category, data) {
  const products = Array.isArray(data.products) ? data.products : [];
  const recentProducts = products.filter(
    (product) => isSoldWithinDays(product.date_sold, lookbackDays) && hasUsableResalePrice(product),
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

function estimateSellThroughRate(results, totalResults) {
  const returnedVolume = Math.min(results, 60) / 120;
  const marketDepth = Math.min(totalResults, 5000) / 50000;
  return Math.min(Math.max(0.34 + returnedVolume + marketDepth, 0.32), 0.86);
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}
