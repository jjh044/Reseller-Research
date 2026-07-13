const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const checks = [
  {
    name: "iPhone viewport uses viewport-fit=cover",
    file: "index.html",
    test: (content) => /viewport-fit=cover/.test(content),
  },
  {
    name: "standalone manifest is linked",
    file: "index.html",
    test: (content) => /rel="manifest"\s+href="\/manifest\.webmanifest"/.test(content),
  },
  {
    name: "manifest is installable standalone",
    file: "manifest.webmanifest",
    test: (content) => /"display"\s*:\s*"standalone"/.test(content) && /"orientation"\s*:\s*"portrait"/.test(content),
  },
  {
    name: "iPhone text controls stay at least 16px",
    file: "src/styles.css",
    test: (content) =>
      /input:not\(\[type="range"\]\):not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*textarea,\s*select\s*{[^}]*font-size:\s*16px;/s.test(
        content,
      ),
  },
  {
    name: "horizontal overflow is clipped",
    file: "src/styles.css",
    test: (content) => /html\s*{[^}]*overflow-x:\s*clip;/s.test(content) && /body\s*{[^}]*overflow-x:\s*clip;/s.test(content),
  },
  {
    name: "label image payloads are compressed for mobile",
    file: "src/app.js",
    test: (content) =>
      /const labelImageMaxSide = 1440;/.test(content) &&
      /const labelImageQuality = 0\.82;/.test(content) &&
      /resizeCanvasToDataUrl/.test(content),
  },
  {
    name: "API requests have mobile timeouts",
    file: "src/app.js",
    test: (content) => /const apiTimeoutMilliseconds = 45000;/.test(content) && /function fetchWithTimeout/.test(content),
  },
  {
    name: "config endpoint reports service readiness",
    file: "api/config.js",
    test: (content) => /ready:\s*services\.marketplace && services\.ai && services\.auth/.test(content) && /services,/.test(content),
  },
  {
    name: "creator partner page is routed",
    file: "vercel.json",
    test: (content) =>
      fs.existsSync(path.join(root, "partners.html")) &&
      /"source"\s*:\s*"\/partners"/.test(content) &&
      /"destination"\s*:\s*"\/partners\.html"/.test(content),
  },
];

const failures = checks.filter((check) => !check.test(read(check.file)));

if (failures.length) {
  console.error("Mobile release checks failed:");
  for (const failure of failures) console.error(`- ${failure.name}`);
  process.exit(1);
}

console.log(`Mobile release checks passed (${checks.length}).`);
