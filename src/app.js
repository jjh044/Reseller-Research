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
  levis: [
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

const appShell = document.querySelector("#app-shell");
const authShell = document.querySelector("#auth-shell");
const authActions = document.querySelector("#auth-actions");
const authStatus = document.querySelector("#auth-status");
const authMount = document.querySelector("#clerk-auth-mount");
const userButtonMount = document.querySelector("#user-button-mount");
const accountEmail = document.querySelector("#account-email");
const showSignInButton = document.querySelector("#show-sign-in-button");
const showSignUpButton = document.querySelector("#show-sign-up-button");
const form = document.querySelector("#brand-form");
const input = document.querySelector("#brand-input");
const report = document.querySelector("#report");
const loadingState = document.querySelector("#loading-state");
const button = document.querySelector("#generate-button");
const saveBrandFileButton = document.querySelector("#save-brand-file-button");
const pdfButton = document.querySelector("#download-pdf-button");
const pdfStatus = document.querySelector("#pdf-status");
const labelCameraInput = document.querySelector("#label-camera-input");
const labelImageInput = document.querySelector("#label-image-input");
const identifyLabelButton = document.querySelector("#identify-label-button");
const labelPreview = document.querySelector("#label-preview");
const labelPreviewImage = document.querySelector("#label-preview-image");
const labelStatus = document.querySelector("#label-status");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const brandFileCount = document.querySelector("#brand-file-count");
const brandFileEmpty = document.querySelector("#brand-file-empty");
const brandFileList = document.querySelector("#brand-file-list");
const brandFileStorageKey = "reseller-brand-file-v1";
const searchHistoryStorageKey = "flipfile-search-history-v1";
let currentReportData = null;
let selectedLabelImage = null;
let clerk = null;

const initialBrand = new URLSearchParams(window.location.search).get("brand");
if (initialBrand) {
  input.value = initialBrand;
}

await initializeAuth();

tabButtons.forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    activateTab(tabButton.dataset.tabTarget);
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const brand = input.value.trim();

  if (!brand) {
    input.focus();
    return;
  }

  await generateReportForBrand(brand);
});

labelCameraInput.addEventListener("change", () => {
  labelImageInput.value = "";
  handleLabelImageSelection(labelCameraInput.files?.[0]);
});

labelImageInput.addEventListener("change", () => {
  labelCameraInput.value = "";
  handleLabelImageSelection(labelImageInput.files?.[0]);
});

async function handleLabelImageSelection(file) {
  selectedLabelImage = null;
  identifyLabelButton.disabled = true;

  if (!file) {
    labelPreview.hidden = true;
    labelPreviewImage.removeAttribute("src");
    labelStatus.textContent = "No label photo selected.";
    return;
  }

  if (!file.type.startsWith("image/")) {
    labelPreview.hidden = true;
    labelStatus.textContent = "Choose an image file of the clothing label.";
    return;
  }

  try {
    labelStatus.textContent = "Preparing label photo...";
    selectedLabelImage = await fileToImageDataUrl(file);
    labelPreviewImage.src = selectedLabelImage;
    labelPreview.hidden = false;
    identifyLabelButton.disabled = false;
    labelStatus.textContent = "Ready to identify this label.";
  } catch (error) {
    console.error(error);
    labelPreview.hidden = true;
    labelStatus.textContent = error.message;
  }
}

identifyLabelButton.addEventListener("click", async () => {
  if (!selectedLabelImage) return;

  identifyLabelButton.disabled = true;
  labelStatus.textContent = "Reading label...";
  setLoading(true);

  try {
    const detected = await identifyClothingLabel(selectedLabelImage);
    input.value = detected.brand;
    labelStatus.textContent = `Detected ${detected.brand} (${formatConfidence(detected.confidence)} confidence).`;
    await generateReportForBrand(detected.brand);
  } catch (error) {
    console.error(error);
    currentReportData = null;
    report.innerHTML = "";
    labelStatus.textContent = error.message;
    pdfStatus.textContent = error.message;
  } finally {
    setLoading(false);
    identifyLabelButton.disabled = !selectedLabelImage;
  }
});

