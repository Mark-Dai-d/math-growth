import { defaultRules } from './defaults'
import { indicatorIds } from './types'
import type {
  ExamRecord,
  MonthlySettlement,
  MonthlySnapshot,
  Rating,
  RuleVersion,
  RulesConfig,
  WeeklyRecord,
} from './types'

export { defaultRules }

export const ratingLabels: Record<Rating, string> = {
  excellent: '优秀',
  good: '良好',
  improve: '待提升',
  pending: '待评估',
}

const scoreFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})

export function formatScore(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? scoreFormatter.format(value) : '—'
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Calendar validation never converts a local calendar date through a time zone. */
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1
}

function assertMonth(month: string): void {
  if (!validMonth(month)) throw new RangeError('月份必须是有效的 YYYY-MM 格式')
}

/** Validate imported/editor configuration before it can become a rule version. */
export function validateRules(config: RulesConfig): string[] {
  const errors: string[] = []
  if (!config || typeof config !== 'object') return ['规则配置不能为空']
  const extraKeys = (value: unknown, allowed: string[]) =>
    value !== null &&
    typeof value === 'object' &&
    Object.keys(value).some((key) => !allowed.includes(key))
  if (extraKeys(config, ['indicators', 'month', 'exam', 'reward', 'semester']))
    errors.push('规则配置含未支持的字段，请勿保存私人信息')
  const indicators = config.indicators
  if (!Array.isArray(indicators) || indicators.length !== 4) errors.push('必须包含四项积分指标')
  if (Array.isArray(indicators)) {
    const ids = indicators.map((indicator) => indicator?.id)
    if (new Set(ids).size !== 4 || indicatorIds.some((id) => !ids.includes(id)))
      errors.push('四项指标标识必须完整且唯一')
    for (const indicator of indicators) {
      if (
        !indicator ||
        typeof indicator.name !== 'string' ||
        !indicator.name.trim() ||
        [...indicator.name.trim()].length > 100
      )
        errors.push('指标名称需要 1—100 个字符')
      if (!indicator || !finite(indicator.max) || indicator.max <= 0 || indicator.max > 10)
        errors.push('每项指标满分必须大于 0 且不超过 10')
      if (!indicator || typeof indicator.description !== 'string') errors.push('指标说明必须是文字')
      if (
        !indicator ||
        !Array.isArray(indicator.criteria) ||
        indicator.criteria.length === 0 ||
        indicator.criteria.length > 32 ||
        indicator.criteria.some((item) => typeof item !== 'string' || !item.trim())
      )
        errors.push('每项指标需要 1—32 条完整评分细则')
      if (extraKeys(indicator, ['id', 'name', 'max', 'description', 'criteria']))
        errors.push('指标含未支持的字段')
    }
    if (
      indicators.every((indicator) => finite(indicator?.max)) &&
      Math.abs(indicators.reduce((sum, indicator) => sum + indicator.max, 0) - 10) > 1e-9
    )
      errors.push('四项指标满分合计必须为 10')
  }
  const monthly = config.month
  if (
    !monthly ||
    !Number.isInteger(monthly.minRecords) ||
    monthly.minRecords < 1 ||
    monthly.minRecords > 2147483647
  )
    errors.push('最少有效授课次数必须为 1—2147483647 的正整数')
  if (extraKeys(monthly, ['minRecords', 'excellentAverage', 'excellentTotal', 'goodTotal']))
    errors.push('月度门槛含未支持的字段')
  if (
    !monthly ||
    !finite(monthly.excellentAverage) ||
    monthly.excellentAverage < 0 ||
    monthly.excellentAverage > 10
  )
    errors.push('优秀月均分门槛必须在 0—10 之间')
  const exam = config.exam
  if (!exam || !finite(exam.cap) || exam.cap < 0 || exam.cap > 10)
    errors.push('每月考试加分上限必须在 0—10 之间')
  const maximum = 10 + (finite(exam?.cap) && exam.cap >= 0 ? exam.cap : 0)
  for (const [key, label] of [
    ['excellentTotal', '优秀'],
    ['goodTotal', '良好'],
  ] as const) {
    if (!monthly || !finite(monthly[key]) || monthly[key] < 0 || monthly[key] > maximum)
      errors.push(`${label}综合分门槛必须在 0—${maximum} 之间`)
  }
  if (
    monthly &&
    finite(monthly.goodTotal) &&
    finite(monthly.excellentTotal) &&
    monthly.goodTotal > monthly.excellentTotal
  )
    errors.push('良好综合分门槛不能高于优秀门槛')
  if (!exam || !Array.isArray(exam.tiers) || exam.tiers.length > 1000)
    errors.push('考试加分档位需要 0—1000 个档位')
  else {
    const thresholds = new Set<number>()
    for (const tier of exam.tiers) {
      if (
        !tier ||
        !finite(tier.minImprovement) ||
        tier.minImprovement <= 0 ||
        tier.minImprovement > 100
      )
        errors.push('考试进步门槛必须大于 0 且不超过 100 个百分点')
      if (!tier || !finite(tier.bonus) || tier.bonus < 0) errors.push('考试档位加分必须是非负数')
      if (tier && finite(tier.bonus) && finite(exam.cap) && tier.bonus > exam.cap)
        errors.push('考试档位加分不能超过每月加分上限')
      if (tier && thresholds.has(tier.minImprovement)) errors.push('考试进步门槛不能重复')
      if (tier) thresholds.add(tier.minImprovement)
      if (extraKeys(tier, ['minImprovement', 'bonus'])) errors.push('考试档位含未支持的字段')
    }
  }
  if (extraKeys(exam, ['tiers', 'cap'])) errors.push('考试奖励含未支持的字段')
  const reward = config.reward
  if (!reward || !finite(reward.cap) || reward.cap < 0 || reward.cap > 1000000)
    errors.push('每月奖励上限必须在 0—1000000 之间')
  if (
    !reward ||
    !Array.isArray(reward.stages) ||
    reward.stages.length === 0 ||
    reward.stages.length > 120 ||
    reward.stages.some((stage) => !finite(stage) || stage < 0 || stage > 1000000)
  )
    errors.push('奖励阶梯需要 1—120 项，数量在 0—1000000 之间')
  if (
    !reward ||
    typeof reward.name !== 'string' ||
    typeof reward.description !== 'string' ||
    typeof reward.unit !== 'string'
  )
    errors.push('奖励名称、说明与单位必须是文字，可以留空')
  if (extraKeys(reward, ['name', 'description', 'unit', 'stages', 'cap']))
    errors.push('连续奖励含未支持的字段')
  if (
    !config.semester ||
    typeof config.semester.award !== 'string' ||
    typeof config.semester.description !== 'string'
  )
    errors.push('学期评价配置必须是文字，可以留空')
  if (extraKeys(config.semester, ['award', 'description'])) errors.push('学期评价含未支持的字段')
  return [...new Set(errors)]
}

