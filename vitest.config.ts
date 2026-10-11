import { defineConfig } from 'vitest/config'

/**
 * Two projects because the halves have different needs: the host suite mounts
 * the plugin on a fake Cordis context in plain Node, while the browser suite
 * brings its own jsdom window and evaluates the built client artifact inside it.
 */
export default defineConfig({
  test: {
    // Both client files drive the same live host preferences, so they must not
    // run at the same time — the second would read what the first just wrote.
    fileParallelism: false,
    maxWorkers: 1,
    projects: [
      {
        test: {
          name: 'host',
          environment: 'node',
          include: ['tests/host.test.mjs'],
          testTimeout: 60000,
        },
      },
      {
        test: {
          name: 'client',
          environment: 'node',
          include: ['tests/client*.test.mjs'],
          testTimeout: 180000,
        },
      },
    ],
  },
})
