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
});
