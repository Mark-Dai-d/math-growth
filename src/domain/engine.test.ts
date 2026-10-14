import { describe, expect, it } from 'vitest'
import { defaultRules } from './defaults'
import { createDemoData } from './demo'
import {
  calculateExamBonus,
  calculateExamImprovement,
  calculateMonth,
  calculateStreak,
  calculateWeeklyTotal,
  formatScore,
  rewardForStreak,
  selectRuleVersion,
  validateRules,
} from './engine'
import type {
  ExamRecord,
  MonthlySettlement,
  Rating,
  RuleVersion,
  RulesConfig,
  WeeklyRecord,
} from './types'

const rules = () => structuredClone(defaultRules)
const version = (
  id = 'v1',
  effective = '2026-01-01',
  config = rules(),
  number = 1,
): RuleVersion => ({
  id,
  effective_from: effective,
  config,
  version: number,
  created_at: `${effective}T00:00:00Z`,
})
const week = (id = 'w1', total = 8, date = '2026-10-03'): WeeklyRecord => ({
  id,
  student_id: 's1',
  rule_version_id: 'v1',
  lesson_date: date,
  status: 'completed',
  scores: { understanding: 3, consolidation: 3, transfer: 2, engagement: total - 8 },
  criteria_checks: {},
  topics: [],
  consolidation: [],
  weaknesses: '',
  feedback: '',
  next_focus: '',
  created_at: `${date}T00:00:00Z`,
})
const weeks = (total: number, count = 3): WeeklyRecord[] =>
  Array.from({ length: count }, (_, index) =>
    week(`w${index + 1}`, total, `2026-10-${String(index + 1).padStart(2, '0')}`),
  )
const exam = (
  id: string,
  score: number,
  date: string,
  comparisonId: string | null = null,
  maxScore = 100,
): ExamRecord => ({
  id,
  student_id: 's1',
  exam_date: date,
  name: '测评',
  score,
  max_score: maxScore,
  comparison_id: comparisonId,
  comparable: comparisonId !== null,
  scope: '',
  notes: '',
  created_at: `${date}T00:00:00Z`,
})
const settlement = (month: string, rating: Rating, revision = 1): MonthlySettlement => ({
  id: `${month}-${revision}`,
  student_id: 's1',
  month,
  rule_version_id: 'v1',
  revision,
  finalized_at: `${month}-28T00:00:00Z`,
  snapshot: { ...calculateMonth([], [], month, defaultRules), rating, calculatedRating: rating },
})

describe('weekly scoring and missing assessments', () => {
  it('sums all four scores with a ten-point maximum', () => {
    expect(calculateWeeklyTotal(week('w', 10), defaultRules)).toBe(10)
    expect(calculateWeeklyTotal(week('w', 8.5), defaultRules)).toBe(8.5)
  })
  it.each(['absent', 'cancelled', 'pending'] as const)('%s does not become a zero', (status) => {
    expect(calculateWeeklyTotal({ ...week(), status }, defaultRules)).toBeNull()
  })
  it('keeps an explicitly completed zero valid', () => {
    const record = week()
    record.scores = { understanding: 0, consolidation: 0, transfer: 0, engagement: 0 }
    expect(calculateWeeklyTotal(record)).toBe(0)
  })
  it('rejects missing scores rather than assuming zero', () => {
    expect(calculateWeeklyTotal({ ...week(), scores: null })).toBeNull()
    expect(
      calculateWeeklyTotal({
        ...week(),
        scores: { understanding: 3, consolidation: 3, transfer: 2 } as WeeklyRecord['scores'],
      }),
    ).toBeNull()
  })
  it.each([NaN, Infinity, -1, 4])('rejects an invalid indicator score %s', (invalid) => {
    const record = week()
    record.scores!.understanding = invalid
    expect(calculateWeeklyTotal(record)).toBeNull()
  })
  it('uses the supplied rule weights', () => {
    const changed = rules()
    changed.indicators[0].max = 2
    changed.indicators[1].max = 4
    const record = week('w', 10)
    record.scores!.understanding = 2
    record.scores!.consolidation = 4
    expect(calculateWeeklyTotal(record, changed)).toBe(10)
    expect(calculateWeeklyTotal(record, defaultRules)).toBeNull()
  })
  it('rejects impossible calendar dates without shifting valid dates', () => {
    expect(calculateWeeklyTotal(week('w', 8, '2026-02-29'))).toBeNull()
    expect(calculateWeeklyTotal(week('w', 8, '2024-02-29'))).toBe(8)
  })
})

