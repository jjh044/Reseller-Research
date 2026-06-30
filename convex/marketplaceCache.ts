import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {
    cacheKey: v.string(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("marketplaceCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();

    if (!cached) return null;

    return {
      brand: cached.brand,
      generatedAt: cached.generatedAt,
      expiresAt: cached.expiresAt,
      responseData: cached.responseData,
    };
  },
});

export const save = mutation({
  args: {
    cacheKey: v.string(),
    brand: v.string(),
    generatedAt: v.string(),
    expiresAt: v.string(),
    responseData: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketplaceCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        brand: args.brand,
        generatedAt: args.generatedAt,
        expiresAt: args.expiresAt,
        responseData: args.responseData,
      });
    } else {
      await ctx.db.insert("marketplaceCache", args);
    }

    return {
      ok: true,
      cacheKey: args.cacheKey,
      expiresAt: args.expiresAt,
    };
  },
});
