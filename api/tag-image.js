module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const imageUrl = String(req.query?.url || "").trim();
  const validationError = getProxyImageUrlError(imageUrl);

  if (validationError) {
    res.status(400).send(validationError);
    return;
  }

  try {
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ResellerResearchAI/1.0; +https://reseller-research.vercel.app)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!imageResponse.ok) {
      res.status(imageResponse.status).send("Image unavailable");
      return;
    }

    const contentType = String(imageResponse.headers.get("content-type") || "image/jpeg").toLowerCase();
    if (!contentType.startsWith("image/")) {
      res.status(415).send("URL did not return an image");
      return;
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(imageBuffer);
  } catch (error) {
    res.status(502).send("Could not load tag image");
  }
};

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