async function generateReportForBrand(brand) {
  setLoading(true);
  let loadError = null;
  try {
    const marketplaceData = await fetchEbayAverageSellingPrice(brand);
    const aiInsights = await generateAiInsights(marketplaceData);
    currentReportData = {
      ...marketplaceData,
      aiInsights,
      sourcing: buildSourcingGuidance(marketplaceData, aiInsights),
    };
    saveSearchHistory(currentReportData);
    renderReport(currentReportData);
  } catch (error) {
    console.error(error);
    loadError = error;
    currentReportData = null;
    report.innerHTML = "";
  } finally {
    setLoading(false);
    if (loadError) {
      pdfStatus.textContent = loadError.message;
    }
  }
}

saveBrandFileButton.addEventListener("click", async () => {
  if (!currentReportData) return;

  try {
    await saveBrandFile(currentReportData);
    renderBrandFile();
    pdfStatus.textContent = `${currentReportData.brand} was added to Brand file.`;
  } catch (error) {
    console.error(error);
    pdfStatus.textContent = error.message;
  }
});

pdfButton.addEventListener("click", () => {
  if (!currentReportData) return;

  saveBrandFile(currentReportData)
    .then(renderBrandFile)
    .catch((error) => {
      console.error(error);
      pdfStatus.textContent = error.message;
    });

  const previousTitle = document.title;
  document.title = `${slugify(currentReportData.brand)}-reseller-brand-intelligence`;
  window.print();
  document.title = previousTitle;
});

brandFileList.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-brand-file-action]");
  if (!actionButton) return;

  const brandFile = (await getBrandFiles()).find((item) => item.id === actionButton.dataset.brandFileId);
  if (!brandFile) return;

  currentReportData = reviveReportData(brandFile.reportData);
  renderReport(currentReportData);
  activateTab("results");

  if (actionButton.dataset.brandFileAction === "print") {
    const previousTitle = document.title;
    document.title = `${slugify(currentReportData.brand)}-reseller-brand-intelligence`;
    window.print();
    document.title = previousTitle;
  }
});

report.addEventListener("click", async (event) => {
  const historyButton = event.target.closest("[data-history-brand]");
  if (!historyButton) return;

  input.value = historyButton.dataset.historyBrand;
  await generateReportForBrand(historyButton.dataset.historyBrand);
});

showSignInButton.addEventListener("click", () => {
  mountAuthView("sign-in");
});

showSignUpButton.addEventListener("click", () => {
  mountAuthView("sign-up");
});

async function initializeAuth() {
  try {
    const configResponse = await fetch("/api/config");
    if (!configResponse.ok) throw new Error("Could not load app configuration.");

    const config = await configResponse.json();
    if (!config.clerkPublishableKey) {
      throw new Error("Clerk publishable key is not configured.");
    }

    await loadClerkBrowserSdk(config.clerkPublishableKey);
    clerk = window.Clerk;
    await clerk.load();

    clerk.addListener(() => {
      syncAuthState(config.clerkServerConfigured);
    });

    syncAuthState(config.clerkServerConfigured);
  } catch (error) {
    console.error(error);
    authStatus.textContent = error.message;
    authActions.hidden = true;
    appShell.hidden = true;
    authShell.hidden = false;
  }
}

function syncAuthState(isServerAuthConfigured) {
  const isSignedIn = Boolean(clerk.user);

  if (!isSignedIn) {
    appShell.hidden = true;
    authShell.hidden = false;
    authStatus.textContent = isServerAuthConfigured
      ? ""
      : "Sign in is available. Add CLERK_SECRET_KEY in Vercel to enable account-based Brand files.";
    authActions.hidden = false;
    mountAuthView("sign-in");
    return;
  }

  authShell.hidden = true;
  appShell.hidden = false;
  accountEmail.textContent = clerk.user.primaryEmailAddress?.emailAddress || clerk.user.fullName || "Signed in";
  userButtonMount.innerHTML = "";
  clerk.mountUserButton(userButtonMount);
  if (!isServerAuthConfigured) {
    pdfStatus.textContent = "Add CLERK_SECRET_KEY in Vercel to enable account-based Brand files.";
  }
  renderBrandFile();
}

