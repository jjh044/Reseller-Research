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
const scannerVideo = document.querySelector("#scanner-video");
const captureCanvas = document.querySelector("#capture-canvas");
const captureButton = document.querySelector("#capture-button");
const cameraFallback = document.querySelector("#camera-fallback");
const cameraMessage = document.querySelector("#camera-message");
const captureStrip = document.querySelector("#capture-strip");
const scannerCount = document.querySelector("#scanner-count");
const brandResearchButton = document.querySelector("#brand-research-button");
const clearCapturesButton = document.querySelector("#clear-captures-button");
const labelCameraInput = document.querySelector("#label-camera-input");
const labelImageInput = document.querySelector("#label-image-input");
const labelStatus = document.querySelector("#label-status");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const brandFileCount = document.querySelector("#brand-file-count");
const brandFileEmpty = document.querySelector("#brand-file-empty");
const brandFileList = document.querySelector("#brand-file-list");
const quickDecisionCount = document.querySelector("#quick-decision-count");
const quickDecisionEmpty = document.querySelector("#quick-decision-empty");
const quickDecisionList = document.querySelector("#quick-decision-list");
const brandFileStorageKey = "reseller-brand-file-v1";
const searchHistoryStorageKey = "flipfile-search-history-v1";
const maximumResultCategories = 4;
let currentReportData = null;
let capturedLabelImages = [];
let currentBatchBrands = [];
let quickDecisionReports = [];
let quickDecisionFailures = [];
let cameraStream = null;
let cameraStartPromise = null;
let clerk = null;

const initialBrand = new URLSearchParams(window.location.search).get("brand");
if (initialBrand) {
  input.value = initialBrand;
}

await initializeAuth();
prepareScannerCamera();
renderCaptureStrip();

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

captureButton.addEventListener("click", async () => {
  if (!cameraStream || scannerVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    labelCameraInput.click();
    return;
  }

  const image = captureVideoFrame();
  addLabelCapture(image);
  pulseCaptureButton();
});

labelCameraInput.addEventListener("change", async () => {
  const file = labelCameraInput.files?.[0];
  if (file) await addLabelFiles([file]);
  labelCameraInput.value = "";
});

labelImageInput.addEventListener("change", async () => {
  await addLabelFiles(Array.from(labelImageInput.files || []));
  labelImageInput.value = "";
});

clearCapturesButton.addEventListener("click", () => {
  capturedLabelImages = [];
  renderCaptureStrip();
});

captureStrip.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-capture]");
  if (!removeButton) return;
  capturedLabelImages.splice(Number(removeButton.dataset.removeCapture), 1);
  renderCaptureStrip();
});

brandResearchButton.addEventListener("click", async () => {
  if (capturedLabelImages.length === 0) return;
  await researchCapturedLabels();
});

function prepareScannerCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraFallback("Live camera is not supported here. Take or upload a photo instead.");
    return;
  }

  cameraFallback.hidden = true;
  scannerVideo.hidden = false;
  labelStatus.textContent = "Opening camera";
  startScannerCamera();
}

async function startScannerCamera() {
  if (cameraStream) return cameraStream;
  if (cameraStartPromise) return cameraStartPromise;
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraFallback("Live camera is not supported here. Take or upload a photo instead.");
    return null;
  }

  labelStatus.textContent = "Requesting camera";

  cameraStartPromise = (async () => {
    const camera = await openPreferredCamera();
    cameraStream = camera.stream;
    scannerVideo.srcObject = cameraStream;
    await scannerVideo.play();
    cameraFallback.hidden = true;
    scannerVideo.hidden = false;
    captureButton.classList.remove("is-upload");
    captureButton.setAttribute("aria-label", "Capture label");
    labelStatus.textContent = camera.facing === "user" ? "Webcam ready" : "Ready";
    return cameraStream;
  })();

  try {
    return await cameraStartPromise;
  } catch (error) {
    console.warn("Camera unavailable:", error);
    const permissionBlocked = error.name === "NotAllowedError" || error.name === "SecurityError";
    showCameraFallback(
      permissionBlocked
        ? "Camera permission is blocked. Allow it in browser settings, or take a photo below."
        : "No live camera was found. Take or upload a photo instead.",
    );
    return null;
  } finally {
    cameraStartPromise = null;
  }
}

