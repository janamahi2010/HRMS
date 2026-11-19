/** Excel export via SheetJS, loaded on demand so it never touches the initial bundle. */
export interface SheetSpec {
  name: string
  rows: Record<string, string | number | null | undefined>[]
  /** Column widths in characters, by header */
  widths?: Record<string, number>
}

export async function exportExcel(filename: string, sheets: SheetSpec[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Note: 'No data for this selection' }])
    const headers = Object.keys(s.rows[0] ?? { Note: '' })
    ws['!cols'] = headers.map((h) => ({
      wch: s.widths?.[h] ?? Math.min(40, Math.max(h.length + 2, ...s.rows.slice(0, 200).map((r) => String(r[h] ?? '').length + 2))),
    }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, { compression: true })
}
