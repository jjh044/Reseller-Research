import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  brandFiles: defineTable({
    clientId: v.string(),
    brandId: v.string(),
    brand: v.string(),
    savedAt: v.string(),
    reportData: v.any(),
  })
    .index("by_client_brand", ["clientId", "brand"])
    .index("by_client_brand_id", ["clientId", "brandId"]),
  marketplaceCache: defineTable({
    cacheKey: v.string(),
    brand: v.string(),
    generatedAt: v.string(),
    expiresAt: v.string(),
    responseData: v.any(),
  }).index("by_cache_key", ["cacheKey"]),
});
