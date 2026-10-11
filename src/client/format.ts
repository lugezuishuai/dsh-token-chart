/**
 * Number, rate and time formatting shared by charts, tables and facts.
 *
 * @module dsh-token-chart/client/format
 */
export function compactTokens(value: unknown): string {
  const number = Number(value) || 0
  if (Math.abs(number) >= 1e9) return `${(number / 1e9).toFixed(2)}B`
  if (Math.abs(number) >= 1e6) return `${(number / 1e6).toFixed(2)}M`
  if (Math.abs(number) >= 1e4) return `${(number / 1e3).toFixed(1)}K`
  return String(Math.round(number))
}

export function exactTokens(value: unknown): string {
  return (Number(value) || 0).toLocaleString('en-US')
}

export function percentText(rate: unknown): string {
  return `${((Number(rate) || 0) * 100).toFixed(1)}%`
}

export function clockText(time: unknown, withSeconds = false): string {
  const date = new Date(Number(time) || Date.now())
  const pad = (input: number): string => String(input).padStart(2, '0')
  const base = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return withSeconds ? `${base}:${pad(date.getSeconds())}` : base
}

/** Translate one template with `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return String(template).replace(/\{(\w+)\}/g, (_match, key) =>
    values[key] === undefined ? `{${key}}` : String(values[key]),
  )
}

/* ------------------------------------------------------- prefs store */