function assertRules(config: RulesConfig): void {
  const errors = validateRules(config)
  if (errors.length) throw new RangeError(errors.join('；'))
}

/** null means no valid assessment; it must never be treated as a zero score. */
export function calculateWeeklyTotal(
  record: WeeklyRecord,
  ruleConfig: RulesConfig = defaultRules,
): number | null {
  if (record.status !== 'completed' || !record.scores || !validDate(record.lesson_date)) return null
  if (validateRules(ruleConfig).length) return null
  let total = 0
  for (const id of indicatorIds) {
    const indicator = ruleConfig.indicators.find((item) => item.id === id)!
    const score = record.scores[id]
    if (!finite(score) || score < 0 || score > indicator.max) return null
    total += score
  }
  return total
}

/** Same-day versions are ordered by version number, never by input array order. */
export function selectRuleVersion(versions: RuleVersion[], date: string): RuleVersion {
  if (!validDate(date)) throw new RangeError('生效日期必须是有效的 YYYY-MM-DD 格式')
  const applicable = versions
    .filter((version) => validDate(version.effective_from) && version.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.version - a.version)
  if (!applicable.length) throw new RangeError(`在 ${date} 没有适用的规则版本`)
  assertRules(applicable[0].config)
  return applicable[0]
}

function validExam(exam: ExamRecord): boolean {
  return (
    validDate(exam.exam_date) &&
    finite(exam.score) &&
    finite(exam.max_score) &&
    exam.max_score > 0 &&
    exam.score >= 0 &&
    exam.score <= exam.max_score
  )
}

/** Return a percentage-point change, not a relative percentage increase. */
export function calculateExamImprovement(
  exam: ExamRecord,
  baseline: ExamRecord | null | undefined,
): number | null {
  if (
    !baseline ||
    !exam.comparable ||
    exam.comparison_id !== baseline.id ||
    exam.id === baseline.id
  )
    return null
  if (
    !validExam(exam) ||
    !validExam(baseline) ||
    exam.student_id !== baseline.student_id ||
    baseline.exam_date >= exam.exam_date
  )
    return null
  // One quotient avoids cancellation at exact 5/10-point boundaries; no display rounding is involved.
  const rational =
    (100 * (exam.score * baseline.max_score - baseline.score * exam.max_score)) /
    (exam.max_score * baseline.max_score)
  return finite(rational)
    ? rational
    : 100 * (exam.score / exam.max_score - baseline.score / baseline.max_score)
}

export function calculateExamBonus(
  exams: ExamRecord[],
  month: string,
  config: RulesConfig = defaultRules,
): number {
  assertMonth(month)
  assertRules(config)
  const byId = new Map(exams.map((exam) => [exam.id, exam]))
  const seen = new Set<string>()
  let sum = 0
  for (const exam of exams) {
    if (seen.has(exam.id) || exam.exam_date.slice(0, 7) !== month) continue
    seen.add(exam.id)
    const improvement = calculateExamImprovement(
      exam,
      exam.comparison_id ? byId.get(exam.comparison_id) : undefined,
    )
    if (improvement === null) continue
    // Exactly one tier per exam. Several exams can contribute until the monthly cap.
    const tier = [...config.exam.tiers]
      .sort((a, b) => b.minImprovement - a.minImprovement)
      .find((item) => improvement >= item.minImprovement)
    if (tier) sum += tier.bonus
  }
  return Math.min(sum, config.exam.cap)
}

