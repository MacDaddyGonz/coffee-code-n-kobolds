import { v } from 'convex/values'

import { mutation, query } from './_generated/server'

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('pings').order('desc').take(20)
  },
})

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert('pings', { name: args.name, at: Date.now() })
  },
})