async function openPreferredCamera() {
  try {
    return {
      stream: await openRearCamera(),
      facing: "environment",
    };
  } catch (error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      throw error;
    }

    console.info("Outward camera unavailable; trying the user-facing webcam.");
    return {
      stream: await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      }),
      facing: "user",
    };
  }
}

async function openRearCamera() {
  const videoSize = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        ...videoSize,
        facingMode: { exact: "environment" },
      },
      audio: false,
    });
  } catch (error) {
    if (error.name !== "OverconstrainedError" && error.name !== "NotFoundError") {
      throw error;
    }
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const rearCamera = devices.find(
    (device) =>
      device.kind === "videoinput" &&
      /\b(back|rear|environment|world)\b/i.test(device.label)
  );

  if (!rearCamera) {
    throw new DOMException("No outward-facing camera found.", "NotFoundError");
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      ...videoSize,
      deviceId: { exact: rearCamera.deviceId },
    },
    audio: false,
  });
}

function showCameraFallback(message) {
  cameraFallback.hidden = false;
  cameraMessage.textContent = message;
  scannerVideo.hidden = true;
  captureButton.classList.add("is-upload");
  captureButton.setAttribute("aria-label", "Take or upload label photo");
  labelStatus.textContent = "Photo mode";
}

function captureVideoFrame() {
  const width = scannerVideo.videoWidth;
  const height = scannerVideo.videoHeight;
  captureCanvas.width = width;
  captureCanvas.height = height;
  captureCanvas.getContext("2d").drawImage(scannerVideo, 0, 0, width, height);
  return captureCanvas.toDataURL("image/jpeg", 0.9);
}

function pulseCaptureButton() {
  captureButton.classList.remove("did-capture");
  requestAnimationFrame(() => captureButton.classList.add("did-capture"));
}

async function addLabelFiles(files) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    labelStatus.textContent = "Choose label photos";
    return;
  }

  labelStatus.textContent = "Adding photos...";
  const images = await Promise.all(imageFiles.map(fileToImageDataUrl));
  images.forEach(addLabelCapture);
}

function addLabelCapture(image) {
  capturedLabelImages.push(image);
  renderCaptureStrip();
}

function renderCaptureStrip() {
  scannerCount.textContent = `${capturedLabelImages.length} ${capturedLabelImages.length === 1 ? "label" : "labels"}`;
  brandResearchButton.disabled = capturedLabelImages.length === 0;
  clearCapturesButton.disabled = capturedLabelImages.length === 0;
  labelStatus.textContent = capturedLabelImages.length === 0 ? "Ready" : "Keep scanning";

  captureStrip.innerHTML = capturedLabelImages
    .map(
      (image, index) => `
        <div class="capture-thumb">
          <img src="${image}" alt="Captured label ${index + 1}" />
          <button type="button" data-remove-capture="${index}" aria-label="Remove captured label ${index + 1}">&times;</button>
        </div>
      `,
    )
    .join("");

  captureStrip.lastElementChild?.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
}