describe('exam improvement and monthly cap', () => {
  const baseline = exam('base', 60, '2026-09-01')
  it('compares normalized rates across different full marks', () => {
    expect(calculateExamImprovement(exam('next', 105, '2026-10-01', 'base', 150), baseline)).toBe(
      10,
    )
  })
  it.each([
    [64.999, 0],
    [65, 0.5],
    [69.999, 0.5],
    [70, 1],
    [55, 0],
  ])('score %s gives bonus %s without tier stacking', (score, bonus) => {
    expect(
      calculateExamBonus([baseline, exam('next', score, '2026-10-01', 'base')], '2026-10'),
    ).toBe(bonus)
  })
  it('does not round a sub-threshold change into a bonus', () => {
    expect(
      calculateExamBonus([baseline, exam('next', 64.999999, '2026-10-01', 'base')], '2026-10'),
    ).toBe(0)
  })
  it('sums different exams and then caps the entire month', () => {
    const exams = [
      baseline,
      exam('a', 65, '2026-10-01', 'base'),
      exam('b', 65, '2026-10-10', 'base'),
      exam('c', 70, '2026-10-20', 'base'),
    ]
    expect(calculateExamBonus(exams, '2026-10')).toBe(1)
    const changed = rules()
    changed.exam.cap = 2
    expect(calculateExamBonus(exams, '2026-10', changed)).toBe(2)
  })
  it('does not count a duplicate exam twice', () => {
    const target = exam('next', 65, '2026-10-01', 'base')
    expect(calculateExamBonus([baseline, target, target], '2026-10')).toBe(0.5)
  })
  it('requires explicit comparability and an existing matching baseline', () => {
    expect(
      calculateExamImprovement(
        { ...exam('next', 70, '2026-10-01', 'base'), comparable: false },
        baseline,
      ),
    ).toBeNull()
    expect(calculateExamImprovement(exam('next', 70, '2026-10-01', 'unknown'), baseline)).toBeNull()
    expect(calculateExamImprovement(exam('next', 70, '2026-10-01', 'base'), undefined)).toBeNull()
    expect(calculateExamBonus([exam('next', 70, '2026-10-01', 'base')], '2026-10')).toBe(0)
  })
  it('requires the same student and a strictly earlier baseline', () => {
    const next = exam('next', 70, '2026-10-01', 'base')
    expect(calculateExamImprovement(next, { ...baseline, student_id: 's2' })).toBeNull()
    expect(calculateExamImprovement(next, { ...baseline, exam_date: '2026-10-01' })).toBeNull()
    expect(calculateExamImprovement(next, { ...baseline, exam_date: '2026-10-02' })).toBeNull()
  })
  it.each([
    { max_score: 0 },
    { score: -1 },
    { score: 101 },
    { max_score: NaN },
    { exam_date: '2026-02-30' },
  ])('rejects invalid exam input %j', (invalid) => {
    expect(
      calculateExamImprovement({ ...exam('next', 70, '2026-10-01', 'base'), ...invalid }, baseline),
    ).toBeNull()
  })
  it('uses editable unsorted thresholds and the highest eligible tier', () => {
    const changed = rules()
    changed.exam.tiers = [
      { minImprovement: 9, bonus: 0.7 },
      { minImprovement: 3, bonus: 0.2 },
    ]
    expect(
      calculateExamBonus([baseline, exam('next', 69, '2026-10-01', 'base')], '2026-10', changed),
    ).toBe(0.7)
  })
  it('returns zero for a month without exams', () =>
    expect(calculateExamBonus([], '2026-10')).toBe(0))
})

