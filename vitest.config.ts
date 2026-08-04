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
          // ⚠️ **Raised from vitest's five-second default, and the reason is a whole class
          // of test rather than one slow case.** Roughly a dozen suites here fill a game to
          // one of its caps — two hundred characters, two hundred tokens, two hundred fog
          // rectangles, twenty-five scenes — because a bound and the write check against it
          // can only be compared *at* the boundary, and there is no cheaper way to reach
          // one. Each of those drives hundreds of real mutations through convex-test's
          // transaction simulator.
          //
          // They sat just inside the default on an idle machine and began tipping over it
          // once the tokens milestone added two more of the same shape, failing in a
          // different file on each run. That is a scheduling accident reported as a bug, and
          // five seconds was never an assertion about any of them: the thing worth failing
          // on is a test that hangs, which thirty seconds still catches.
          testTimeout: 30_000,
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