async function researchCapturedLabels() {
  const captures = [...capturedLabelImages];
  brandResearchButton.disabled = true;
  brandResearchButton.textContent = "Reading labels...";
  labelStatus.textContent = `Reading 1 of ${captures.length}`;

  const detectedBrands = [];
  const identificationErrors = [];
  for (const [index, image] of captures.entries()) {
    labelStatus.textContent = `Reading ${index + 1} of ${captures.length}`;
    try {
      const detected = await identifyClothingLabel(image);
      const existingBrand = detectedBrands.find((item) => item.brand.toLowerCase() === detected.brand.toLowerCase());
      if (existingBrand) {
        existingBrand.uploadedTagImages = [...(existingBrand.uploadedTagImages || []), image].slice(0, 3);
      } else {
        detectedBrands.push({
          ...detected,
          uploadedTagImages: [image],
        });
      }
    } catch (error) {
      console.warn(`Could not identify capture ${index + 1}:`, error);
      identificationErrors.push(error.message);
    }
  }

  if (detectedBrands.length === 0) {
    brandResearchButton.disabled = false;
    brandResearchButton.textContent = "Brand research";
    const configurationError = identificationErrors.find((message) =>
      /api key|server error|network|fetch/i.test(message)
    );
    labelStatus.textContent =
      configurationError || "No readable brand found. Try another angle with the label in view.";
    return;
  }

  currentBatchBrands = detectedBrands;
  labelStatus.textContent = `Researching ${detectedBrands.length} ${detectedBrands.length === 1 ? "brand" : "brands"}`;
  brandResearchButton.textContent = "Building decisions...";
  renderQuickDecisionLoading(detectedBrands);
  activateTab("quick-decision");

  const reportResults = await Promise.allSettled(
    detectedBrands.map((item) => buildReportData(item.brand, { uploadedTagImages: item.uploadedTagImages || [] })),
  );
  quickDecisionReports = reportResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  quickDecisionFailures = reportResults
    .map((result, index) => ({ result, brand: detectedBrands[index].brand }))
    .filter(({ result }) => result.status === "rejected")
    .map(({ result, brand }) => ({
      brand,
      message: result.reason?.message || "No verified category data was found.",
    }));

  if (quickDecisionReports.length === 0) {
    renderQuickDecision();
    labelStatus.textContent = "No verified categories found";
    brandResearchButton.textContent = "Brand research";
    brandResearchButton.disabled = false;
    return;
  }

  quickDecisionReports.forEach(saveSearchHistory);
  currentReportData = quickDecisionReports[0];
  input.value = currentReportData.brand;
  renderReport(currentReportData);
  renderBatchBrands(detectedBrands);
  setLoading(false);
  renderQuickDecision();
  activateTab("quick-decision");
  labelStatus.textContent = `${quickDecisionReports.length} ${quickDecisionReports.length === 1 ? "brand" : "brands"} ready`;
  brandResearchButton.textContent = "Brand research";
  brandResearchButton.disabled = false;
}

function renderQuickDecisionLoading(detectedBrands) {
  quickDecisionEmpty.hidden = true;
  quickDecisionCount.textContent = `${detectedBrands.length} ${detectedBrands.length === 1 ? "brand" : "brands"}`;
  quickDecisionList.innerHTML = detectedBrands
    .map(
      (item) => `
        <section class="quick-brand-section is-loading">
          <header class="quick-brand-header">
            <div>
              <p class="eyebrow">Reading categories</p>
              <h3>${escapeHtml(item.brand)}</h3>
            </div>
          </header>
          <div class="quick-category-loading">Loading category performance...</div>
        </section>
      `,
    )
    .join("");
}

