const https = require("https");

const tableName = "brand_files";

module.exports = async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      res.status(501).json({ error: "Brand file database is not configured" });
      return;
    }

    const clientId = getClientId(req);
    if (!clientId) {
      res.status(400).json({ error: "Missing brand file client id" });
      return;
    }

    if (req.method === "GET") {
      const rows = await requestSupabase(
        "GET",
        `/${tableName}?client_id=eq.${encodeURIComponent(clientId)}&select=brand_id,brand,saved_at,report_data&order=brand.asc`,
      );
      res.status(200).json(rows.map(mapBrandFileRow));
      return;
    }

    if (req.method === "PUT") {
      const brandFile = normalizeBrandFile(req.body, clientId);
      const rows = await requestSupabase(
        "POST",
        `/${tableName}?on_conflict=client_id,brand_id`,
        [brandFile],
        {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
      );
      res.status(200).json(mapBrandFileRow(rows[0]));
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

function getClientId(req) {
  return String(req.headers["x-reseller-client-id"] || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function normalizeBrandFile(body, clientId) {
  const reportData = body?.reportData;
  const brand = String(body?.brand || reportData?.brand || "").trim();
  const brandId = String(body?.id || slugify(brand)).trim();

  if (!brand || !brandId || !reportData || typeof reportData !== "object") {
    throw new Error("Expected brand, id, and reportData");
  }

  return {
    client_id: clientId,
    brand_id: brandId,
    brand,
    saved_at: new Date().toISOString(),
    report_data: reportData,
  };
}

function mapBrandFileRow(row) {
  return {
    id: row.brand_id,
    brand: row.brand,
    savedAt: row.saved_at,
    reportData: row.report_data,
  };
}

function requestSupabase(method, requestPath, body, headers = {}) {
  const supabaseUrl = new URL(process.env.SUPABASE_URL);
  const requestBody = body === undefined ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method,
        hostname: supabaseUrl.hostname,
        path: `/rest/v1${requestPath}`,
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          ...(requestBody ? { "Content-Length": Buffer.byteLength(requestBody) } : {}),
          ...headers,
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
              reject(new Error(`Invalid database JSON response: ${rawBody.slice(0, 160)}`));
              return;
            }
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed?.message || parsed?.error || `Database request failed with ${response.statusCode}`));
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

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
