export const indicatorIds = ['understanding', 'consolidation', 'transfer', 'engagement'] as const
export type IndicatorId = (typeof indicatorIds)[number]
export type Rating = 'excellent' | 'good' | 'improve' | 'pending'
export interface Indicator {
  id: IndicatorId
  name: string
  max: number
  description: string
  criteria: string[]
}
export interface RulesConfig {
  indicators: Indicator[]
  month: { minRecords: number; excellentAverage: number; excellentTotal: number; goodTotal: number }
  exam: { tiers: { minImprovement: number; bonus: number }[]; cap: number }
  reward: { name: string; description: string; unit: string; stages: number[]; cap: number }
  semester: { award: string; description: string }
}
export interface RuleVersion {
  id: string
  version: number
  effective_from: string
  config: RulesConfig
  created_at: string
}
export interface Student {
  id: string
  name: string
  grade: string
  created_at: string
}
export interface WeeklyRecord {
  id: string
  student_id: string
  rule_version_id: string
  lesson_date: string
  status: 'completed' | 'absent' | 'cancelled' | 'pending'
  scores: Record<IndicatorId, number> | null
  criteria_checks: Partial<Record<IndicatorId, number[]>>
  topics: string[]
  consolidation: { topic: string; mastered: boolean }[]
  weaknesses: string
  feedback: string
  next_focus: string
  created_at: string
}
export interface ExamRecord {
  id: string
  student_id: string
  exam_date: string
  name: string
  score: number
  max_score: number
  comparison_id: string | null
  comparable: boolean
  scope: string
  notes: string
  created_at: string
}
export interface MonthlySnapshot {
  validCount: number
  average: number | null
  examBonus: number
  total: number | null
  calculatedRating: Rating
  rating: Rating
  overrideReason: string
  strengths: string
  improvements: string
  weeklyIds: string[]
  examIds: string[]
  ruleConfig: RulesConfig
  weeklyInputs?: WeeklyRecord[]
  examInputs?: (ExamRecord & { comparisonInput: ExamRecord | null })[]
}
export interface MonthlySettlement {
  id: string
  student_id: string
  month: string
  rule_version_id: string
  revision: number
  snapshot: MonthlySnapshot
  finalized_at: string
}
export interface RewardEntry {
  id: string
  student_id: string
  settlement_id: string | null
  kind: 'earned' | 'used' | 'adjustment'
  quantity: number
  name: string
  unit: string
  note: string
  created_at: string
}
export interface SemesterReview {
  id: string
  student_id: string
  label: string
  start_date: string
  end_date: string
  review: string
  award: string
  created_at: string
}
export interface PublicGrowth {
  id: string
  month: string
  label: string
  average: number | null
  exam_bonus: number
  rating: Rating
  streak: number
  published: boolean
  created_at: string
}
export interface AuditEntry {
  id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  detail: Record<string, unknown>
  created_at: string
}
export interface AppData {
  students: Student[]
  rules: RuleVersion[]
  weekly: WeeklyRecord[]
  exams: ExamRecord[]
  settlements: MonthlySettlement[]
  rewards: RewardEntry[]
  semesters: SemesterReview[]
  publicGrowth: PublicGrowth[]
  audit: AuditEntry[]
}