function renderQuickDecision() {
  const totalBrands = quickDecisionReports.length + quickDecisionFailures.length;
  quickDecisionEmpty.hidden = totalBrands > 0;
  quickDecisionCount.textContent = `${totalBrands} ${totalBrands === 1 ? "brand" : "brands"}`;
  const reportSections = quickDecisionReports
    .map((reportData) => {
      const maxScore = Math.max(
        ...reportData.categories.map(categoryOpportunityScore),
      );
      const strongestCategories = reportData.aiInsights?.strongestCategories || [];

      return `
        <section class="quick-brand-section">
          <header class="quick-brand-header">
            <div>
              <p class="eyebrow">Category performance</p>
              <h3>${escapeHtml(reportData.brand)}</h3>
            </div>
            <div class="quick-brand-actions">
              <button type="button" data-reseller-report="${escapeHtml(reportData.brand)}">
                Reseller report
              </button>
            </div>
          </header>
          <div class="category-grid quick-category-grid">
            ${[...reportData.categories]
              .sort((a, b) => b.averageSalePrice - a.averageSalePrice)
              .map((category) => renderCategory(category, maxScore, strongestCategories, reportData))
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");
  const failureSections = quickDecisionFailures
    .map(
      (failure) => `
        <section class="quick-brand-section">
          <header class="quick-brand-header">
            <div>
              <p class="eyebrow">No verified categories</p>
              <h3>${escapeHtml(failure.brand)}</h3>
            </div>
          </header>
          <p class="quick-brand-message">${escapeHtml(failure.message)}</p>
        </section>
      `,
    )
    .join("");
  quickDecisionList.innerHTML = reportSections + failureSections;
}

quickDecisionList.addEventListener("click", (event) => {
  const reportButton = event.target.closest("[data-reseller-report]");
  if (!reportButton) return;

  const selectedReport = quickDecisionReports.find(
    (item) => item.brand.toLowerCase() === reportButton.dataset.resellerReport.toLowerCase(),
  );
  if (!selectedReport) return;

  currentReportData = selectedReport;
  input.value = selectedReport.brand;
  renderReport(selectedReport);
  renderBatchBrands(currentBatchBrands);
  setLoading(false);
  activateTab("results");
});

function renderBatchBrands(detectedBrands) {
  report.querySelector(".batch-brands")?.remove();
  const batch = document.createElement("section");
  batch.className = "batch-brands";
  batch.innerHTML = `
    <div>
      <p class="eyebrow">Scanned batch</p>
      <h3>${detectedBrands.length} ${detectedBrands.length === 1 ? "brand" : "brands"} detected</h3>
    </div>
    <div class="batch-brand-list">
      ${detectedBrands
        .map(
          (item) => `
            <button
              type="button"
              data-batch-brand="${escapeHtml(item.brand)}"
              class="${item.brand.toLowerCase() === input.value.toLowerCase() ? "is-active" : ""}"
            >
              ${escapeHtml(item.brand)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
  report.prepend(batch);
}

async function generateReportForBrand(brand) {
  setLoading(true);
  let loadError = null;
  try {
    currentReportData = await buildReportData(brand);
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

async function buildReportData(brand, options = {}) {
  const marketplaceData = await fetchEbayAverageSellingPrice(brand, options);
  const aiInsights = await generateAiInsights(marketplaceData);
  const uploadedTagImages = sanitizeUploadedTagImages(options.uploadedTagImages);
  return {
    ...marketplaceData,
    ...(uploadedTagImages.length ? { uploadedTagImages } : {}),
    aiInsights,
    sourcing: buildSourcingGuidance(marketplaceData, aiInsights),
  };
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

  if (actionButton.dataset.brandFileAction === "refresh") {
    await refreshBrandFileReport(brandFile, actionButton);
    return;
  }

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
  const batchButton = event.target.closest("[data-batch-brand]");
  if (batchButton) {
    input.value = batchButton.dataset.batchBrand;
    await generateReportForBrand(batchButton.dataset.batchBrand);
    renderBatchBrands(currentBatchBrands);
    return;
  }

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
      enableLocalOnlyMode();
      return;
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

function enableLocalOnlyMode() {
  clerk = null;
  authShell.hidden = true;
  appShell.hidden = false;
  authActions.hidden = true;
  authStatus.textContent = "";
  authMount.innerHTML = "";
  accountEmail.textContent = "Local mode";
  userButtonMount.innerHTML = "";
  pdfStatus.textContent = "Brand files are saved locally on this device.";
  renderBrandFile();
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

  if (tabName === "home" && !cameraStream) {
    startScannerCamera();
  }
}

async function saveBrandFile(reportData, options = {}) {
  const id = normalizeBrandFileId(reportData.brand);
  const savedFile = {
    id,
    brand: reportData.brand,
    savedAt: options.savedAt || new Date().toISOString(),
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
      (savedFile) => {
        const reportData = reviveReportData(savedFile.reportData);
        const refreshedAt = reportData.generatedAt || new Date(savedFile.savedAt || Date.now());
        return `
        <article class="brand-file-item">
          <div class="brand-file-main">
            <div class="brand-file-title-row">
              <h3>${escapeHtml(savedFile.brand)}</h3>
              <button type="button" class="secondary-button brand-file-refresh-button" data-brand-file-action="refresh" data-brand-file-id="${escapeHtml(savedFile.id)}">
                Refresh
              </button>
            </div>
            <p>Saved ${formatDate(new Date(savedFile.savedAt || Date.now()))}</p>
          </div>
          <div class="brand-file-actions">
            <div class="brand-file-report-action">
              <button type="button" data-brand-file-action="open" data-brand-file-id="${escapeHtml(savedFile.id)}">
                Reseller report
              </button>
              <p class="brand-file-refresh-date">Last refreshed ${formatDate(refreshedAt)}</p>
            </div>
            <button type="button" class="secondary-button" data-brand-file-action="print" data-brand-file-id="${escapeHtml(savedFile.id)}">
              Download PDF
            </button>
          </div>
        </article>
      `;
      },
    )
    .join("");
}

async function refreshBrandFileReport(brandFile, actionButton) {
  const originalText = actionButton.textContent;
  actionButton.disabled = true;
  actionButton.textContent = "Refreshing...";
  pdfStatus.textContent = `Refreshing ${brandFile.brand} research...`;

  try {
    currentReportData = await buildReportData(brandFile.brand, {
      forceRefresh: true,
      uploadedTagImages: brandFile.reportData?.uploadedTagImages || [],
    });
    await saveBrandFile(currentReportData, { savedAt: brandFile.savedAt });
    saveSearchHistory(currentReportData);
    renderReport(currentReportData);
    await renderBrandFile();
    activateTab("results");
    pdfStatus.textContent = `${currentReportData.brand} was refreshed with the latest available data.`;
  } catch (error) {
    console.error(error);
    pdfStatus.textContent = error.message;
  } finally {
    actionButton.disabled = false;
    actionButton.textContent = originalText;
  }
}

function serializeReportData(reportData) {
  return {
    ...reportData,
    generatedAt: reportData.generatedAt instanceof Date ? reportData.generatedAt.toISOString() : reportData.generatedAt,
  };
}

function reviveReportData(reportData) {
  const revived = normalizeReportCategories({
    ...reportData,
    generatedAt: new Date(reportData.generatedAt),
  });
  if (!revived.sourcing && Array.isArray(revived.categories)) {
    revived.sourcing = buildSourcingGuidance(revived, revived.aiInsights || {});
  }
  return revived;
}

async function fetchEbayAverageSellingPrice(brand, options = {}) {
  if (window.location.protocol !== "file:") {
    try {
      const searchParams = new URLSearchParams({ brand });
      if (options.forceRefresh) searchParams.set("refresh", "1");
      const response = await fetch(`/api/ebay-average-selling-price?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Could not load live eBay data."));
      }

      const data = await response.json();
      return normalizeReportCategories({
        ...data,
        generatedAt: new Date(data.generatedAt),
      });
    } catch (error) {
      console.error("Live marketplace data unavailable:", error);
      throw error;
    }
  }

  throw new Error("Live marketplace data requires the app server.");
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
  const maxSide = 2048;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.9);
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
      console.warn("Falling back to a local summary of live marketplace data:", error);
    }
  }

  return generateMockAiInsights(marketplaceData);
}

