/**
 * The paginated data table every surface renders under its chart.
 *
 * @module dsh-token-chart/client/table
 */
import type { ColumnSpec, TableRow, Translate } from './models.ts'

import { React } from './react.ts'

import { exactTokens, fill } from './format.ts'

/** Page sizes offered under a table, smallest first. */
export const PAGE_SIZES = [10, 20, 50]
export const DEFAULT_PAGE_SIZE = 20

/**
 * The page numbers to render: the ends, plus a window around the current page.
 *
 * Short tables list every page; longer ones collapse the middle into `gap`
 * markers, so fifty pages still read as `1 … 4 5 [6] 7 8 … 50`.
 * @param current - the page in view.
 * @param pages - total pages.
 */
export function pageItems(current: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_unused, index) => index + 1)
  const items: Array<number | 'gap'> = [1]
  const start = Math.max(2, current - 2)
  const end = Math.min(pages - 1, current + 2)
  if (start > 2) items.push('gap')
  for (let page = start; page <= end; page += 1) items.push(page)
  if (end < pages - 1) items.push('gap')
  items.push(pages)
  return items
}

/**
 * A table with client-side pagination.
 *
 * The pager is always part of the table: every surface keeps the same
 * footer, and a short table simply shows one page with both steps disabled.
 * Changing the page size (or the data itself) returns to the first page, and
 * the current page is clamped, so a shrinking range can never leave the
 * reader on an empty page.
 * @param columns - column definitions.
 * @param rows - every row of the table, before paging.
 */
export function DataTable({ columns, rows, t }: { columns: ColumnSpec[]; rows: TableRow[]; t: Translate }) {
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
  const [page, setPage] = React.useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(Math.max(page, 1), pages)
  const start = (current - 1) * pageSize
  const visible = rows.slice(start, start + pageSize)

  React.useEffect(() => {
    setPage(1)
  }, [rows.length, pageSize])

  if (rows.length === 0) return null
  return (
    <div className="dtc-table-block">
      <div className="dtc-table-wrap">
        <table className="dtc-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.align === 'right' ? 'dtc-right' : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={row.key ?? index}>
                {columns.map((column) => (
                  <td key={column.key} className={column.align === 'right' ? 'dtc-right' : undefined}>
                    {column.render ? column.render(row) : String(row[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        className="dtc-pager tw:flex tw:items-center tw:justify-end tw:gap-1"
        data-dtc-pager={`${current}/${pages}`}
        aria-label={t('table.pagination')}
      >
        <span className="dtc-pager-total">{fill(t('table.total'), { count: exactTokens(rows.length) })}</span>
        <button
          type="button"
          className="dtc-page dtc-page-nav"
          data-dtc-page-step="prev"
          disabled={current <= 1}
          aria-label={t('table.prev')}
          onClick={() => setPage((value) => Math.max(1, Math.min(value, pages) - 1))}
        >
          {'‹'}
        </button>
        {pageItems(current, pages).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="dtc-page-gap" aria-hidden="true">
              {'…'}
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={item === current ? 'dtc-page dtc-page-current' : 'dtc-page'}
              data-dtc-page-number={item}
              aria-current={item === current ? 'page' : undefined}
              aria-label={fill(t('table.page'), { page: String(item) })}
              onClick={() => setPage(item)}
            >
              {String(item)}
            </button>
          ),
        )}
        <button
          type="button"
          className="dtc-page dtc-page-nav"
          data-dtc-page-step="next"
          disabled={current >= pages}
          aria-label={t('table.next')}
          onClick={() => setPage((value) => Math.min(pages, Math.min(Math.max(value, 1), pages) + 1))}
        >
          {'›'}
        </button>
        <span className="dtc-page-size">
          <select
            className="dtc-select"
            data-dtc-page-size={pageSize}
            aria-label={t('table.pageSizeLabel')}
            value={String(pageSize)}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {fill(t('table.pageSize'), { size: String(size) })}
              </option>
            ))}
          </select>
          <svg className="dtc-select-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
      </nav>
    </div>
  )
}
