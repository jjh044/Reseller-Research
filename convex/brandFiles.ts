import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("brandFiles")
      .withIndex("by_client_brand", (q) => q.eq("clientId", args.clientId))
      .collect();

    return files.map((file) => ({
      id: file.brandId,
      brand: file.brand,
      savedAt: file.savedAt,
      reportData: file.reportData,
    }));
  },
});

export const save = mutation({
  args: {
    clientId: v.string(),
    id: v.string(),
    brand: v.string(),
    savedAt: v.optional(v.string()),
    reportData: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brandFiles")
      .withIndex("by_client_brand_id", (q) => q.eq("clientId", args.clientId).eq("brandId", args.id))
      .unique();
    const savedAt = args.savedAt || existing?.savedAt || new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        brand: args.brand,
        savedAt,
        reportData: args.reportData,
      });
    } else {
      await ctx.db.insert("brandFiles", {
        clientId: args.clientId,
        brandId: args.id,
        brand: args.brand,
        savedAt,
        reportData: args.reportData,
      });
    }

    return {
      id: args.id,
      brand: args.brand,
      savedAt,
      reportData: args.reportData,
    };
  },
});
