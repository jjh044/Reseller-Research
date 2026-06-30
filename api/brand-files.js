const https = require("https");
const { verifyToken } = require("@clerk/backend");

module.exports = async function handler(req, res) {
  try {
    if (!getConvexHttpUrl()) {
      res.status(501).json({ error: "Brand file Convex database is not configured" });
      return;
    }

    const clientId = await getAuthenticatedOwnerId(req);
    if (!clientId) {
      res.status(401).json({ error: "Sign in is required to use Brand files" });
      return;
    }

    if (req.method === "GET") {
      const files = await requestConvex("GET", "/brand-files", undefined, clientId);
      res.status(200).json(files);
      return;
    }

    if (req.method === "PUT") {
      const brandFile = normalizeBrandFile(req.body);
      const savedFile = await requestConvex("PUT", "/brand-files", brandFile, clientId);
      res.status(200).json(savedFile);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

async function getAuthenticatedOwnerId(req) {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("Missing CLERK_SECRET_KEY environment variable");
  }

  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return "";

  const payload = await verifyToken(match[1], {
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  return payload?.sub ? `user:${payload.sub}` : "";
}

function normalizeBrandFile(body) {
  const reportData = body?.reportData;
  const brand = String(body?.brand || reportData?.brand || "").trim();
  const id = String(body?.id || slugify(brand)).trim();

  if (!brand || !id || !reportData || typeof reportData !== "object") {
    throw new Error("Expected brand, id, and reportData");
  }

  return {
    id,
    brand,
    reportData,
  };
}

function requestConvex(method, requestPath, body, clientId) {
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
          "X-Reseller-Client-Id": clientId,
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

          resolve(parsed || []);
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

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
