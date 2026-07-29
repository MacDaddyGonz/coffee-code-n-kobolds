import { v } from 'convex/values'

import { mutation, query } from './_generated/server'

// Bounded with .take() rather than .collect() — a habit worth keeping even on a
// throwaway table.
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('pings').order('desc').take(20)
  },
})

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    // No timestamp field: Convex adds _creationTime to every document.
    await ctx.db.insert('pings', { name: args.name })
    return null
  },
})
