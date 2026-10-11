/**
 * dsh-token-chart — browser half entry.
 *
 * Registers the plugin's seats (settings section, sidebar entry + panel, the
 * right-sidebar drawer, the session-header action), intercepts the product's
 * own usage pill, and keeps the preference store warm for every seat.
 *
 * Built by scripts/build-client.mjs into client/client.js as a
 * `window.__ModuleLoader__` factory — the DSH client-module contract, the same
 * shape the shipped plugins use.
 *
 * @module dsh-token-chart/client
 */
import type { Translate } from './models.ts'

import { DEFAULT_PREFS, KIND, NS, PANEL_ID } from './contract.ts'
import { apiGet, prefsStore } from './api.ts'
import { HeaderUsageButton, installStyles, PanelIcon, registerSettingsNavIcon } from './chrome.tsx'
import { isUsagePill } from './pill.ts'
import { en, zh } from './locales.ts'
import { DailyUsagePanel } from './panel.tsx'
import { SessionUsageBody } from './drawer.tsx'
import { TokenChartSettings } from './settings.tsx'
import type { ClientContext } from './contract.ts'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-token-chart: dictionaries')
  ctx.effect(() => installStyles(), 'dsh-token-chart: styles')
  ctx.effect(() => registerSettingsNavIcon(() => t('settings.nav')), 'dsh-token-chart: settings nav icon')

  /** Optional services captured as they appear. */
  const services: { sidebarRight: any; sidebarRightTabs: any } = {
    sidebarRight: undefined,
    sidebarRightTabs: undefined,
  }

  const openDrawer = (sessionId: string): boolean => {
    const right = services.sidebarRight
    if (right === undefined || typeof sessionId !== 'string' || sessionId === '') return false
    try {
      right.openTab(KIND, { params: { sessionId } })
      return true
    } catch (error) {
      console.warn('[dsh-token-chart] could not open the usage drawer:', error)
      return false
    }
  }

  const mountedSessionId = () => {
    const right = services.sidebarRight
    if (right === undefined || right.mounted === undefined) return undefined
    try {
      return right.mounted.getSnapshot()
    } catch {
      return undefined
    }
  }

  /* Warm the preference store for every seat. */
  ctx.effect(() => {
    let live = true
    apiGet('/prefs')
      .then((payload) => {
        if (live) prefsStore.set({ ...DEFAULT_PREFS, ...payload.value })
      })
      .catch(() => {
        /* defaults */
      })
    return () => {
      live = false
    }
  }, 'dsh-token-chart: preferences')

  /* ---- settings page ------------------------------------------- */

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'token-chart',
        order: 30,
        label: () => t('settings.nav'),
        locale: NS,
      },
      TokenChartSettings,
    ),
  )

  /* ---- left sidebar entry + panel ------------------------------ */

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 12,
        label: () => t('panel.title'),
        locale: NS,
      },
      PanelIcon,
    ),
  )

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      },
      DailyUsagePanel,
    ),
  )

  /* ---- session header shortcut --------------------------------- */

  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'token-chart',
        order: 6,
        locale: NS,
        inject: (sessionId: string) => ({ sessionId, open: openDrawer }),
      },
      HeaderUsageButton,
    ),
  )

  /* ---- right sidebar tab type + seats -------------------------- */

  ctx.inject(['sidebarRightTabs'], (injected: Record<string, any>) => {
    const tabs = injected.get('sidebarRightTabs')
    if (tabs === undefined) return undefined
    services.sidebarRightTabs = tabs
    const disposers: Array<() => void> = []
    try {
      disposers.push(
        tabs.register({
          id: KIND,
          kind: KIND,
          priority: 'extension',
          title: () => t('usage.title'),
          guide: [
            {
              id: KIND,
              order: 40,
              title: () => t('usage.title'),
              description: () => t('usage.session'),
            },
          ],
        }),
      )
    } catch (error) {
      console.warn('[dsh-token-chart] tab type registration failed:', error)
      return undefined
    }
    disposers.push(
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: KIND,
            locale: NS,
            inject: (sessionId: string) => ({ sessionId }),
          },
          SessionUsageBody,
        ),
      ),
    )
    disposers.push(
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab.title',
            key: KIND,
            locale: NS,
          },
          ({ t: translate }: { t: Translate }) => <span className="dtc-tab-title">{translate('usage.title')}</span>,
        ),
      ),
    )
    return () => {
      services.sidebarRightTabs = undefined
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          /* a seat already collapsed is not a failure */
        }
      }
    }
  })

  ctx.inject(['sidebarRight'], (injected: Record<string, any>) => {
    services.sidebarRight = injected.get('sidebarRight')
    return () => {
      services.sidebarRight = undefined
    }
  })

  /* ---- usage pill interception --------------------------------- */

  ctx.effect(() => {
    const onClick = (event: MouseEvent): void => {
      if (prefsStore.get().interceptUsageButton !== true) return
      if (isUsagePill(event.target) === false) return
      const sessionId = mountedSessionId()
      if (sessionId === undefined) return
      if (openDrawer(sessionId) === false) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, 'dsh-token-chart: usage pill interception')

  ctx.effect(
    () => () => {
      /* listeners and registrations are disposed with this fiber */
    },
    'dsh-token-chart: teardown',
  )
}