describe('monthly rating, precision and history', () => {
  it('requires at least three valid records by default', () => {
    const snapshot = calculateMonth(weeks(10, 2), [], '2026-10')
    expect(snapshot).toMatchObject({ validCount: 2, average: 10, total: 10, rating: 'pending' })
  })
  it('an empty month has null average and total, never zero', () => {
    expect(calculateMonth([], [], '2026-10')).toMatchObject({
      validCount: 0,
      average: null,
      total: null,
      examBonus: 0,
      rating: 'pending',
    })
  })
  it('absence and incomplete records do not dilute the average', () => {
    const records = [
      ...weeks(9),
      { ...week('absent'), status: 'absent' as const },
      { ...week('pending'), status: 'pending' as const, scores: null },
    ]
    expect(calculateMonth(records, [], '2026-10')).toMatchObject({
      validCount: 3,
      average: 9,
      rating: 'excellent',
    })
  })
  it('counts a completed zero as an actual assessment', () => {
    const zero = week('zero')
    zero.scores = { understanding: 0, consolidation: 0, transfer: 0, engagement: 0 }
    expect(calculateMonth([week('a', 9), week('b', 9), zero], [], '2026-10')).toMatchObject({
      validCount: 3,
      average: 6,
      rating: 'improve',
    })
  })
  it('uses calendar month boundaries, not timezone-shifted instants', () => {
    const records = [
      week('previous', 10, '2026-09-30'),
      week('first', 8, '2026-10-01'),
      week('last', 9, '2026-10-31'),
      week('next', 10, '2026-11-01'),
    ]
    expect(calculateMonth(records, [], '2026-10')).toMatchObject({
      validCount: 2,
      average: 8.5,
      weeklyIds: ['first', 'last'],
    })
  })
  it('allows both four and five assessments with the same average', () => {
    expect(calculateMonth(weeks(9, 4), [], '2026-10').average).toBe(9)
    expect(calculateMonth(weeks(9, 5), [], '2026-10').average).toBe(9)
  })
  it('requires both the base-average and total thresholds for excellent', () => {
    const records = weeks(8)
    const exams = [exam('base', 60, '2026-09-01'), exam('next', 65, '2026-10-01', 'base')]
    expect(calculateMonth(records, [], '2026-10').rating).toBe('good')
    expect(calculateMonth(records, exams, '2026-10').rating).toBe('excellent')
    const lower = records.map((record) => ({
      ...record,
      scores: { understanding: 3, consolidation: 3, transfer: 1, engagement: 0.9 },
    }))
    const highExam = [exams[0], { ...exams[1], score: 70 }]
    const belowAverage = calculateMonth(lower, highExam, '2026-10')
    expect(belowAverage.rating).toBe('good')
    expect(belowAverage.total).toBeCloseTo(8.9)
  })
  it('a 7-point total is good while a lower score needs improvement', () => {
    const seven = weeks(8).map((record) => ({
      ...record,
      scores: { understanding: 3, consolidation: 2, transfer: 2, engagement: 0 },
    }))
    expect(calculateMonth(seven, [], '2026-10').rating).toBe('good')
    seven[0].scores.understanding = 2.99
    expect(calculateMonth(seven, [], '2026-10').rating).toBe('improve')
  })
  it('retains full precision for threshold decisions and rounds only display', () => {
    const records = weeks(8.5)
    records[0].scores!.engagement = 0.499
    const result = calculateMonth(records, [], '2026-10')
    expect(formatScore(result.total)).toBe('8.50')
    expect(result.total).toBeLessThan(8.5)
    expect(result.rating).toBe('good')
  })
  it('a perfect month plus an exam bonus can total eleven', () => {
    const exams = [exam('base', 60, '2026-09-01'), exam('next', 70, '2026-10-01', 'base')]
    expect(calculateMonth(weeks(10), exams, '2026-10')).toMatchObject({
      average: 10,
      examBonus: 1,
      total: 11,
    })
  })
  it('copies original weekly records into the snapshot so later edits do not change the saved trend', () => {
    const originals = weeks(9)
    const snapshot = calculateMonth(originals, [], '2026-10')
    originals[0].feedback = 'modified after settlement'
    originals[0].scores!.understanding = 0
    expect(snapshot.weeklyInputs?.[0].scores?.understanding).toBe(3)
    expect(snapshot.weeklyInputs?.[0].feedback).not.toBe('modified after settlement')
    expect(snapshot.average).toBe(9)
  })
  it('copies the rule configuration into the snapshot', () => {
    const config = rules()
    const snapshot = calculateMonth(weeks(9), [], '2026-10', config)
    config.month.excellentAverage = 9.5
    config.indicators[0].name = '已改名'
    expect(snapshot.ruleConfig.month.excellentAverage).toBe(8)
    expect(snapshot.ruleConfig.indicators[0].name).toBe('错题理解')
    expect(snapshot.rating).toBe('excellent')
  })
  it('uses each week’s linked version when weights change mid-month', () => {
    const changed = rules()
    changed.indicators[0].max = 2
    changed.indicators[1].max = 4
    const old = week('old', 10, '2026-10-02')
    const newRecords = [week('new1', 10, '2026-10-15'), week('new2', 10, '2026-10-22')].map(
      (record) => ({
        ...record,
        rule_version_id: 'v2',
        scores: { understanding: 2, consolidation: 4, transfer: 2, engagement: 2 },
      }),
    )
    const result = calculateMonth([old, ...newRecords], [], '2026-10', changed, [
      version(),
      version('v2', '2026-10-14', changed, 2),
    ])
    expect(result).toMatchObject({ validCount: 3, average: 10, rating: 'excellent' })
    expect(calculateMonth([old, ...newRecords], [], '2026-10', changed).validCount).toBe(2)
  })
  it('refuses missing or future linked versions rather than silently repricing history', () => {
    expect(() => calculateMonth(weeks(9), [], '2026-10', rules(), [])).toThrow('规则版本不存在')
    expect(() =>
      calculateMonth(weeks(9), [], '2026-10', rules(), [version('v1', '2026-10-20')]),
    ).toThrow('尚未生效')
  })
  it('does not combine students or duplicate weekly records', () => {
    const records = weeks(9)
    expect(calculateMonth([...records, records[0]], [], '2026-10').validCount).toBe(3)
    expect(() =>
      calculateMonth([...records, { ...week('s2'), student_id: 's2' }], [], '2026-10'),
    ).toThrow('按学生筛选')
  })
  it.each(['2026-00', '2026-13', '2026-1', '2026-10-01'])('rejects invalid month %s', (month) =>
    expect(() => calculateMonth([], [], month)).toThrow(),
  )
})

