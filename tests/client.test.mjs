/**
 * Browser-half suite: the plugin's real artifact in jsdom, driven against the
 * live host API, with the ECharts chunk available.
 */
import { it } from 'vitest'
import { runClientSuite } from './support/client-harness.mjs'
import { expectAll } from './support/expect-all.mjs'

it('renders, configures and opens the drawer', async () => {
  expectAll(await runClientSuite())
}, 180000)
