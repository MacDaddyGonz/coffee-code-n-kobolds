import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Two projects because the two halves of the repo need genuinely different
// runtimes. The Convex suites have to run in an edge-like sandbox to match the
// runtime they deploy to; the pure client modules are plain maths and would only
// be slowed down by it — and they need the `@/…` and `@convex/…` aliases that
// vite.config.ts gives the app.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'convex',
          // convex-test runs the Convex functions in a V8-like sandbox rather than
          // Node, matching the runtime they actually deploy to.
          environment: 'edge-runtime',
          server: { deps: { inline: ['convex-test'] } },
          include: ['convex/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@convex': fileURLToPath(new URL('./convex', import.meta.url)),
          },
        },
        test: {
          name: 'client',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
})
