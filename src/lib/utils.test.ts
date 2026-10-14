import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RewardEntry } from '../domain/types'
import {
  csvCell,
  currentMonth,
  monthLabel,
  rewardSummary,
  shanghaiDate,
  shiftMonth,
  today,
} from './utils'

afterEach(() => {
  vi.useRealTimers()
})

describe('Shanghai calendar dates', () => {
  it('rolls into the next local month at 16:00 UTC without using the host time zone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T15:59:59Z'))
    expect(today()).toBe('2026-09-30')
    expect(currentMonth()).toBe('2026-09')
    vi.setSystemTime(new Date('2026-09-30T16:00:00Z'))
    expect(today()).toBe('2026-10-01')
    expect(currentMonth()).toBe('2026-10')
  })
  it('moves across year boundaries using calendar months', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', -12)).toBe('2025-10')
    expect(monthLabel('2026-10')).toBe('2026年10月')
  })
  it('assigns saved UTC reward timestamps to the correct Shanghai day and month', () => {
    expect(shanghaiDate('2026-09-30T15:59:59Z')).toBe('2026-09-30')
    expect(shanghaiDate('2026-09-30T16:00:00Z')).toBe('2026-10-01')
    expect(shanghaiDate(new Date('2026-12-31T16:30:00Z'))).toBe('2027-01-01')
  })
})

describe('reward summaries', () => {
  const entry = (
    id: string,
    name: string,
    unit: string,
    quantity: number,
    kind: RewardEntry['kind'] = 'earned',
  ): RewardEntry => ({
    id,
    name,
    unit,
    quantity,
    kind,
    student_id: 'student',
    settlement_id: kind === 'earned' ? 'settlement' : null,
    note: '',
    created_at: '2026-10-01T00:00:00Z',
  })
  it('keeps different reward names and units separate instead of adding unrelated amounts', () => {
    const rows = [
      entry('a', '设备体验卡', '天', 1),
      entry('b', '设备体验卡', '天', 2),
      entry('c', '图书兑换券', '张', 2),
      entry('d', '设备体验卡', '小时', 4),
    ]
    expect(rewardSummary(rows, 'earned')).toBe('设备体验卡 3天 · 图书兑换券 2张 · 设备体验卡 4小时')
  })
  it('counts signed manual corrections separately from actual consumption and handles empty names', () => {
    const rows = [
      entry('a', '', '天', 3),
      entry('b', '', '天', -1, 'used'),
      entry('c', '', '天', -0.5, 'adjustment'),
      entry('d', '', '天', 2, 'adjustment'),
    ]
    expect(rewardSummary(rows, 'used')).toBe('成长奖励 1天')
    expect(rewardSummary(rows, 'earned')).toBe('成长奖励 5天')
    expect(rewardSummary([], 'earned')).toBe('暂无')
    expect(rewardSummary([rows[2]], 'used')).toBe('暂无')
  })
})

describe('CSV export safety and escaped text', () => {
  it.each([
    '=HYPERLINK("https://example.invalid")',
    '+SUM(1,2)',
    '-1+2',
    '@SUM(A1:A2)',
    '\t=1+1',
    '  =1+1',
  ])('neutralizes spreadsheet formula %j', (text) => {
    expect(csvCell(text)).toBe(`"'${text.replaceAll('"', '""')}"`)
  })
  it('escapes commas, quotes and multiline feedback in one cell', () => {
    expect(csvCell('他说："继续巩固", 集合\n函数')).toBe('"他说：""继续巩固"", 集合\n函数"')
  })
  it('keeps zero and missing data distinct', () => {
    expect(csvCell(0)).toBe('"0"')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })
})