describe('rule version selection and validation', () => {
  it('chooses the most recent applicable version regardless of array order', () => {
    const old = version(),
      later = version('v2', '2026-10-15', rules(), 2)
    expect(selectRuleVersion([later, old], '2026-10-14').id).toBe('v1')
    expect(selectRuleVersion([old, later], '2026-10-15').id).toBe('v2')
  })
  it('uses version order for multiple changes taking effect on the same day', () => {
    expect(
      selectRuleVersion(
        [version('v3', '2026-10-15', rules(), 3), version('v2', '2026-10-15', rules(), 2)],
        '2026-10-15',
      ).id,
    ).toBe('v3')
  })
  it('throws if no historical rule applies or the requested date is invalid', () => {
    expect(() => selectRuleVersion([version()], '2025-12-31')).toThrow('没有适用')
    expect(() => selectRuleVersion([], '2026-10-01')).toThrow('没有适用')
    expect(() => selectRuleVersion([version()], '2026-02-30')).toThrow('日期')
  })
  it('accepts defaults and detects weight, identity, and threshold errors', () => {
    expect(validateRules(defaultRules)).toEqual([])
    const changed = rules()
    changed.indicators[0].max = 4
    changed.indicators[1].id = 'understanding'
    changed.month.minRecords = 2.5
    changed.exam.tiers.push({ minImprovement: 5, bonus: 1 })
    const errors = validateRules(changed).join('；')
    expect(errors).toContain('合计必须为 10')
    expect(errors).toContain('完整且唯一')
    expect(errors).toContain('正整数')
    expect(errors).toContain('不能重复')
  })
  it('allows rewards and semester prizes to be left blank', () => {
    const changed = rules()
    changed.reward.name = ''
    changed.reward.unit = ''
    changed.reward.description = ''
    changed.semester.award = ''
    changed.semester.description = ''
    expect(validateRules(changed)).toEqual([])
  })
  it('safely rejects malformed imported rules', () => {
    expect(validateRules({} as RulesConfig).length).toBeGreaterThan(0)
    const changed = rules()
    changed.month.goodTotal = Infinity
    changed.exam.cap = -1
    changed.reward.stages = []
    expect(validateRules(changed).length).toBeGreaterThanOrEqual(3)
  })
  it('matches database limits for rule text, arrays and quantities', () => {
    const changed = rules()
    changed.indicators[0].name = '学'.repeat(101)
    changed.indicators[1].criteria = Array.from({ length: 33 }, () => '完成评价')
    changed.month.minRecords = 2147483648
    changed.exam.tiers = Array.from({ length: 1001 }, (_, index) => ({
      minImprovement: index / 100 + 1,
      bonus: 0,
    }))
    changed.reward.stages = Array.from({ length: 121 }, () => 1000001)
    changed.reward.cap = 1000001
    expect(validateRules(changed).length).toBeGreaterThanOrEqual(6)
  })
  it('rejects extra fields that could leak private information through public rules', () => {
    const changed = { ...rules(), studentName: '私密姓名' } as RulesConfig
    expect(validateRules(changed).join('；')).toContain('未支持的字段')
    const indicator = rules()
    Object.assign(indicator.indicators[0], { privateNotes: '不应公开' })
    expect(validateRules(indicator).join('；')).toContain('未支持的字段')
  })
})

