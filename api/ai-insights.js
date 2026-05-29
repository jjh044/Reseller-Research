const https = require("https");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
      return;
    }

    const marketplaceData = req.body;
    if (!marketplaceData || !Array.isArray(marketplaceData.categories)) {
      res.status(400).json({ error: "Expected marketplace data with categories[]" });
      return;
    }

    const aiInsights = await generateOpenAiInsights(marketplaceData);
    res.status(200).json(normalizeAiInsights(aiInsights, marketplaceData.categories));
  } catch (error) {
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

function generateOpenAiInsights(marketplaceData) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string" },
      recommendation: { type: "string" },
      strongestCategoryNames: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "string" },
      },
    },
    required: ["headline", "recommendation", "strongestCategoryNames"],
  };

  return postJson(
    "api.openai.com",
    "/v1/responses",
    {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "You are a practical clothing resale analyst. Use only the supplied eBay marketplace data. Keep advice concise, specific, and useful for sourcing decisions.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "Create a reseller intelligence readout. Choose the two strongest categories from the supplied category names only. Mention ASP, velocity, and BOLO logic where relevant.",
            marketplaceData,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "reseller_ai_insights",
          strict: true,
          schema,
        },
      },
      max_output_tokens: 450,
    },
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
  ).then((response) => JSON.parse(extractResponseText(response)));
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

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed.error?.message || `Request failed with ${response.statusCode}`));
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

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  const message = response.output?.find((item) => item.type === "message");
  const textContent = message?.content?.find((item) => item.type === "output_text");
  if (textContent?.text) return textContent.text;

  throw new Error("OpenAI response did not include output text");
}

function normalizeAiInsights(aiInsights, availableCategories) {
  const selectedNames = new Set(
    aiInsights.strongestCategoryNames.map((name) => String(name).trim().toLowerCase()),
  );
  const strongestCategories = availableCategories.filter((category) =>
    selectedNames.has(String(category.name).trim().toLowerCase()),
  );

  return {
    headline: aiInsights.headline,
    recommendation: aiInsights.recommendation,
    strongestCategories: strongestCategories.length > 0 ? strongestCategories : availableCategories.slice(0, 2),
  };
}
