import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Scaffolding only. The `pings` table exists purely to prove that a write in
// one browser tab shows up live in another; it gets deleted once the real
// games / characters schema lands.
export default defineSchema({
  pings: defineTable({
    name: v.string(),
  }),
})