function mountAuthView(view) {
  if (!clerk || !authMount) return;

  authMount.innerHTML = "";
  authStatus.textContent = "";
  if (view === "sign-up") {
    clerk.mountSignUp(authMount, {
      signInUrl: window.location.href,
      afterSignUpUrl: window.location.href,
      afterSignInUrl: window.location.href,
    });
  } else {
    clerk.mountSignIn(authMount, {
      signUpUrl: window.location.href,
      afterSignInUrl: window.location.href,
      afterSignUpUrl: window.location.href,
    });
  }
}

function loadClerkBrowserSdk(publishableKey) {
  return new Promise((resolve, reject) => {
    if (window.Clerk) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-clerk-publishable-key", publishableKey);
    script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Clerk sign in."));
    document.head.appendChild(script);
  });
}

async function getAuthToken() {
  const token = await clerk?.session?.getToken();
  if (!token) throw new Error("Sign in is required to use Brand files.");
  return token;
}

function setLoading(isLoading) {
  if (isLoading) {
    activateTab("results");
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? "Scanning..." : "Scan & generate";
  saveBrandFileButton.disabled = isLoading || !currentReportData;
  pdfButton.disabled = isLoading || !currentReportData;
  pdfStatus.textContent = isLoading
    ? "Preparing the AI cheat sheet..."
    : currentReportData
      ? "PDF-ready cheat sheet is available."
      : "Generate a sheet to enable PDF export.";
  loadingState.hidden = !isLoading;
  report.classList.toggle("is-muted", isLoading);
}

function activateTab(tabName) {
  tabButtons.forEach((tabButton) => {
    const isActive = tabButton.dataset.tabTarget === tabName;
    tabButton.classList.toggle("is-active", isActive);
    tabButton.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((tabPanel) => {
    tabPanel.classList.toggle("is-active", tabPanel.dataset.tabPanel === tabName);
  });
}

async function saveBrandFile(reportData) {
  const id = normalizeBrandFileId(reportData.brand);
  const savedFile = {
    id,
    brand: reportData.brand,
    savedAt: new Date().toISOString(),
    reportData: serializeReportData(reportData),
  };

  try {
    const response = await fetch("/api/brand-files", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify(savedFile),
    });

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, "Could not save Brand file to database."));
    }

    return response.json();
  } catch (error) {
    console.warn("Saving Brand file locally:", error);
    if (clerk?.user) throw error;
    saveLocalBrandFile(savedFile);
    return savedFile;
  }
}

