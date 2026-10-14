import type { RewardEntry } from '../domain/types'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values))
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
export function currentMonth() {
  return today().slice(0, 7)
}
export function monthLabel(month: string) {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`
}
export function shiftMonth(month: string, offset: number) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7)
}
export function newId() {
  return crypto.randomUUID()
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : '操作失败，请稍后重试。'
}
export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(['\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function shanghaiDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
/** Different reward units and names keep separate balances; adjustments are not consumption. */
export function rewardSummary(entries: RewardEntry[], kind: 'earned' | 'used') {
  const groups = new Map<string, { name: string; unit: string; quantity: number }>()
  for (const entry of entries) {
    if (kind === 'used' ? entry.kind !== 'used' : entry.quantity <= 0) continue
    const key = JSON.stringify([entry.name, entry.unit])
    const group = groups.get(key) ?? { name: entry.name, unit: entry.unit, quantity: 0 }
    group.quantity += kind === 'used' ? -entry.quantity : entry.quantity
    groups.set(key, group)
  }
  return groups.size
    ? [...groups.values()]
        .map(
          (group) =>
            `${group.name || '成长奖励'} ${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(group.quantity)}${group.unit}`,
        )
        .join(' · ')
    : '暂无'
}
