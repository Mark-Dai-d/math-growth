import { useStore } from './store'
import { selectRuleVersion, calculateMonth, calculateStreak } from '../domain/engine'
import { defaultRules } from '../domain/defaults'
export function useStudentData(month: string) {
  const store = useStore()
  const { data, studentId } = store
  const weekly = data.weekly
    .filter((r) => r.student_id === studentId)
    .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date))
  const exams = data.exams
    .filter((r) => r.student_id === studentId)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
  const settlements = data.settlements
    .filter((r) => r.student_id === studentId)
    .sort(
      (a, b) => a.month.slice(0, 7).localeCompare(b.month.slice(0, 7)) || a.revision - b.revision,
    )
  let version
  try {
    version = selectRuleVersion(data.rules, `${month}-01`)
  } catch {
    version = null
  }
  const config = version?.config ?? defaultRules
  const forecast = version
    ? calculateMonth(weekly, exams, month, config, data.rules)
    : calculateMonth([], [], month, defaultRules)
  const settlement = [...settlements].reverse().find((r) => r.month.slice(0, 7) === month)
  const snapshot = settlement?.snapshot ?? forecast
  const streak = calculateStreak(settlements)
  const rewards = data.rewards.filter((r) => r.student_id === studentId)
  return {
    store,
    weekly,
    exams,
    settlements,
    config,
    version,
    forecast,
    settlement,
    snapshot,
    streak,
    rewards,
  }
}