describe('streaks and newly earned rewards', () => {
  it('missing and pending months pause rather than interrupt', () => {
    const result = calculateStreak([
      settlement('2026-01', 'excellent'),
      settlement('2026-03', 'pending'),
      settlement('2026-05', 'excellent'),
    ])
    expect(result).toEqual({ current: 2, longest: 2, excellentMonths: 2 })
  })
  it.each(['good', 'improve'] as const)(
    '%s resets the current streak but retains the longest',
    (rating) => {
      const result = calculateStreak([
        settlement('2026-01', 'excellent'),
        settlement('2026-02', 'excellent'),
        settlement('2026-03', rating),
        settlement('2026-04', 'excellent'),
      ])
      expect(result).toEqual({ current: 1, longest: 2, excellentMonths: 3 })
    },
  )
  it('uses adjusted final ratings and the newest revision per month', () => {
    const original = settlement('2026-02', 'good')
    const adjusted = settlement('2026-02', 'excellent', 2)
    adjusted.snapshot.calculatedRating = 'pending'
    adjusted.snapshot.overrideReason = '特殊安排经核实'
    expect(calculateStreak([adjusted, settlement('2026-01', 'excellent'), original])).toEqual({
      current: 2,
      longest: 2,
      excellentMonths: 2,
    })
  })
  it('beforeMonth excludes that month and everything after it', () => {
    expect(
      calculateStreak(
        [
          settlement('2026-08', 'excellent'),
          settlement('2026-09', 'excellent'),
          settlement('2026-10', 'good'),
        ],
        '2026-10',
      ).current,
    ).toBe(2)
  })
  it('normalizes database DATE months together with preview YYYY-MM months', () => {
    const august = { ...settlement('2026-08', 'excellent'), month: '2026-08-01' }
    const september = { ...settlement('2026-09', 'excellent'), month: '2026-09-01' }
    const october = { ...settlement('2026-10', 'good'), month: '2026-10-01' }
    expect(calculateStreak([august, september, october], '2026-10')).toEqual({
      current: 2,
      longest: 2,
      excellentMonths: 2,
    })
    const edited = settlement('2026-09', 'good', 2)
    expect(calculateStreak([august, september, edited])).toEqual({
      current: 0,
      longest: 1,
      excellentMonths: 1,
    })
    expect(
      calculateStreak([
        { ...august, month: '2026-08-32' },
        { ...september, month: '2026-09-02' },
      ]),
    ).toEqual({ current: 0, longest: 0, excellentMonths: 0 })
  })
  it('returns an empty streak and rejects mixing students', () => {
    expect(calculateStreak([])).toEqual({ current: 0, longest: 0, excellentMonths: 0 })
    expect(() =>
      calculateStreak([
        settlement('2026-01', 'excellent'),
        { ...settlement('2026-02', 'excellent'), student_id: 's2' },
      ]),
    ).toThrow('按学生筛选')
  })
  it('awards 1 + 2 + 3 = 6 in the first three excellent months and then caps additions', () => {
    expect([1, 2, 3].reduce((total, streak) => total + rewardForStreak(streak), 0)).toBe(6)
    expect(rewardForStreak(4)).toBe(3)
    expect(rewardForStreak(12)).toBe(3)
    expect(rewardForStreak(0)).toBe(0)
    expect(rewardForStreak(1.5)).toBe(0)
  })
  it('uses changed reward stages and caps without modifying past settlements', () => {
    const changed = rules()
    changed.reward.stages = [2, 4, 6]
    changed.reward.cap = 5
    expect(rewardForStreak(1, changed)).toBe(2)
    expect(rewardForStreak(3, changed)).toBe(5)
  })
})

