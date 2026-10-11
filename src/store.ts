/**
 * Rolling usage store: session → turn → bucket totals, with one slot per
 * settled (turn, step, attempt) so the fold is idempotent.
 *
 * @module dsh-token-chart/store
 */
import { RETENTION_DAYS, STORE_VERSION } from './constants.ts'
import {
  addInto,
  bucketsEqual,
  bucketsFrom,
  isCount,
  subtract,
  startOfLocalDay,
  usageOf,
  zeroBuckets,
} from './buckets.ts'
import type { Buckets, SessionEvent, TurnRecord, TurnRow } from './types.ts'

/** Serialised store file. */
export interface StoreDocument {
  version: number
  savedAt: number
  retentionDays: number
  sessions: Array<{ id: string; turns: Array<Record<string, unknown>> }>
}

/* --------------------------------------------------------------- the store */

/**
 * Rolling usage store: session → turn → bucket totals, with the same
 * replacement semantics the shipped `tokenUsage` projection uses, so the
 * numbers a reader sees here agree with the product's own "用量" pill.
 */
/** One session's turns, keyed by turn number. */
export interface SessionRecord {
  turns: Map<number, TurnRecord>
}

export class UsageStore {
  /** Session id → its turns. */
  readonly sessions = new Map<string, SessionRecord>()

  /** One session record, created on demand. */
  session(sessionId: string): SessionRecord {
    let record = this.sessions.get(sessionId)
    if (record === undefined) {
      record = { turns: new Map() }
      this.sessions.set(sessionId, record)
    }
    return record
  }

