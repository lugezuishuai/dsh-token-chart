/**
 * Transport and shared state: the preference store every seat reads,
 * the JSON helpers, and the polling hooks the surfaces use.
 *
 * @module dsh-token-chart/client/api
 */
import type { Prefs } from '../types.ts'

import type { EndpointState } from './models.ts'

import { React } from './react.ts'

import { API, DEFAULT_PREFS } from './contract.ts'

export const useSyncExternalStore =
  typeof React.useSyncExternalStore === 'function'
    ? React.useSyncExternalStore
    : (subscribe: (onStoreChange: () => void) => () => void, getSnapshot: () => unknown) => {
        const [value, setValue] = React.useState(getSnapshot)
        React.useEffect(() => subscribe(() => setValue(getSnapshot())), [subscribe, getSnapshot])
        return value
      }

/** Snapshot store every seat subscribes to. */
export interface PrefsStore {
  get: () => Prefs
  set: (next: Prefs) => void
  subscribe: (listener: () => void) => () => void
}

export const prefsStore: PrefsStore = (() => {
  let value: Prefs = { ...DEFAULT_PREFS }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: Prefs) => {
      value = next
      for (const listener of [...listeners]) (listener as () => void)()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})()

export function usePrefs(): Prefs {
  return useSyncExternalStore(prefsStore.subscribe, prefsStore.get) as Prefs
}

/* --------------------------------------------------------- api client */

export async function apiGet(path: string): Promise<{ value: any }> {
  const response = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } })
  const payload = await response.json().catch(() => null)
  if (payload === null || payload.ok !== true) {
    throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
  }
  return payload
}

export async function apiPost(path: string, body: unknown): Promise<{ value: any }> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const payload = await response.json().catch(() => null)
  if (payload === null || payload.ok !== true) {
    throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
  }
  return payload
}

/**
 * Poll one API path: initial load, then a refresh whenever `tick` changes.
 * @param path - API path including its query string.
 * @param tick - refresh trigger.
 */
export function useEndpoint(path: string, tick: number): EndpointState {
  const [state, setState] = React.useState<EndpointState>({ loading: true, value: undefined })
  React.useEffect(() => {
    let live = true
    setState((current) => ({ ...current, loading: true }))
    apiGet(path)
      .then((payload) => {
        if (!live) return
        setState({ loading: false, value: payload.value, error: undefined })
      })
      .catch((error) => {
        if (!live) return
        setState({
          loading: false,
          value: undefined,
          error: String((error as Error)?.message ?? error),
        } as EndpointState)
      })
    return () => {
      live = false
    }
  }, [path, tick])
  return state
}

/* ------------------------------------------------------------- layout */

export function useElementWidth(): [React.RefObject<any>, number] {
  const ref = React.useRef(null)
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const node = ref.current as HTMLElement | null
    if (node === null) return undefined
    const update = (): void => setWidth((node as HTMLElement).clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/* ----------------------------------------------------------- charts */
