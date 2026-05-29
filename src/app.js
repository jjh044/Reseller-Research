const categorySeeds = {
  patagonia: [
    ["Fleece", 64, 0.74, ["Synchilla Snap-T Pullover", "Better Sweater Jacket", "Retro Pile Vest"]],
    ["Jackets", 92, 0.68, ["Nano Puff Jacket", "Torrentshell Rain Jacket", "Houdini Windbreaker"]],
    ["Shirts", 31, 0.53, ["Capilene Cool Tee", "Organic Cotton Flannel", "P-6 Logo Tee"]],
    ["Pants", 47, 0.49, ["Quandary Hiking Pants", "Baggies Shorts", "Terrebonne Joggers"]],
  ],
  "levi's": [
    ["Jeans", 42, 0.79, ["501 Original Fit Jeans", "Wedgie Straight Jeans", "505 Regular Jeans"]],
    ["Jackets", 58, 0.63, ["Type III Trucker Jacket", "Sherpa Trucker Jacket", "Vintage Denim Jacket"]],
    ["Shirts", 27, 0.44, ["Western Denim Shirt", "Graphic Logo Tee", "Plaid Work Shirt"]],
    ["Shorts", 24, 0.38, ["501 Cutoff Shorts", "High Loose Shorts", "Bermuda Denim Shorts"]],
  ],
  "free people": [
    ["Dresses", 54, 0.71, ["Adella Slip Dress", "Feeling Groovy Maxi", "Oasis Midi Dress"]],
    ["Tops", 36, 0.65, ["Intimately Cami", "Easy Street Tunic", "We The Free Henley"]],
    ["Sweaters", 49, 0.58, ["Ottoman Slouchy Tunic", "Bonfire Cardigan", "Low Tide Pullover"]],
    ["Jeans", 46, 0.46, ["CRVY Flare Jeans", "Good Luck Barrel Jeans", "Moxie Pull-On Jeans"]],
  ],
};

const fallbackCategories = [
  ["Jeans", 38, 0.62, ["High Rise Straight Jeans", "Vintage Wash Denim", "Relaxed Fit Jeans"]],
  ["Shirts", 29, 0.56, ["Logo Tee", "Linen Button Down", "Plaid Overshirt"]],
  ["Jackets", 61, 0.51, ["Utility Jacket", "Quilted Coat", "Denim Trucker Jacket"]],
  ["Dresses", 44, 0.47, ["Midi Dress", "Wrap Dress", "Sleeveless Maxi Dress"]],
];

const form = document.querySelector("#brand-form");
const input = document.querySelector("#brand-input");
const report = document.querySelector("#report");
const loadingState = document.querySelector("#loading-state");
const button = document.querySelector("#generate-button");
const pdfButton = document.querySelector("#download-pdf-button");
const pdfStatus = document.querySelector("#pdf-status");
let currentReportData = null;

const initialBrand = new URLSearchParams(window.location.search).get("brand");
if (initialBrand) {
  input.value = initialBrand;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const brand = input.value.trim();

  if (!brand) {
    input.focus();
    return;
  }

  setLoading(true);
  const marketplaceData = await fetchEbayAverageSellingPrice(brand);
  const aiInsights = await generateAiInsights(marketplaceData);
  currentReportData = { ...marketplaceData, aiInsights };
  renderReport(currentReportData);
  setLoading(false);
});

pdfButton.addEventListener("click", () => {
  if (!currentReportData) return;

  const previousTitle = document.title;
  document.title = `${slugify(currentReportData.brand)}-reseller-brand-intelligence`;
  window.print();
  document.title = previousTitle;
});

function setLoading(isLoading) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "Generating..." : "Generate sheet";
  pdfButton.disabled = isLoading || !currentReportData;
  pdfStatus.textContent = isLoading
    ? "Preparing the AI cheat sheet..."
    : currentReportData
      ? "PDF-ready cheat sheet is available."
      : "Generate a sheet to enable PDF export.";
  loadingState.hidden = !isLoading;
  report.classList.toggle("is-muted", isLoading);
}

