module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const imageUrl = String(req.query?.url || "").trim();
  const sourceUrl = String(req.query?.source || "").trim();
  const validationError = getProxyImageUrlError(imageUrl);

  if (validationError) {
    res.status(400).send(validationError);
    return;
  }

  try {
    const image = await resolveTagImage(imageUrl, sourceUrl);

    if (!image) {
      res.status(502).send("Could not load tag image");
      return;
    }

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(image.buffer);
  } catch (error) {
    res.status(502).send("Could not load tag image");
  }
};

async function resolveTagImage(imageUrl, sourceUrl) {
  const directImage = await fetchRemoteImage(imageUrl);
  if (directImage) return directImage;

  const sourceCandidates = [sourceUrl, imageUrl].filter((url, index, list) => {
    return !getOptionalProxyImageUrlError(url) && list.indexOf(url) === index;
  });

  for (const pageUrl of sourceCandidates) {
    const html = await fetchRemoteHtml(pageUrl);
    if (!html) continue;

    const imageCandidates = extractImageCandidates(html, pageUrl);
    for (const candidate of imageCandidates) {
      const image = await fetchRemoteImage(candidate);
      if (image) return image;
    }
  }

  return null;
}

async function fetchRemoteImage(url) {
  if (getProxyImageUrlError(url)) return null;
  if (isBlockedImageCandidateText(url)) return null;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ResellerResearchAI/1.0; +https://reseller-research.vercel.app)",
        Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    if (contentType === "image/svg+xml" || contentType === "image/gif") return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 500) return null;

    return { buffer, contentType: contentType || "image/jpeg" };
  } catch {
    return null;
  }
}

async function fetchRemoteHtml(url) {
  if (getProxyImageUrlError(url)) return "";

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ResellerResearchAI/1.0; +https://reseller-research.vercel.app)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return "";
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return "";
    }

    return (await response.text()).slice(0, 350000);
  } catch {
    return "";
  }
}

function extractImageCandidates(html, pageUrl) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (value) => {
    const resolved = resolveCandidateUrl(value, pageUrl);
    if (!resolved || seen.has(resolved) || getProxyImageUrlError(resolved)) return;
    seen.add(resolved);
    candidates.push(resolved);
  };

  const metaPattern =
    /<meta\b[^>]*(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["'][^>]*content=["']([^"']+)["'][^>]*>|<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["'][^>]*>/gi;
  let match;
  while ((match = metaPattern.exec(html))) addCandidate(decodeHtml(match[1] || match[2] || ""));

  const linkPattern = /<link\b[^>]*rel=["'][^"']*(?:image_src|preload)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((match = linkPattern.exec(html))) addCandidate(decodeHtml(match[1] || ""));

  const imgPattern = /<img\b[^>]*(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi;
  while ((match = imgPattern.exec(html)) && candidates.length < 12) {
    const tag = match[0];
    const candidate = decodeHtml(match[1] || "");
    const text = `${candidate} ${tag}`;
    if (isLikelyTagCandidateText(text)) {
      addCandidate(candidate);
    }
  }

  return candidates.slice(0, 8);
}

function isLikelyTagCandidateText(value) {
  const text = String(value || "").toLowerCase();
  if (isBlockedImageCandidateText(text)) return false;
  return (
    /\b(?:tag|tags|label|labels)\b/i.test(text) &&
    /\b(?:close\s*up|closeup|neck|care|brand|size|wash|waist|inside|interior|sewn|embroidered|vintage)\b/i.test(text)
  );
}

function isBlockedImageCandidateText(value) {
  const text = String(value || "").toLowerCase();
  if (/\b(?:placeholder|blank|transparent|pixel|sprite|avatar|profile|logo|icon|with\s+tags?|nwt|new\s+with\s+tags?)\b/i.test(text)) {
    return true;
  }

  const hasCloseTagEvidence =
    /\b(?:tag|tags|label|labels)\b/i.test(text) &&
    /\b(?:close\s*up|closeup|neck|care|brand|size|wash|waist|inside|interior|sewn|embroidered|vintage)\b/i.test(text);
  return (
    !hasCloseTagEvidence &&
    /\b(?:worn|wearing|outfit|lookbook|model|runway|try\s*on|haul|ootd|dress|jacket|shirt|jeans|pants|sweater|hoodie|coat|skirt|blouse|shorts|listing|sold|product)\b/i.test(text)
  );
}

function resolveCandidateUrl(value, pageUrl) {
  const cleaned = String(value || "").trim();
  if (!cleaned || cleaned.startsWith("data:")) return "";

  try {
    return new URL(cleaned, pageUrl).toString();
  } catch {
    return "";
  }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getOptionalProxyImageUrlError(value) {
  return value ? getProxyImageUrlError(value) : "Missing image URL";
}

function getProxyImageUrlError(value) {
  if (!value || value.length > 2000) return "Missing image URL";

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "Invalid image URL";
  }

  if (parsed.protocol !== "https:") return "Only HTTPS image URLs are supported";
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  ) {
    return "Local image URLs are not supported";
  }

  return "";
}