describe('synthetic preview data and display formatting', () => {
  it('starts with two settled excellent months and a pending current month', () => {
    const data = createDemoData('2026-10-14')
    expect(data.students[0].name).toContain('虚构')
    expect(data.settlements.map((item) => item.month)).toEqual(['2026-08', '2026-09'])
    expect(calculateStreak(data.settlements).current).toBe(2)
    expect(
      calculateMonth(data.weekly, data.exams, '2026-10', data.rules[0].config, data.rules),
    ).toMatchObject({ validCount: 2, rating: 'pending' })
    expect(data.publicGrowth.every((item) => item.label.includes('虚构'))).toBe(true)
    expect(data.publicGrowth.map((item) => item.id)).toEqual(
      data.settlements.map((item) => item.id),
    )
    expect(
      data.rewards.filter((item) => item.kind === 'used').every((item) => item.quantity < 0),
    ).toBe(true)
    expect(data.rewards.reduce((sum, item) => sum + item.quantity, 0)).toBe(2)
  })
  it('returns independent preview data and handles calendar year rollover', () => {
    const one = createDemoData('2027-01-14'),
      two = createDemoData('2027-01-14')
    one.rules[0].config.indicators[0].name = 'changed'
    expect(two.rules[0].config.indicators[0].name).toBe('错题理解')
    expect(two.settlements.map((item) => item.month)).toEqual(['2026-11', '2026-12'])
  })
  it('formats finite scores with two decimals and missing values as a dash', () => {
    expect(formatScore(8.555)).toBe('8.56')
    expect(formatScore(0)).toBe('0.00')
    expect(formatScore(null)).toBe('—')
    expect(formatScore(NaN)).toBe('—')
  })
})
