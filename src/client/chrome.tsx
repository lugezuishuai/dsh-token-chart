/**
 * Shell chrome: the icon shared by the menu and the settings row, the
 * session-header entry, the settings-nav marker and the style installer.
 *
 * @module dsh-token-chart/client/chrome
 */
import type { Translate } from './models.ts'

export function PanelIcon({ size = 18, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={true}
      style={{ opacity: active ? 1 : 0.9, display: 'block' }}
    >
      <rect x={3} y={12} width={4} height={9} rx={1} fill="currentColor" />
      <rect x={9} y={8} width={4} height={13} rx={1} fill="currentColor" opacity={0.75} />
      <rect x={15} y={4} width={4} height={17} rx={1} fill="currentColor" opacity={0.5} />
    </svg>
  )
}

/** The session-header usage entry; always present (see the settings copy). */
export function HeaderUsageButton({
  sessionId,
  open,
  t,
}: {
  sessionId: string
  open: (sessionId: string) => boolean
  t: Translate
}) {
  return (
    <button
      type="button"
      className="dtc-header-button"
      aria-label={t('usage.openDrawer')}
      title={t('usage.title')}
      onClick={() => open(sessionId)}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden={true}>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </svg>
      <span className="dtc-header-label">{t('panel.title')}</span>
    </button>
  )
}

/** True when the clicked element is one of the product's usage pills. */
export function isUsagePill(target: any): boolean {
  let node = target
  for (let depth = 0; depth < 6 && node !== null && node !== undefined; depth += 1) {
    if (node.nodeType === 1 && node.tagName === 'BUTTON') {
      const text = node.textContent ?? ''
      if (node.getAttribute('aria-haspopup') === 'dialog' && /\btok\b/i.test(text)) return true
      return false
    }
    node = node.parentNode
  }
  return false
}

/** The Host route that serves the compiled stylesheet. */
const STYLE_PATH = '/token-chart/assets/token-chart.css'
/** Where the stylesheet link is remembered, so a re-mount does not duplicate it. */
const STYLE_LINK_MARKER = 'data-dtc-styles'

export const SETTINGS_NAV_MARKER = 'data-dtc-settings-nav'

/**
 * Keep the marker on our own settings-nav row.
 *
 * The settings shell projects only `id`, `order` and `label` from a
 * `settings.section` registration and picks its icon from a closed list of
 * built-in ids, so there is no icon field to set. Until that contract grows
 * one, identify our localized row after the dialog mounts and draw the same
 * glyph the left-sidebar menu uses through CSS on the marker.
 * @param label - locale-aware resolver for the section label.
 * @returns disposer removing the observer and every marker it set.
 */
export function registerSettingsNavIcon(label: () => string): () => void {
  let disposed = false
  const sync = () => {
    if (disposed) return
    const current = label().trim()
    for (const button of document.querySelectorAll('[role="dialog"] nav button')) {
      if (current !== '' && (button.textContent ?? '').trim() === current) button.setAttribute(SETTINGS_NAV_MARKER, '')
      else button.removeAttribute(SETTINGS_NAV_MARKER)
    }
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => {
    disposed = true
    observer.disconnect()
    for (const marked of document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`))
      marked.removeAttribute(SETTINGS_NAV_MARKER)
  }
}

/**
 * Link the plugin's compiled stylesheet.
 *
 * The CSS is a real artifact served by the Host half and loaded as a stylesheet
 * resource — nothing about styling rides inside the client bundle, and the
 * loader removes the link again when this fiber is disposed.
 *
 * @returns disposer removing the link.
 */
export function installStyles(): () => void {
  const existing = document.querySelector(`link[${STYLE_LINK_MARKER}]`)
  if (existing !== null) return () => {}

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = STYLE_PATH
  link.setAttribute(STYLE_LINK_MARKER, '')
  document.head.appendChild(link)

  return () => {
    link.remove()
  }
}
