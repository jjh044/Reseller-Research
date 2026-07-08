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

    const image = String(req.body?.image || "");
    if (!isSupportedImageDataUrl(image)) {
      res.status(400).json({ error: "Expected image as a JPEG, PNG, or WebP data URL" });
      return;
    }

    const labelResult = await identifyLabelBrand(image);
    const normalized = normalizeLabelResult(labelResult);

    if (!normalized.brand || normalized.confidence < 0.2) {
      res.status(422).json({
        error: "Could not confidently identify a brand label",
        message: "No readable brand name was found. Try another angle with the label in view.",
        ...normalized,
      });
      return;
    }

    res.status(200).json(normalized);
  } catch (error) {
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

function identifyLabelBrand(imageDataUrl) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      brand: { type: "string" },
      labelText: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      possibleBrands: {
        type: "array",
        maxItems: 5,
        items: { type: "string" },
      },
    },
    required: ["brand", "labelText", "confidence", "possibleBrands"],
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
            "You identify clothing brands from fast, imperfect reseller photos. Inspect the entire image, including edges and corners. Mentally rotate angled or sideways text and account for perspective, wrinkles, shadows, glare, blur, partial cropping, and labels that are small or off-center. Use visible words, logos, monograms, distinctive typography, and tag design together. Return the most likely brand when there is useful evidence; use an empty brand only when no brand evidence is readable.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Find the clothing brand anywhere in this uncropped field photo. The label may be angled, folded, partly cut off, or away from the center. Identify the most likely brand for resale research. Do not mistake size, RN numbers, fabric content, care instructions, or country of origin for the brand, but use them as supporting clues when helpful.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "clothing_label_identification",
          strict: true,
          schema,
        },
      },
      max_output_tokens: 300,
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

function normalizeLabelResult(labelResult) {
  const brand = String(labelResult.brand || "").trim();
  const labelText = String(labelResult.labelText || "").trim();
  const confidence = clamp(Number(labelResult.confidence), 0, 1);
  const possibleBrands = Array.isArray(labelResult.possibleBrands)
    ? labelResult.possibleBrands.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];

  return {
    brand,
    labelText,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    possibleBrands,
  };
}

function isSupportedImageDataUrl(value) {
  return /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
