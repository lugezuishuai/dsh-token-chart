/**
 * Degraded browser-half suite: the chart chunk never arrives, so the built-in
 * renderer and the text accounting have to carry every surface.
 */
import { it } from 'vitest'
import { runClientSuite } from './support/client-harness.mjs'
import { expectAll } from './support/expect-all.mjs'

it('falls back to the built-in renderer when the chunk is unavailable', async () => {
  expectAll(await runClientSuite({ chunkFailure: true }))
}, 180000)