async function getApiErrorMessage(response, fallbackMessage) {
  if (response.status === 429) {
    return "The live eBay sold-comps provider is rate limiting requests right now. Wait a minute and try again; cached reports will still load when available.";
  }

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
      score: categoryOpportunityScore(category),
    }))
    .sort((a, b) => b.score - a.score);

  const strongest = scoredCategories.slice(0, 2);
  const mostProven = [...marketplaceData.categories].sort((a, b) => b.soldListings - a.soldListings)[0];
  const premium = [...marketplaceData.categories].sort((a, b) => b.averageSalePrice - a.averageSalePrice)[0];
  const strongestNames = strongest.map((category) => category.name).join(strongest.length > 1 ? " and " : "");

  return {
    headline: `${marketplaceData.brand} looks strongest in ${strongestNames}.`,
    recommendation: `Prioritize ${strongest[0].name.toLowerCase()} when buy cost leaves room for a 3x-4x multiple. ${mostProven.name} has the deepest sold-comp sample, while ${premium.name} creates the highest average gross sale opportunity.`,
    strongestCategories: strongest,
  };
}

function renderReport(data) {
  const { totalSold, blendedAsp } = summarizeReportData(data);
  const maxScore = Math.max(...data.categories.map(categoryOpportunityScore));
  const categoriesByAsp = [...data.categories].sort((a, b) => b.averageSalePrice - a.averageSalePrice);
  const isEstimated = data.dataMode === "estimated";
  const brandLogoUrl = getBrandLogoUrl(data.brand);
  const boloRows = data.categories
    .map((category) => ({
      category,
      item: [...category.topItems]
        .sort((a, b) => Number(b.salePrice || 0) - Number(a.salePrice || 0))
        .find((item) => getBoloImageUrl(item.imageUrl)),
    }))
    .filter(({ item }) => item)
    .sort((a, b) => b.item.salePrice - a.item.salePrice);

  report.innerHTML = `
    <header class="report-header">
      <div>
        <p class="eyebrow">${data.source}</p>
        <div class="report-brand-title">
          ${
            brandLogoUrl
              ? `<span class="report-brand-logo" aria-hidden="true">
                  <img data-brand-logo data-brand-logo-src="${escapeHtml(brandLogoUrl)}" alt="" loading="lazy" decoding="async">
                </span>`
              : ""
          }
          <h2>${escapeHtml(data.brand)}</h2>
        </div>
        <p class="timestamp">Generated ${formatDate(data.generatedAt)}</p>
      </div>
      <div class="grade">
        <span>${getGrade(blendedAsp, totalSold)}</span>
        Resale grade
      </div>
    </header>

    <section class="kpi-grid" aria-label="Brand summary metrics">
      ${renderKpi("Blended ASP", formatReportCurrency(blendedAsp, data), "Average sold price across tracked clothing categories")}
      ${renderKpi("Verified categories", data.categories.length.toLocaleString(), "Categories supported by multiple matching sold listings")}
      ${renderKpi("Sold comps", totalSold.toLocaleString(), "Completed listings in the analysis window")}
      ${renderKpi("Lookback", `${Number(data.lookbackDays || 90)} days`, "Completed-sale window used for this report")}
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

    ${
      boloRows.length
        ? `<section class="top-items-section">
            <div class="section-heading">
              <div>
                <p class="eyebrow bolo-heading">BOLO'S</p>
                <p>${
                  isEstimated
                    ? "Estimated examples shown while live sold-listing screenshots are temporarily unavailable."
                    : "Real sold-listing snapshots with the sold price shown up front."
                }</p>
              </div>
            </div>
            <div class="bolo-grid">
              ${boloRows.map(({ category, item }) => renderBoloCard(category, item)).join("")}
            </div>
          </section>`
        : ""
    }

    ${renderSearchHistory()}
    ${renderTagReferences(data)}
  `;

  hydrateTagReferenceImages(report);
  hydrateBrandLogo(report);
}