async function fetchEbayAverageSellingPrice(brand) {
  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch(`/api/ebay-average-selling-price?brand=${encodeURIComponent(brand)}`);
      if (!response.ok) {
        throw new Error(`eBay ASP request failed with ${response.status}`);
      }

      const data = await response.json();
      return {
        ...data,
        generatedAt: new Date(data.generatedAt),
      };
    } catch (error) {
      console.warn("Falling back to mock eBay ASP data:", error);
    }
  }

  return fetchMockEbayAverageSellingPrice(brand);
}

async function fetchMockEbayAverageSellingPrice(brand) {
  await wait(520);

  const normalized = brand.toLowerCase();
  const seed = categorySeeds[normalized] ?? fallbackCategories;
  const brandAdjustment = getBrandAdjustment(brand);

  const categories = seed.map(([name, asp, sellThroughRate, topItems], index) => {
    const adjustedAsp = Math.round(asp * brandAdjustment + index * 2);
    const adjustedSellThrough = clamp(sellThroughRate + (brandAdjustment - 1) / 5, 0.32, 0.86);

    return {
      name,
      averageSalePrice: adjustedAsp,
      sellThroughRate: adjustedSellThrough,
      soldListings: Math.round(90 + adjustedSellThrough * 170 + index * 14),
      activeListings: Math.round(110 + (1 - adjustedSellThrough) * 220 + index * 18),
      topItems: topItems.map((title, itemIndex) => ({
        title: `${brand} ${title}`,
        salePrice: Math.max(14, adjustedAsp + 18 - itemIndex * 8),
        daysToSell: Math.round(5 + itemIndex * 4 + (1 - adjustedSellThrough) * 18),
      })),
    };
  });

  return {
    brand,
    generatedAt: new Date(),
    source: "Mock eBay Average Selling Price API",
    categories,
  };
}

