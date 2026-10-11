import { expect } from 'vitest'

/** Report every recorded check as its own soft assertion. */
export function expectAll(results) {
  for (const item of results) {
    expect.soft(item.pass, `${item.name}${item.detail === '' ? '' : ` — ${item.detail}`}`).toBe(true)
  }
  expect(results.length).toBeGreaterThan(0)
}
