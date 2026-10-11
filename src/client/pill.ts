/**
 * Detection of the product's own「用量」pill so a click can open the
 * drawer instead of the shipped dialog.
 *
 * @module dsh-token-chart/client/pill
 */
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

/* ------------------------------------------------------------- styles */