function summarizeReportData(data) {
  const totalSold = data.categories.reduce((sum, category) => sum + category.soldListings, 0);
  const blendedAsp = Math.round(
    data.categories.reduce(
      (sum, category) => sum + category.averageSalePrice * category.soldListings,
      0,
    ) / Math.max(1, totalSold),
  );

  return {
    totalSold,
    blendedAsp,
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
  const { blendedAsp, totalSold } = summarizeReportData(marketplaceData);
  const shippingBuffer = 8;
  const targetMargin = marketplaceData.confidence?.level === "low" ? 0.34 : 0.42;
  const maxBuyPrice = calculateMaxBuyPrice(blendedAsp, targetMargin);
  const lowProfit = Math.max(0, Math.round(blendedAsp * 0.72 - maxBuyPrice - shippingBuffer));
  const highProfit = Math.max(lowProfit + 4, Math.round(blendedAsp * 0.86 - maxBuyPrice - shippingBuffer));
  const decision =
    marketplaceData.confidence?.level === "low"
      ? "Watch"
      : blendedAsp >= 55 && totalSold >= 10
        ? "Buy"
        : blendedAsp >= 30 && totalSold >= 4
          ? "Selective buy"
          : "Pass";
  const strongest = [...marketplaceData.categories].sort(
    (a, b) => categoryOpportunityScore(b) - categoryOpportunityScore(a),
  )[0];

  return {
    decision,
    decisionReason:
      decision === "Buy"
        ? `${strongest.name} has the strongest price and sold-comp depth.`
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

function calculateMaxBuyPrice(averageSalePrice, targetMargin = 0.42) {
  const feeRate = 0.15;
  const shippingBuffer = 8;
  const expectedNet = Math.max(0, Number(averageSalePrice || 0) * (1 - feeRate) - shippingBuffer);
  return Math.max(3, Math.floor(expectedNet * targetMargin));
}

function getAvoidNotes(marketplaceData) {
  const lowCategories = marketplaceData.categories
    .filter((category) => category.soldListings < 3 || category.averageSalePrice < 30)
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
  const score = categoryOpportunityScore(category);
  const strength = Math.round((score / maxScore) * 100);
  const isStrong = strongestCategories.some((strongCategory) => strongCategory.name === category.name);
  const targetMargin = reportData?.confidence?.level === "low" ? 0.34 : 0.42;
  const categoryMaxBuy = calculateMaxBuyPrice(category.averageSalePrice, targetMargin);

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
          <dt>Sold comps</dt>
          <dd>${Number(category.soldListings || 0).toLocaleString()}</dd>
        </div>
      </dl>
      <div class="category-max-buy">
        <span>Category max buy</span>
        <strong>${formatCurrency(categoryMaxBuy)}</strong>
      </div>
      <div class="meter" aria-label="${category.name} opportunity score ${strength}%">
        <span style="width: ${strength}%"></span>
      </div>
    </article>
  `;
}

function renderBoloCard(category, item) {
  const imageUrl = getBoloImageUrl(item.imageUrl);
  const listingUrl = safeExternalUrl(item.listingUrl);
  const card = `
    <article class="bolo-card">
      <div class="bolo-image-wrap">
        ${
          imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)} sold listing" loading="lazy" />`
            : `<div class="listing-image-missing">Listing image unavailable</div>`
        }
        <strong class="sold-price">Sold for ${formatCurrency(item.salePrice)}</strong>
      </div>
      <div class="bolo-copy">
        <span>${escapeHtml(category.name)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.soldDate || "Recent sale")}</p>
      </div>
    </article>
  `;

  return listingUrl
    ? `<a class="bolo-listing-link" href="${escapeHtml(listingUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View sold eBay listing for ${escapeHtml(item.title)}">${card}</a>`
    : card;
}

function renderTagReferences(data) {
  const references = getReportTagReferences(data);
  if (references.length === 0) return "";

  return `
    <section class="tag-reference-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow section-title">Tags</p>
          <h2>Labels to look for</h2>
          <p>Visual tag references sourced separately from web results. Compare the full tag, stitching, and typography before sourcing.</p>
        </div>
      </div>
      <div class="tag-reference-grid">
        ${references
          .map((item, index) => {
            const listingUrl = safeExternalUrl(item.listingUrl);
            const imageUrl = getTagReferenceImageUrl(item.imageUrl, listingUrl);
            const content = `
              <article class="tag-reference-card">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(data.brand)} clothing tag reference ${index + 1}" loading="lazy" />
                <div class="tag-image-fallback" aria-hidden="true">Tag image unavailable. Open the source reference.</div>
                <p>${escapeHtml(item.title || "Tag label source")}</p>
              </article>
            `;
            return listingUrl
              ? `<a href="${escapeHtml(listingUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View tag reference listing ${index + 1}">${content}</a>`
              : content;
          })
          .join("")}
      </div>
    </section>
  `;
}

function getReportTagReferences(data) {
  const uploadedReferences = sanitizeUploadedTagImages(data.uploadedTagImages).map((imageUrl, index) => ({
    title: index === 0 ? "Uploaded label photo" : `Uploaded label photo ${index + 1}`,
    imageUrl,
    listingUrl: "",
  }));
  const webReferences = Array.isArray(data.tagReferences)
    ? data.tagReferences.filter((item) => isLikelyTagReference(item, data.brand))
    : [];

  return [...uploadedReferences, ...webReferences].slice(0, 3);
}

function sanitizeUploadedTagImages(images) {
  return (Array.isArray(images) ? images : [])
    .filter((image) => /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(String(image || "")))
    .slice(0, 3);
}

function safeExternalUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url : "";
}

function getBoloImageUrl(value) {
  const url = safeExternalUrl(value);
  if (!url) return "";
  return url.replace(/\/s-l\d+\.(jpg|jpeg|png|webp)([?#].*)?$/i, "/s-l500.$1$2");
}

function getBrandLogoUrl(brand) {
  const slug = String(brand || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "");

  if (slug.length < 2) return "";

  const domainAliases = {
    abercrombieandfitch: "abercrombie.com",
    arcteryx: "arcteryx.com",
    bananarepublic: "bananarepublic.gap.com",
    brooksbrothers: "brooksbrothers.com",
    carhartt: "carhartt.com",
    eileenfisher: "eileenfisher.com",
    freepeople: "freepeople.com",
    jcrew: "jcrew.com",
    levis: "levi.com",
    lululemon: "lululemon.com",
    madewell: "madewell.com",
    patagonia: "patagonia.com",
    ralphlauren: "ralphlauren.com",
    thenorthface: "thenorthface.com",
    tommyhilfiger: "tommy.com",
    urbanoutfitters: "urbanoutfitters.com",
    victoriassecret: "victoriassecret.com",
  };
  const domain = domainAliases[slug] || `${slug}.com`;
  return `https://logo.clearbit.com/${domain}`;
}

