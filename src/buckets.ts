/**
 * The usage model: provider samples, bucket arithmetic, and the time helpers
 * that turn them into chart-ready rows.
 *
 * @module dsh-token-chart/buckets
 */
import { DAY_MS } from './constants.ts'
import type { Buckets, Derived, SessionEvent, UsageSample } from './types.ts'

/** One zeroed bucket set. */
export function zeroBuckets(): Buckets {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * The last `usage` chunk embedded in one durable Assistant settlement stream.
 * @param stream - compact records of the settlement.
 * @returns the provider usage object, or undefined.
 */
export function lastStreamUsage(stream: readonly unknown[] | undefined): UsageSample | undefined {
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record === null || typeof record !== 'object') continue
    if (record.type !== 'chunk') continue
    const chunk = record.chunk
    if (chunk !== null && typeof chunk === 'object' && chunk.type === 'usage') return chunk.usage
  }
  return undefined
}

/** The usage one durable settlement reports, if any. */
export function usageOf(event: SessionEvent): UsageSample | undefined {
  const data = event.data
  if (data === null || typeof data !== 'object') return undefined
  if (event.type === 'assistant/message' && data.usage !== undefined) return data.usage
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined
  return lastStreamUsage(data.stream)
}

/** Normalize one provider usage sample into the four billed buckets. */
export function bucketsFrom(usage: UsageSample | undefined): Buckets | undefined {
  if (usage === null || typeof usage !== 'object') return undefined
  const input = usage.inputTokens
  const output = usage.outputTokens
  if (!isCount(input) || !isCount(output)) return undefined
  const cacheRead = usage.cacheReadTokens === undefined ? 0 : usage.cacheReadTokens
  const cacheWrite = usage.cacheWriteTokens === undefined ? 0 : usage.cacheWriteTokens
  if (!isCount(cacheRead) || !isCount(cacheWrite)) return undefined
  return { input, output, cacheRead, cacheWrite }
}

export function bucketsEqual(left: Buckets, right: Buckets): boolean {
  return (
    left.input === right.input &&
    left.output === right.output &&
    left.cacheRead === right.cacheRead &&
    left.cacheWrite === right.cacheWrite
  )
}

export function addInto(total: Buckets, buckets: Buckets): Buckets {
  total.input += buckets.input
  total.output += buckets.output
  total.cacheRead += buckets.cacheRead
  total.cacheWrite += buckets.cacheWrite
  return total
}

export function subtract(total: Buckets, buckets: Buckets): Buckets {
  total.input -= buckets.input
  total.output -= buckets.output
  total.cacheRead -= buckets.cacheRead
  total.cacheWrite -= buckets.cacheWrite
  return total
}

/** Derived figures shared by every response. */
export function derived<T extends Record<string, unknown>>(buckets: Buckets, extra: T = {} as T): Derived & T {
  const { input, output, cacheRead, cacheWrite } = buckets
  const cache = cacheRead + cacheWrite
  const billedInput = input + cacheRead + cacheWrite
  const total = billedInput + output
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cache,
    total,
    cacheHitRate: billedInput > 0 ? cacheRead / billedInput : 0,
    ...extra,
  }
}

/** Local calendar-day key `YYYY-MM-DD`. */
export function dayKey(time: number): string {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Epoch ms of local midnight, `offset` days back. */
export function startOfLocalDay(offset = 0): number {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime() - offset * DAY_MS
}

export function timeLabel(time: number): string {
  const date = new Date(time)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
