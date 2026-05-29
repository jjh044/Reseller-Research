const https = require("https");

const categories = [
  { name: "Fleece", keywords: ["fleece", "synchilla", "sweater", "pullover"] },
  { name: "Jackets", keywords: ["jacket", "coat", "parka", "shell", "vest"] },
  { name: "Shirts", keywords: ["shirt", "tee", "t-shirt", "flannel", "button"] },
  { name: "Pants", keywords: ["pants", "jeans", "shorts", "trousers", "joggers"] },
];

const excludedKeywords = "damaged fake replica lot read stains broken parts only";
const lookbackDays = 90;
const minimumResalePrice = 5;
const maximumResalePrice = 500;

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

    const data = await findCompletedItems(brand);
    res.status(200).json({
      brand,
      generatedAt: new Date().toISOString(),
      source: "eBay Average Selling Price API",
      categories: categories.map((category) => mapCategoryResponse(category, data)),
    });
  } catch (error) {
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

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
  const categoryProducts = matchedProducts.length > 0 ? matchedProducts : recentProducts.slice(0, 8);
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