function hydrateBrandLogo(scope) {
  scope.querySelectorAll("[data-brand-logo]").forEach((image) => {
    const logoShell = image.closest(".report-brand-logo");
    const src = image.dataset.brandLogoSrc;
    if (!src) {
      logoShell?.remove();
      return;
    }

    image.addEventListener(
      "error",
      () => {
        logoShell?.remove();
      },
      { once: true },
    );
    image.src = src;
  });
}

function getTagReferenceImageUrl(value, sourceUrl = "") {
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(String(value || ""))) return value;
  const url = safeExternalUrl(value);
  if (!url) return "";
  const source = safeExternalUrl(sourceUrl);
  return `/api/tag-image?url=${encodeURIComponent(url)}${source ? `&source=${encodeURIComponent(source)}` : ""}`;
}

function isLikelyTagReference(item, brand = "") {
  const imageUrl = item?.imageUrl || "";
  if (!isLikelyDisplayImageUrl(imageUrl)) return false;

  const text = `${item.title || ""} ${item.listingUrl || ""} ${imageUrl || ""} ${brand || ""}`.toLowerCase();
  const evidenceText = text.replace(/\b(?:brand\s*tag\s*reference|tag\s*reference|reference)\b/g, "");
  const hasTagLanguage = /\b(?:tag|tags|label|labels|neck\s*tag|care\s*tag|brand\s*tag|size\s*tag|wash\s*tag)\b/i.test(evidenceText);
  const hasNonTagLanguage =
    /\b(?:worn|wearing|outfit|lookbook|model|runway|fit\s*pic|street\s*style|try\s*on|haul|ootd|dress|jacket|shirt|jeans|pants|sweater|hoodie|coat|skirt|blouse|shorts|listing|sold)\b/i.test(evidenceText) &&
    !/\b(?:tag|label)\b/i.test(evidenceText);

  return hasTagLanguage && !hasNonTagLanguage;
}

