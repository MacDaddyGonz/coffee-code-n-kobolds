import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // convex-test runs the Convex functions in a V8-like sandbox rather than
    // Node, matching the runtime they actually deploy to.
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
    include: ['convex/**/*.test.ts'],
  },
})
