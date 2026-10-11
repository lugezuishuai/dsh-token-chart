/**
 * Ambient declarations for the loader-provided globals a browser half sees.
 *
 * `require` is not Node's: the client module system passes a function whose
 * `async` member loads a declared package-local chunk. `window.__ModuleLoader__`
 * is the registration entry point every client bundle calls.
 *
 * @module dsh-token-chart/client/globals
 */

/** The chunk-aware require the loader injects into a client factory. */
declare const require: {
  (specifier: string): any
  async: (chunk: string) => Promise<any>
}

interface Window {
  __ModuleLoader__: {
    load: (registration: { id: string; chunk?: string; factory: (require: any) => unknown }) => void
  }
}