async function generateAiInsights(marketplaceData) {
  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch("/api/ai-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(marketplaceData),
      });

      if (!response.ok) {
        throw new Error(`AI insights request failed with ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.warn("Falling back to mock AI insights:", error);
    }
  }

  return generateMockAiInsights(marketplaceData);
}

async function generateMockAiInsights(marketplaceData) {
  await wait(420);

  const scoredCategories = marketplaceData.categories
    .map((category) => ({
      ...category,
      score: category.averageSalePrice * category.sellThroughRate,
    }))
    .sort((a, b) => b.score - a.score);

  const strongest = scoredCategories.slice(0, 2);
  const fastest = [...marketplaceData.categories].sort((a, b) => b.sellThroughRate - a.sellThroughRate)[0];
  const premium = [...marketplaceData.categories].sort((a, b) => b.averageSalePrice - a.averageSalePrice)[0];

  return {
    headline: `${marketplaceData.brand} looks strongest in ${strongest.map((category) => category.name).join(" and ")}.`,
    recommendation: `Prioritize ${strongest[0].name.toLowerCase()} when buy cost leaves room for a 3x-4x multiple. ${fastest.name} has the cleanest velocity signal, while ${premium.name} creates the highest average gross sale opportunity.`,
    strongestCategories: strongest,
  };
}

function renderReport(data) {
  const { totalSold, totalActive, blendedAsp, blendedStr } = summarizeReportData(data);
  const maxScore = Math.max(...data.categories.map((category) => category.averageSalePrice * category.sellThroughRate));
  const categoriesByAsp = [...data.categories].sort((a, b) => b.averageSalePrice - a.averageSalePrice);
  const boloRows = data.categories
    .filter((category) => category.topItems.length > 0)
    .map((category) => ({ category, item: category.topItems[0] }))
    .sort((a, b) => b.item.salePrice - a.item.salePrice);

  report.innerHTML = `
    <header class="report-header">
      <div>
        <p class="eyebrow">${data.source}</p>
        <h2>${escapeHtml(data.brand)}</h2>
        <p class="timestamp">Generated ${formatDate(data.generatedAt)}</p>
      </div>
      <div class="grade">
        <span>${getGrade(blendedAsp, blendedStr)}</span>
        Resale grade
      </div>
    </header>

    <section class="kpi-grid" aria-label="Brand summary metrics">
      ${renderKpi("Blended ASP", formatCurrency(blendedAsp), "Average sold price across tracked clothing categories")}
      ${renderKpi("Sell-through", formatPercent(blendedStr), "Sold listings divided by sold plus active listings")}
      ${renderKpi("Sold comps", totalSold.toLocaleString(), "Mock completed listings in the analysis window")}
      ${renderKpi("Active listings", totalActive.toLocaleString(), "Current mock supply visible in resale market")}
    </section>

    <section class="insight-band">
      <div>
        <p class="eyebrow">AI readout</p>
        <h3>${escapeHtml(data.aiInsights.headline)}</h3>
      </div>
      <p>${escapeHtml(data.aiInsights.recommendation)}</p>
    </section>

    <section class="category-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow section-title">Category performance</p>
        </div>
      </div>
      <div class="category-grid">
        ${categoriesByAsp.map((category) => renderCategory(category, maxScore, data.aiInsights.strongestCategories)).join("")}
      </div>
    </section>

    <section class="top-items-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow bolo-heading">BOLO'S</p>
        </div>
      </div>
      <div class="item-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Item</th>
              <th>Sold price</th>
              <th>Sale timing</th>
            </tr>
          </thead>
          <tbody>
            ${boloRows.map(({ category, item }) => renderItemRow(category, item)).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function summarizeReportData(data) {
  const totalSold = data.categories.reduce((sum, category) => sum + category.soldListings, 0);
  const totalActive = data.categories.reduce((sum, category) => sum + category.activeListings, 0);
  const blendedAsp = Math.round(
    data.categories.reduce((sum, category) => sum + category.averageSalePrice, 0) / data.categories.length,
  );
  const blendedStr = totalSold / (totalSold + totalActive);

  return {
    totalSold,
    totalActive,
    blendedAsp,
    blendedStr,
  };
}

function renderKpi(label, value, detail) {
  return `
    <div class="kpi">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${detail}</p>
    </div>
  `;
}

function renderCategory(category, maxScore, strongestCategories) {
  const score = category.averageSalePrice * category.sellThroughRate;
  const strength = Math.round((score / maxScore) * 100);
  const isStrong = strongestCategories.some((strongCategory) => strongCategory.name === category.name);

  return `
    <article class="category-card">
      <div class="category-card-header">
        <div>
          <h4>${category.name}</h4>
          ${isStrong ? '<span class="tag">Strong category</span>' : '<span class="tag neutral">Watch category</span>'}
        </div>
      </div>
      <dl>
        <div>
          <dt>ASP</dt>
          <dd>${formatCurrency(category.averageSalePrice)}</dd>
        </div>
        <div>
          <dt>STR</dt>
          <dd>${formatPercent(category.sellThroughRate)}</dd>
        </div>
      </dl>
      <div class="meter" aria-label="${category.name} opportunity score ${strength}%">
        <span style="width: ${strength}%"></span>
      </div>
    </article>
  `;
}

function renderItemRow(category, item) {
  return `
    <tr>
      <td>${category.name}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${formatCurrency(item.salePrice)}</td>
      <td>${escapeHtml(item.soldDate || `${item.daysToSell} days`)}</td>
    </tr>
  `;
}

function getGrade(asp, sellThroughRate) {
  const score = asp * sellThroughRate;
  if (score >= 45) return "A";
  if (score >= 34) return "B";
  return "C";
}

function getBrandAdjustment(brand) {
  const letters = brand.replace(/[^a-z]/gi, "").length || 1;
  return clamp(0.9 + (letters % 7) / 20, 0.9, 1.2);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