  #turn(sessionId: string, turn: number, time: number): TurnRecord {
    const session = this.session(sessionId)
    let record = session.turns.get(turn)
    if (record === undefined) {
      record = {
        turn,
        time,
        lastTime: time,
        // One slot per settled (step, attempt): folded in seq order the store is
        // a pure function of the log, so replaying a session (backfill after a
        // reload, a second read of the same log) can never add the same
        // settlement twice.
        slots: new Map(),
        // Step → seq of the `llm/retry-started` that opened its current
        // attempt. Using the event seq rather than a counter keeps the slot
        // keys identical when the same log is folded again.
        attempts: new Map(),
        totals: zeroBuckets(),
        routes: [],
      }
      session.turns.set(turn, record)
    }
    return record
  }

  /**
   * Fold one committed session event into the store.
   *
   * Mirrors `@deepseek-ai/dsh-token-meter`'s `tokenUsage` projection — each
   * settlement contributes the last usage sample in its stream, a resample of
   * the same slot replaces rather than adds, and `llm/retry-started` opens a new
   * slot so a retried attempt bills again — but stores one bucket set per
   * `(step, attempt)` instead of a single running slot. That difference is what
   * makes the fold idempotent: folding the same log twice yields the same
   * totals, which the product's single-slot fold does not survive.
   * @param sessionId - the session the event was committed to.
   * @param event - one durable session event.
   * @returns whether the store changed.
   */
  apply(sessionId: string, event: SessionEvent): boolean {
    if (event === null || typeof event !== 'object') return false
    const data = event.data
    if (data === null || typeof data !== 'object') return false
    if (event.type === 'llm/retry-started' || event.type === 'llm/retry') {
      const turn = data.turn
      const step = data.step
      if (!isCount(turn) || !isCount(step)) return false
      const record = this.sessions.get(sessionId)?.turns.get(turn)
      if (record === undefined) return false
      const seq = isCount(event.seq) ? event.seq : 0
      if ((record.attempts.get(step) ?? -1) === seq) return false
      record.attempts.set(step, seq)
      return false
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return false
    const usage = usageOf(event)
    if (usage === undefined) return false
    const buckets = bucketsFrom(usage)
    if (buckets === undefined) return false
    const turn = data.turn
    const step = data.step
    if (!isCount(turn) || !isCount(step)) return false
    const time = isCount(event.time) ? event.time : Date.now()
    const record = this.#turn(sessionId, turn, time)
    const slot = `${step}#${record.attempts.get(step) ?? 0}`
    const previous = record.slots.get(slot) ?? null
    if (previous !== null && bucketsEqual(previous, buckets)) {
      record.lastTime = Math.max(record.lastTime, time)
      return false
    }
    if (previous !== null) subtract(record.totals, previous)
    addInto(record.totals, buckets)
    record.slots.set(slot, buckets)
    record.time = Math.min(record.time, time)
    record.lastTime = Math.max(record.lastTime, time)
    const source = data.message?.source
    if (source !== undefined && typeof source.provider === 'string' && typeof source.model === 'string') {
      const route = `${source.provider}/${source.model}`
      if (!record.routes.includes(route)) record.routes.push(route)
    }
    return true
  }

  /**
   * The session's whole-window totals, folded from the per-slot buckets.
   *
   * This is deliberately not "the sum of the turn rows a reader sees": it is
   * one fold over every settled (turn, step, attempt) of the session, which is
   * the same rule the product's own `tokenUsage` projection applies. The two
   * agree by construction, but the intent — and any future change — belongs
   * here, not in the presentation layer.
   * @param sessionId - the session to total.
   */
  sessionTotals(sessionId: string): Buckets {
    const totals = zeroBuckets()
    const session = this.sessions.get(sessionId)
    if (session === undefined) return totals
    for (const record of session.turns.values()) {
      for (const buckets of record.slots.values()) addInto(totals, buckets)
    }
    return totals
  }

  /** Drop turns older than the retention window and empty sessions. */
  prune(now = Date.now()): boolean {
    const floor = startOfLocalDay(RETENTION_DAYS - 1)
    let changed = false
    for (const [sessionId, session] of this.sessions) {
      for (const [turn, record] of session.turns) {
        if (record.lastTime < floor) {
          session.turns.delete(turn)
          changed = true
        }
      }
      if (session.turns.size === 0 && floor > 0) {
        this.sessions.delete(sessionId)
        changed = true
      }
    }
    void now
    return changed
  }

  /** Every turn of every session inside the retention window, oldest first. */
  turns(): TurnRow[] {
    const rows = []
    for (const [sessionId, session] of this.sessions) {
      for (const record of session.turns.values()) {
        rows.push({
          sessionId,
          turn: record.turn,
          time: record.time,
          lastTime: record.lastTime,
          totals: { ...record.totals },
          routes: [...record.routes],
        })
      }
    }
    rows.sort((left, right) => left.time - right.time || left.turn - right.turn)
    return rows
  }

  /** Per-turn rows of one session, ordered by turn. */
  sessionTurns(sessionId: string): TurnRow[] {
    const session = this.sessions.get(sessionId)
    if (session === undefined) return []
    return [...session.turns.values()]
      .sort((left, right) => left.turn - right.turn)
      .map((record) => ({
        sessionId,
        turn: record.turn,
        time: record.time,
        lastTime: record.lastTime,
        totals: { ...record.totals },
        routes: [...record.routes],
      }))
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  /** Serialize the retention window to plain JSON. */
  toJSON(): StoreDocument {
    const sessions = []
    for (const [id, session] of this.sessions) {
      if (session.turns.size === 0) continue
      sessions.push({
        id,
        turns: [...session.turns.values()]
          .sort((left, right) => left.turn - right.turn)
          .map((record) => ({
            turn: record.turn,
            time: record.time,
            lastTime: record.lastTime,
            // The per-slot buckets are the source of truth; `totals` is kept for
            // readability and is recomputed on load.
            slots: [...record.slots.entries()].map(([slot, buckets]) => [slot, { ...buckets }]),
            attempts: [...record.attempts.entries()],
            routes: [...record.routes],
          })),
      })
    }
    return { version: STORE_VERSION, savedAt: Date.now(), retentionDays: RETENTION_DAYS, sessions }
  }

  /**
   * Restore a serialized store, dropping anything outside the window.
   *
   * A document from an older schema is discarded rather than interpreted: the
   * activation-time backfill rebuilds it from the session logs, and guessing at
   * a superseded layout is exactly how a total drifts.
   * @param document - the parsed store file.
   * @returns whether the document was accepted.
   */
  load(document: unknown): boolean {
    if (document === null || typeof document !== 'object') return false
    const candidate = document as Partial<StoreDocument>
    if (!Array.isArray(candidate.sessions)) return false
    if (candidate.version !== STORE_VERSION) return false
    for (const entry of candidate.sessions) {
      if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue
      if (!Array.isArray(entry.turns)) continue
      const session = this.session(entry.id)
      for (const turn of entry.turns) {
        if (turn === null || typeof turn !== 'object') continue
        if (!isCount(turn.turn) || !isCount(turn.time)) continue
        const slots = new Map()
        const totals = zeroBuckets()
        for (const pair of Array.isArray(turn.slots) ? turn.slots : []) {
          if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') continue
          const buckets = bucketsFrom({
            inputTokens: pair[1]?.input,
            outputTokens: pair[1]?.output,
            cacheReadTokens: pair[1]?.cacheRead,
            cacheWriteTokens: pair[1]?.cacheWrite,
          })
          if (buckets === undefined) continue
          slots.set(pair[0], buckets)
          addInto(totals, buckets)
        }
        session.turns.set(turn.turn, {
          turn: turn.turn,
          time: turn.time,
          lastTime: isCount(turn.lastTime) ? turn.lastTime : turn.time,
          slots,
          attempts: new Map(
            (Array.isArray(turn.attempts) ? turn.attempts : []).filter(
              (pair) => Array.isArray(pair) && pair.length === 2 && isCount(pair[0]) && isCount(pair[1]),
            ),
          ),
          totals,
          routes: Array.isArray(turn.routes) ? turn.routes.filter((route) => typeof route === 'string') : [],
        })
      }
    }
    this.prune()
    return true
  }
}

/* ------------------------------------------------------------------- prefs */