async function getBrandFiles() {
  try {
    const response = await fetch("/api/brand-files", {
      headers: {
        Authorization: `Bearer ${await getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, "Could not load Brand file database."));
    }

    return response.json();
  } catch (error) {
    console.warn("Loading Brand file locally:", error);
    if (clerk?.user) throw error;
    return getLocalBrandFiles();
  }
}

function saveLocalBrandFile(savedFile) {
  const savedFiles = getLocalBrandFiles();
  const nextFiles = savedFiles.filter((item) => item.id !== savedFile.id).concat(savedFile);
  localStorage.setItem(brandFileStorageKey, JSON.stringify(nextFiles));
}

function getLocalBrandFiles() {
  try {
    const files = JSON.parse(localStorage.getItem(brandFileStorageKey) || "[]");
    return Array.isArray(files) ? files : [];
  } catch (error) {
    console.warn("Could not read brand file storage:", error);
    return [];
  }
}

async function renderBrandFile() {
  let savedFiles = [];
  try {
    savedFiles = (await getBrandFiles()).sort((a, b) => a.brand.localeCompare(b.brand));
  } catch (error) {
    console.error(error);
    brandFileCount.textContent = "Brand file unavailable";
    brandFileEmpty.hidden = false;
    brandFileEmpty.textContent = error.message;
    brandFileList.innerHTML = "";
    return;
  }

  brandFileCount.textContent = `${savedFiles.length} saved ${savedFiles.length === 1 ? "sheet" : "sheets"}`;
  brandFileEmpty.hidden = savedFiles.length > 0;
  brandFileEmpty.textContent = "Download a brand PDF to save it here.";

  brandFileList.innerHTML = savedFiles
    .map(
      (savedFile) => `
        <article class="brand-file-item">
          <div>
            <h3>${escapeHtml(savedFile.brand)}</h3>
            <p>Saved ${formatDate(new Date(savedFile.savedAt))}</p>
          </div>
          <div class="brand-file-actions">
            <button type="button" data-brand-file-action="open" data-brand-file-id="${escapeHtml(savedFile.id)}">
              Open
            </button>
            <button type="button" class="secondary-button" data-brand-file-action="print" data-brand-file-id="${escapeHtml(savedFile.id)}">
              Download PDF
            </button>
          </div>
        </article>
      `,
    )
    .join("");
}

function serializeReportData(reportData) {
  return {
    ...reportData,
    generatedAt: reportData.generatedAt instanceof Date ? reportData.generatedAt.toISOString() : reportData.generatedAt,
  };
}

function reviveReportData(reportData) {
  const revived = {
    ...reportData,
    generatedAt: new Date(reportData.generatedAt),
  };
  if (!revived.sourcing && Array.isArray(revived.categories)) {
    revived.sourcing = buildSourcingGuidance(revived, revived.aiInsights || {});
  }
  return revived;
}

async function fetchEbayAverageSellingPrice(brand) {
  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch(`/api/ebay-average-selling-price?brand=${encodeURIComponent(brand)}`);
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Could not load live eBay data."));
      }

      const data = await response.json();
      return {
        ...data,
        generatedAt: new Date(data.generatedAt),
      };
    } catch (error) {
      console.warn("Falling back to local marketplace estimate:", error);
      return fetchMockEbayAverageSellingPrice(brand, error.message);
    }
  }

  return fetchMockEbayAverageSellingPrice(brand);
}

async function identifyClothingLabel(imageDataUrl) {
  const response = await fetch("/api/identify-label", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: imageDataUrl }),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, "Could not identify this label."));
  }

  const detected = await response.json();
  if (!detected.brand) {
    throw new Error("Could not find a readable brand name on this label.");
  }

  return detected;
}

function fileToImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(resizeImageToDataUrl(image));
      image.onerror = () => reject(new Error("Could not read this label image."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not load this label image."));
    reader.readAsDataURL(file);
  });
}

function resizeImageToDataUrl(image) {
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.82);
}

async function fetchMockEbayAverageSellingPrice(brand, fallbackReason = "") {
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
    source: fallbackReason
      ? `Estimated data - live eBay unavailable: ${fallbackReason}`
      : "Estimated marketplace model",
    dataMode: "estimated",
    lookbackDays: 90,
    sampleSize: categories.reduce((sum, category) => sum + category.soldListings, 0),
    confidence: {
      level: fallbackReason ? "low" : "medium",
      sampleSize: categories.reduce((sum, category) => sum + category.soldListings, 0),
      note: fallbackReason
        ? "Live marketplace data was unavailable. Treat this report as directional."
        : "Estimated model data. Validate buys with live sold comps before paying up.",
    },
    cache: {
      status: "local-estimate",
      ttlHours: 0,
    },
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
        throw new Error(await getApiErrorMessage(response, "Could not generate AI insights."));
      }

      return response.json();
    } catch (error) {
      console.warn("Falling back to mock AI insights:", error);
    }
  }

  return generateMockAiInsights(marketplaceData);
}

async function getApiErrorMessage(response, fallbackMessage) {
  try {
    const details = await response.json();
    return details.message || details.error || fallbackMessage;
  } catch (error) {
    return fallbackMessage;
  }
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
  const strongestNames = strongest.map((category) => category.name).join(strongest.length > 1 ? " and " : "");

  return {
    headline: `${marketplaceData.brand} looks strongest in ${strongestNames}.`,
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
      ${renderKpi("Blended ASP", formatReportCurrency(blendedAsp, data), "Average sold price across tracked clothing categories")}
      ${renderKpi("Sell-through", formatPercent(blendedStr), "Sold listings divided by sold plus active listings")}
      ${renderKpi("Sold comps", totalSold.toLocaleString(), "Completed listings in the analysis window")}
      ${renderKpi("Active listings", totalActive.toLocaleString(), "Visible market supply in the analysis window")}
    </section>

    <section class="trust-band">
      <div>
        <p class="eyebrow">Data quality</p>
        <h3>${escapeHtml(getDataModeLabel(data))}</h3>
      </div>
      <dl>
        <div>
          <dt>Confidence</dt>
          <dd>${escapeHtml(data.confidence?.level || "unknown")}</dd>
        </div>
        <div>
          <dt>Sample</dt>
          <dd>${Number(data.confidence?.sampleSize || data.sampleSize || totalSold).toLocaleString()} comps</dd>
        </div>
        <div>
          <dt>Cache</dt>
          <dd>${escapeHtml(data.cache?.status || "none")}</dd>
        </div>
      </dl>
      <p>${escapeHtml(data.confidence?.note || "Review sold comps manually before making high-cost buys.")}</p>
    </section>

    <section class="insight-band">
      <div>
        <p class="eyebrow">AI readout</p>
        <h3>${escapeHtml(data.aiInsights.headline)}</h3>
      </div>
      <p>${escapeHtml(data.aiInsights.recommendation)}</p>
    </section>

    <section class="sourcing-grid" aria-label="Sourcing recommendation">
      ${renderSourcingCard("Buy/pass", data.sourcing?.decision || "Watch", data.sourcing?.decisionReason || "Review comps before buying.")}
      ${renderSourcingCard("Max buy", formatCurrency(data.sourcing?.maxBuyPrice || 0), "Target buy cost after marketplace fees and margin buffer.")}
      ${renderSourcingCard("Profit range", data.sourcing?.profitRange || "$0-$0", "Estimated net profit range after platform fees.")}
      ${renderSourcingCard("Avoid", data.sourcing?.avoidNotes || "Avoid damaged, replica, stained, or overly common basics.", "Common sourcing risks for this brand.")}
    </section>

    <section class="category-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow section-title">Category performance</p>
        </div>
      </div>
      <div class="category-grid">
        ${categoriesByAsp.map((category) => renderCategory(category, maxScore, data.aiInsights.strongestCategories, data)).join("")}
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

    ${renderSearchHistory()}
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

function renderSourcingCard(label, value, detail) {
  return `
    <article class="sourcing-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function buildSourcingGuidance(marketplaceData) {
  const { blendedAsp, blendedStr } = summarizeReportData(marketplaceData);
  const feeRate = 0.15;
  const shippingBuffer = 8;
  const targetMargin = marketplaceData.confidence?.level === "low" ? 0.34 : 0.42;
  const expectedNet = Math.max(0, blendedAsp * (1 - feeRate) - shippingBuffer);
  const maxBuyPrice = Math.max(3, Math.floor(expectedNet * targetMargin));
  const lowProfit = Math.max(0, Math.round(blendedAsp * 0.72 - maxBuyPrice - shippingBuffer));
  const highProfit = Math.max(lowProfit + 4, Math.round(blendedAsp * 0.86 - maxBuyPrice - shippingBuffer));
  const decisionScore = blendedAsp * blendedStr;
  const decision =
    marketplaceData.confidence?.level === "low"
      ? "Watch"
      : decisionScore >= 42
        ? "Buy"
        : decisionScore >= 28
          ? "Selective buy"
          : "Pass";
  const strongest = [...marketplaceData.categories].sort(
    (a, b) => b.averageSalePrice * b.sellThroughRate - a.averageSalePrice * a.sellThroughRate,
  )[0];

  return {
    decision,
    decisionReason:
      decision === "Buy"
        ? `${strongest.name} has the best price plus velocity signal.`
        : decision === "Selective buy"
          ? `Only buy stronger ${strongest.name.toLowerCase()} pieces below the max buy target.`
          : decision === "Watch"
            ? "Confidence is thin, so verify sold comps before sourcing."
            : "Price or velocity is not strong enough for routine sourcing.",
    maxBuyPrice,
    profitRange: `${formatCurrency(lowProfit)}-${formatCurrency(highProfit)}`,
    avoidNotes: getAvoidNotes(marketplaceData),
  };
}

function getAvoidNotes(marketplaceData) {
  const lowCategories = marketplaceData.categories
    .filter((category) => category.sellThroughRate < 0.48 || category.averageSalePrice < 30)
    .map((category) => category.name.toLowerCase())
    .slice(0, 2);
  const categoryNote = lowCategories.length ? `Be careful with ${lowCategories.join(" and ")}.` : "";
  return `${categoryNote} Avoid damaged, replica, stained, altered, or high-supply basics.`.trim();
}

function getDataModeLabel(data) {
  if (data.dataMode === "live") return "Live marketplace comps";
  if (data.dataMode === "cached-live") return "Cached live comps";
  if (data.dataMode === "estimated") return "Estimated fallback data";
  return data.source || "Marketplace data";
}

function saveSearchHistory(reportData) {
  const owner = clerk?.user?.id || "local";
  const storageKey = `${searchHistoryStorageKey}:${owner}`;
  const nextItem = {
    brand: reportData.brand,
    generatedAt: serializeReportData(reportData).generatedAt,
    decision: reportData.sourcing?.decision || "Watch",
    confidence: reportData.confidence?.level || "unknown",
  };
  const previous = getSearchHistory();
  const next = [nextItem]
    .concat(previous.filter((item) => item.brand.toLowerCase() !== nextItem.brand.toLowerCase()))
    .slice(0, 8);
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function getSearchHistory() {
  const owner = clerk?.user?.id || "local";
  const storageKey = `${searchHistoryStorageKey}:${owner}`;
  try {
    const history = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.warn("Could not read search history:", error);
    return [];
  }
}

function renderSearchHistory() {
  const history = getSearchHistory();
  if (history.length === 0) return "";

  return `
    <section class="history-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow section-title">Recent searches</p>
        </div>
      </div>
      <div class="history-list">
        ${history
          .map(
            (item) => `
              <button type="button" class="history-item" data-history-brand="${escapeHtml(item.brand)}">
                <span>${escapeHtml(item.brand)}</span>
                <small>${escapeHtml(item.decision)} · ${escapeHtml(item.confidence)}</small>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCategory(category, maxScore, strongestCategories, reportData) {
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
          <dd>${formatReportCurrency(category.averageSalePrice, reportData)}</dd>
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

function formatReportCurrency(value, reportData) {
  const shouldRound = reportData?.dataMode === "estimated" || reportData?.confidence?.level === "low";
  const displayValue = shouldRound ? Math.round(Number(value || 0) / 5) * 5 : Number(value || 0);
  return `${shouldRound ? "About " : ""}${formatCurrency(displayValue)}`;
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatConfidence(value) {
  if (!Number.isFinite(Number(value))) return "unknown";
  return formatPercent(Number(value));
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

function normalizeBrandFileId(brand) {
  return slugify(brand) || `brand-${Date.now()}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