/**
 * Call with one student's records. Optional versions preserve the weights linked to
 * individual weeks; config controls this month's bonus and rating thresholds.
 * The returned object owns its rule configuration for immutable settlement storage.
 */
export function calculateMonth(
  weekly: WeeklyRecord[],
  exams: ExamRecord[],
  month: string,
  config: RulesConfig = defaultRules,
  versions?: RuleVersion[],
): MonthlySnapshot {
  assertMonth(month)
  assertRules(config)
  const monthRecords = weekly.filter((record) => record.lesson_date.slice(0, 7) === month)
  const studentIds = new Set([
    ...monthRecords.map((record) => record.student_id),
    ...exams.filter((exam) => exam.exam_date.slice(0, 7) === month).map((exam) => exam.student_id),
  ])
  if (studentIds.size > 1) throw new RangeError('请先按学生筛选数据再计算月度结算')
  const seen = new Set<string>()
  const valid: { record: WeeklyRecord; total: number }[] = []
  for (const record of monthRecords) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    let weeklyRules = config
    if (versions && record.status === 'completed') {
      const linked = versions.find((version) => version.id === record.rule_version_id)
      if (!linked) throw new RangeError(`周记录 ${record.id} 关联的规则版本不存在`)
      if (!validDate(linked.effective_from) || linked.effective_from > record.lesson_date)
        throw new RangeError(`周记录 ${record.id} 的规则尚未生效`)
      weeklyRules = linked.config
    }
    const total = calculateWeeklyTotal(record, weeklyRules)
    if (total !== null) valid.push({ record, total })
  }
  const validCount = valid.length
  const average = validCount ? valid.reduce((sum, item) => sum + item.total, 0) / validCount : null
  const examBonus = calculateExamBonus(exams, month, config)
  const total = average === null ? null : average + examBonus
  let rating: Rating = 'pending'
  if (validCount >= config.month.minRecords && average !== null && total !== null) {
    rating =
      average >= config.month.excellentAverage && total >= config.month.excellentTotal
        ? 'excellent'
        : total >= config.month.goodTotal
          ? 'good'
          : 'improve'
  }
  return {
    validCount,
    average,
    examBonus,
    total,
    calculatedRating: rating,
    rating,
    overrideReason: '',
    strengths: '',
    improvements: '',
    weeklyIds: valid.map((item) => item.record.id),
    examIds: [
      ...new Set(
        exams
          .filter((exam) => exam.exam_date.slice(0, 7) === month && validExam(exam))
          .map((exam) => exam.id),
      ),
    ],
    ruleConfig: structuredClone(config),
    weeklyInputs: structuredClone(monthRecords),
    examInputs: structuredClone(
      exams
        .filter((exam) => exam.exam_date.slice(0, 7) === month)
        .map((exam) => ({
          ...exam,
          comparisonInput: exams.find((baseline) => baseline.id === exam.comparison_id) ?? null,
        })),
    ),
  }
}

/** Missing/pending months pause; an evaluated non-excellent month breaks the streak. */
export function calculateStreak(
  settlements: MonthlySettlement[],
  beforeMonth?: string,
): { current: number; longest: number; excellentMonths: number } {
  if (beforeMonth !== undefined) assertMonth(beforeMonth)
  const latest = new Map<string, MonthlySettlement>()
  const studentIds = new Set<string>()
  for (const settlement of settlements) {
    const month = validMonth(settlement.month)
      ? settlement.month
      : validDate(settlement.month) && settlement.month.endsWith('-01')
        ? settlement.month.slice(0, 7)
        : null
    if (!month || (beforeMonth !== undefined && month >= beforeMonth)) continue
    studentIds.add(settlement.student_id)
    const previous = latest.get(month)
    if (
      !previous ||
      settlement.revision > previous.revision ||
      (settlement.revision === previous.revision && settlement.finalized_at > previous.finalized_at)
    )
      latest.set(month, settlement)
  }
  if (studentIds.size > 1) throw new RangeError('请先按学生筛选数据再计算连续优秀')
  let current = 0,
    longest = 0,
    excellentMonths = 0
  for (const [, settlement] of [...latest.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rating = settlement.snapshot.rating
    if (rating === 'excellent') {
      current += 1
      excellentMonths += 1
      longest = Math.max(longest, current)
    } else if (rating === 'good' || rating === 'improve') current = 0
  }
  return { current, longest, excellentMonths }
}

/** This is the newly earned amount for that month, never a replacement balance. */
export function rewardForStreak(streak: number, config: RulesConfig = defaultRules): number {
  assertRules(config)
  if (!Number.isInteger(streak) || streak < 1) return 0
  return Math.min(
    config.reward.stages[Math.min(streak - 1, config.reward.stages.length - 1)],
    config.reward.cap,
  )
}
