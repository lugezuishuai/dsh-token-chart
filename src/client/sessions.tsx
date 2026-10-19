/**
 * Session identity for the daily panel: the live catalog (display names) and
 * the shell action that opens one conversation.
 *
 * Both services are optional. Without `uiWorkspace` the session cell is plain
 * text; without `sessions` it falls back to a short id. The catalog is mirrored
 * into a local snapshot so a title that arrives after the first paint — or a
 * rename — re-renders the table without polling.
 *
 * @module dsh-token-chart/client/sessions
 */
import type { Translate } from './models.ts'

import { useSyncExternalStore } from './api.ts'
import { fill } from './format.ts'

/** The subset of one catalog row the panel reads. */
export interface SessionSummaryLike {
  title?: string
  displayTitle?: string
}

/** The subset of the shell's session-list snapshot the panel reads. */
export interface SessionListSnapshotLike {
  byId?: Record<string, SessionSummaryLike | undefined>
}

/** The shell's live session catalog (`ctx.sessions.list`). */
export interface SessionsLike {
  list: {
    getSnapshot: () => SessionListSnapshotLike
    subscribe: (listener: () => void) => () => void
  }
}

/** The shell's navigation face (`ctx.uiWorkspace`). */
export interface WorkspaceLike {
  openSession: (sessionId: string) => void
}

let catalog: SessionsLike | undefined
let workspace: WorkspaceLike | undefined
let snapshot: SessionListSnapshotLike | undefined
let catalogUnsubscribe: (() => void) | undefined
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  version += 1
  for (const listener of [...listeners]) listener()
}

/** Mirror the catalog's current snapshot, notifying only when it changed. */
function readCatalog(): void {
  const next = catalog?.list.getSnapshot()
  if (next === snapshot) return
  snapshot = next
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function versionSnapshot(): number {
  return version
}

/**
 * Adopt the shell's session catalog.
 * @param next - the `sessions` service, or undefined when it goes away.
 * @returns a detach that only clears this attachment.
 */
export function attachSessions(next: SessionsLike | undefined): () => void {
  if (catalog === next) return () => {}
  catalogUnsubscribe?.()
  catalog = next
  snapshot = next?.list.getSnapshot()
  catalogUnsubscribe = next?.list.subscribe(readCatalog)
  notify()
  return () => {
    if (catalog !== next) return
    catalogUnsubscribe?.()
    catalogUnsubscribe = undefined
    catalog = undefined
    snapshot = undefined
    notify()
  }
}

/**
 * Adopt the shell's navigation face.
 * @param next - the `uiWorkspace` service, or undefined when it goes away.
 * @returns a detach that only clears this attachment.
 */
export function attachWorkspace(next: WorkspaceLike | undefined): () => void {
  if (workspace === next) return () => {}
  workspace = next
  notify()
  return () => {
    if (workspace !== next) return
    workspace = undefined
    notify()
  }
}

/**
 * Open one session in the main conversation view.
 * @param sessionId - the session the clicked row belongs to.
 * @returns whether the shell accepted the navigation.
 */
export function openSession(sessionId: string): boolean {
  if (workspace === undefined || sessionId === '') return false
  try {
    workspace.openSession(sessionId)
    return true
  } catch (error) {
    console.warn('[dsh-token-chart] could not open the session:', error)
    return false
  }
}

/** Catalog plus navigation availability; both re-render this hook's owner. */
export function useSessionServices(): { list?: SessionListSnapshotLike; canOpen: boolean } {
  useSyncExternalStore(subscribe, versionSnapshot)
  return { list: snapshot, canOpen: workspace !== undefined }
}

/** The name to show: the stored title, then the catalog's derived title. */
function displayName(summary: SessionSummaryLike | undefined): string {
  if (summary === null || typeof summary !== 'object') return ''
  for (const candidate of [summary.title, summary.displayTitle]) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed !== '') return trimmed
  }
  return ''
}

/** The tail of an unnamed session id, which is the part that distinguishes it. */
function shortId(sessionId: string): string {
  const tail = sessionId.replace(/^session-/, '').slice(-8)
  return tail === '' ? sessionId : `…${tail}`
}

/**
 * One session name cell: a link that opens the conversation, or plain text when
 * the shell has no navigation face. The full name lives in the tooltip, so a
 * clipped cell still reads completely on hover.
 * @param sessionId - the session row's id.
 * @param t - bound translator.
 * @param onError - reported when the shell refuses the navigation.
 */
export function SessionLink({ sessionId, t, onError }: { sessionId: string; t: Translate; onError?: () => void }) {
  const { list, canOpen } = useSessionServices()
  if (sessionId === '') return null
  const name = displayName(list?.byId?.[sessionId])
  const label = name === '' ? shortId(sessionId) : name
  const detail = name === '' ? sessionId : name
  if (canOpen === false) {
    return (
      <span className="dtc-session-name" title={detail}>
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="dtc-session-link"
      title={detail}
      aria-label={fill(t('table.openSession'), { session: detail })}
      onClick={() => {
        if (openSession(sessionId) === false) onError?.()
      }}
    >
      {label}
    </button>
  )
}
