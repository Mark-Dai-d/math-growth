import { defaultRules } from './defaults'
import { calculateMonth, calculateStreak, rewardForStreak } from './engine'
import type { AppData, ExamRecord, MonthlySettlement, RuleVersion, WeeklyRecord } from './types'

/** Synthetic preview only. No names, exams or learning records belong to a real person. */
export const demoReferenceDate = '2026-10-14'

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const studentId = uuid(1)
const ruleId = uuid(2)
const timestamp = (date: string) => `${date}T06:00:00.000Z`

function relativeMonth(reference: string, offset: number): string {
  const absolute = Number(reference.slice(0, 4)) * 12 + Number(reference.slice(5, 7)) - 1 + offset
  return `${String(Math.floor(absolute / 12)).padStart(4, '0')}-${String((absolute % 12) + 1).padStart(2, '0')}`
}

function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4)),
    number = Number(month.slice(5, 7))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1]
  return `${month}-${days}`
}

export function createDemoData(referenceDate = demoReferenceDate): AppData {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(referenceDate))
    throw new RangeError('演示基准日期格式应为 YYYY-MM-DD')
  const previousTwo = relativeMonth(referenceDate, -2)
  const previousOne = relativeMonth(referenceDate, -1)
  const current = relativeMonth(referenceDate, 0)
  const baselineMonth = relativeMonth(referenceDate, -3)
  const rule: RuleVersion = {
    id: ruleId,
    version: 1,
    effective_from: `${baselineMonth}-01`,
    config: structuredClone(defaultRules),
    created_at: timestamp(`${baselineMonth}-01`),
  }
  let nextId = 10
  const week = (
    date: string,
    scores: [number, number, number, number],
    topics: string[],
    weakness: string,
    focus: string,
  ): WeeklyRecord => ({
    id: uuid(nextId++),
    student_id: studentId,
    rule_version_id: ruleId,
    lesson_date: date,
    status: 'completed',
    scores: {
      understanding: scores[0],
      consolidation: scores[1],
      transfer: scores[2],
      engagement: scores[3],
    },
    criteria_checks: {},
    topics,
    consolidation: topics.map((topic, index) => ({
      topic,
      mastered: index === 0 || scores[1] === 3,
    })),
    weaknesses: weakness,
    feedback: '虚构演示：愿意解释自己的思路，独立完成后再核对答案。',
    next_focus: focus,
    created_at: timestamp(date),
  })
  const weekly = [
    week(
      `${previousTwo}-03`,
      [3, 2, 2, 1],
      ['集合与常用逻辑用语'],
      '区分充分条件与必要条件',
      '通过反例辨析命题',
    ),
    week(
      `${previousTwo}-10`,
      [3, 3, 1, 1.5],
      ['集合运算', '区间表示'],
      '含端点区间的交并运算',
      '复测区间与数轴对应',
    ),
    week(
      `${previousTwo}-17`,
      [3, 2, 2, 1],
      ['函数概念', '定义域'],
      '分式与根式的定义域',
      '独立写出约束条件',
    ),
    week(
      `${previousTwo}-24`,
      [3, 3, 1, 1.5],
      ['函数表示', '定义域'],
      '分段函数的对应关系',
      '画出函数示意图',
    ),
    week(
      `${previousOne}-05`,
      [3, 3, 1, 1.5],
      ['函数单调性'],
      '用定义证明单调性',
      '完整写出取值与作差步骤',
    ),
    week(
      `${previousOne}-12`,
      [3, 3, 2, 1],
      ['函数奇偶性'],
      '先检查定义域是否对称',
      '延迟复测奇偶性判断',
    ),
    week(
      `${previousOne}-19`,
      [3, 3, 1, 1.5],
      ['二次函数', '最值'],
      '有约束区间的最值',
      '比较顶点与区间端点',
    ),
    week(
      `${previousOne}-26`,
      [3, 3, 2, 1],
      ['指数运算', '指数函数'],
      '指数底数分类',
      '理解图像与性质',
    ),
    week(
      `${current}-03`,
      [3, 3, 1, 1.5],
      ['指数函数', '图像变换'],
      '含参数的分类讨论',
      '复测函数图像变化',
    ),
    week(
      `${current}-10`,
      [3, 3, 2, 1],
      ['对数运算', '对数函数'],
      '换底公式的适用条件',
      '巩固对数定义与运算',
    ),
    {
      id: uuid(nextId++),
      student_id: studentId,
      rule_version_id: ruleId,
      lesson_date: `${current}-17`,
      status: 'pending' as const,
      scores: null,
      criteria_checks: {},
      topics: ['函数综合应用'],
      consolidation: [],
      weaknesses: '',
      feedback: '虚构演示：课程尚未完成，不计入月均分。',
      next_focus: '安排函数知识的延迟复测',
      created_at: timestamp(referenceDate),
    },
  ]
  const exam = (
    id: number,
    date: string,
    name: string,
    score: number,
    comparisonId: number | null,
  ): ExamRecord => ({
    id: uuid(id),
    student_id: studentId,
    exam_date: date,
    name: `${name}（虚构演示）`,
    score,
    max_score: 150,
    comparison_id: comparisonId === null ? null : uuid(comparisonId),
    comparable: comparisonId !== null,
    scope: '高一数学阶段性综合测评',
    notes: '全部为合成数据；假定试卷范围与难度可合理比较。',
    created_at: timestamp(date),
  })
  const exams = [
    exam(50, `${baselineMonth}-20`, '起点测评', 90, null),
    exam(51, `${previousTwo}-27`, '阶段测评一', 98, 50),
    exam(52, `${previousOne}-27`, '阶段测评二', 114, 51),
    exam(53, `${current}-12`, '巩固测评', 121, 52),
  ]
  const settlements: MonthlySettlement[] = [previousTwo, previousOne].map((month, index) => ({
    id: uuid(60 + index),
    student_id: studentId,
    month,
    rule_version_id: ruleId,
    revision: 1,
    snapshot: {
      ...calculateMonth(weekly, exams, month, rule.config, [rule]),
      strengths: '虚构演示：能复述解题方法，错题独立重做逐步稳定。',
      improvements: '虚构演示：继续关注参数分类与定义域条件。',
    },
    finalized_at: timestamp(`${month}-28`),
  }))
  const rewards = settlements.map((settlement, index) => ({
    id: uuid(70 + index),
    student_id: studentId,
    settlement_id: settlement.id,
    kind: 'earned' as const,
    quantity: rewardForStreak(
      calculateStreak(settlements.slice(0, index + 1)).current,
      rule.config,
    ),
    name: rule.config.reward.name,
    unit: rule.config.reward.unit,
    note: '虚构演示：月度优秀奖励。',
    created_at: settlement.finalized_at,
  }))
  return {
    students: [
      { id: studentId, name: '演示学生（虚构）', grade: '高一', created_at: rule.created_at },
    ],
    rules: [rule],
    weekly,
    exams,
    settlements,
    rewards: [
      ...rewards,
      {
        id: uuid(72),
        student_id: studentId,
        settlement_id: null,
        kind: 'used',
        quantity: -1,
        name: rule.config.reward.name,
        unit: rule.config.reward.unit,
        note: '虚构演示：已体验 1 天。',
        created_at: timestamp(`${current}-06`),
      },
    ],
    semesters: [
      {
        id: uuid(80),
        student_id: studentId,
        label: `${current.slice(0, 4)} 秋季学期（虚构演示）`,
        start_date: `${previousTwo}-01`,
        end_date: monthEnd(relativeMonth(referenceDate, 3)),
        review: '虚构演示：从说明错误原因到独立完成关键步骤，逐渐建立稳定的学习习惯。',
        award: '',
        created_at: timestamp(referenceDate),
      },
    ],
    publicGrowth: settlements.map((settlement, index) => ({
      id: settlement.id,
      month: settlement.month,
      label: '匿名成长样本（虚构）',
      average: settlement.snapshot.average,
      exam_bonus: settlement.snapshot.examBonus,
      rating: settlement.snapshot.rating,
      streak: calculateStreak(settlements.slice(0, index + 1)).current,
      published: true,
      created_at: settlement.finalized_at,
    })),
    audit: [
      {
        id: uuid(100),
        actor_id: null,
        action: 'demo_initialized',
        entity: 'demo',
        entity_id: null,
        detail: { synthetic: true, referenceDate, note: '仅用于界面预览，未连接真实数据库。' },
        created_at: timestamp(referenceDate),
      },
    ],
  }
}

export const demoData = createDemoData()