function isLikelyDisplayImageUrl(value) {
  const url = safeExternalUrl(value);
  if (!url) return false;
  if (/\.(?:svg|gif|avif|heic|ico)(?:[?#].*)?$/i.test(url)) return false;
  if (/\b(?:avatar|profile|sprite|logo|icon|placeholder|blank|transparent|tracking|pixel)\b/i.test(url)) return false;
  return (
    /\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(url) ||
    /\b(?:image|images|img|photo|photos|media|cdn|i\.ebayimg|pinimg|etsystatic|cloudfront)\b/i.test(url)
  );
}

function handleTagReferenceImage(imageElement, forceInvalid = false) {
  const card = imageElement.closest(".tag-reference-card");
  if (!card) return;

  const invalidImage =
    forceInvalid || imageElement.naturalWidth < 80 || imageElement.naturalHeight < 80;
  card.classList.toggle("is-invalid-image", invalidImage);
}

function hydrateTagReferenceImages(container) {
  const images = container.querySelectorAll(".tag-reference-card img");
  images.forEach((imageElement) => {
    imageElement.addEventListener("load", () => handleTagReferenceImage(imageElement));
    imageElement.addEventListener("error", () => handleTagReferenceImage(imageElement, true));
    if (imageElement.complete) {
      handleTagReferenceImage(imageElement, imageElement.naturalWidth === 0);
    }
  });
}

function getGrade(asp, soldComps) {
  if (asp >= 60 && soldComps >= 10) return "A";
  if (asp >= 40 && soldComps >= 6) return "B";
  return "C";
}

function categoryOpportunityScore(category) {
  return Number(category.averageSalePrice || 0) * Math.log2(Number(category.soldListings || 0) + 1);
}

function normalizeReportCategories(reportData) {
  if (!reportData || !Array.isArray(reportData.categories)) return reportData;
  const categories = selectTopResultCategories(reportData.categories);
  const sampleSize = categories.reduce((sum, category) => sum + Number(category.soldListings || 0), 0);

  return {
    ...reportData,
    categories,
    sampleSize,
    confidence: reportData.confidence
      ? {
          ...reportData.confidence,
          sampleSize,
        }
      : reportData.confidence,
  };
}

function selectTopResultCategories(categories) {
  return [...categories]
    .sort((a, b) => {
      const scoreDifference = categoryOpportunityScore(b) - categoryOpportunityScore(a);
      if (scoreDifference !== 0) return scoreDifference;
      const aspDifference = Number(b.averageSalePrice || 0) - Number(a.averageSalePrice || 0);
      if (aspDifference !== 0) return aspDifference;
      return Number(b.soldListings || 0) - Number(a.soldListings || 0);
    })
    .slice(0, maximumResultCategories);
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
  return formatCurrency(displayValue);
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
