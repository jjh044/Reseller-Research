function getServiceHealth() {
  return {
    marketplace: Boolean(process.env.RAPIDAPI_KEY),
    ai: Boolean(process.env.OPENAI_API_KEY),
    auth: Boolean(process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY),
    authServer: Boolean(process.env.CLERK_SECRET_KEY),
    storage: Boolean(getConvexHttpUrl()),
    tagImages: Boolean(
      process.env.RAPIDAPI_KEY ||
        process.env.GOOGLE_CSE_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.OPENAI_API_KEY,
    ),
  };
}

function getConvexHttpUrl() {
  if (process.env.CONVEX_HTTP_URL) return process.env.CONVEX_HTTP_URL;
  if (!process.env.CONVEX_URL) return "";
  return process.env.CONVEX_URL.replace(".convex.cloud", ".convex.site");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const services = getServiceHealth();
  res.status(200).json({
    clerkPublishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || "",
    clerkServerConfigured: Boolean(process.env.CLERK_SECRET_KEY),
    ready: services.marketplace && services.ai && services.auth,
    services,
  });
};
