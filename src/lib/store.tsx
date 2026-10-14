import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { newId, errorMessage } from './utils'
import type {
  AppData,
  WeeklyRecord,
  ExamRecord,
  RulesConfig,
  Rating,
  MonthlySettlement,
  SemesterReview,
  PublicGrowth,
} from '../domain/types'
import { defaultRules } from '../domain/defaults'
import { demoData } from '../domain/demo'
import {
  calculateMonth,
  calculateStreak,
  calculateWeeklyTotal,
  rewardForStreak,
  selectRuleVersion,
  validateRules,
} from '../domain/engine'

const emptyData: AppData = {
  students: [],
  rules: [],
  weekly: [],
  exams: [],
  settlements: [],
  rewards: [],
  semesters: [],
  publicGrowth: [],
  audit: [],
}
type Mode = 'public' | 'admin' | 'demo'
interface Store {
  data: AppData
  mode: Mode
  session: Session | null
  authLoading: boolean
  loading: boolean
  error: string | null
  publicRules: RulesConfig
  studentId: string
  selectStudent: (id: string) => void
  enterDemo: () => void
  leaveDemo: () => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  saveWeekly: (record: WeeklyRecord) => Promise<void>
  deleteWeekly: (id: string) => Promise<void>
  saveExam: (record: ExamRecord) => Promise<void>
  deleteExam: (id: string) => Promise<void>
  saveRules: (config: RulesConfig, date: string) => Promise<void>
  settleMonth: (
    month: string,
    rating: Rating | null,
    reason: string,
    strengths: string,
    improvements: string,
    recalculate: boolean,
  ) => Promise<void>
  useReward: (quantity: number, name: string, unit: string, note: string) => Promise<void>
  adjustReward: (quantity: number, name: string, unit: string, reason: string) => Promise<void>
  publishMonth: (id: string, publish: boolean) => Promise<void>
  saveSemester: (review: SemesterReview) => Promise<void>
  saveStudent: (name: string, grade: string) => Promise<void>
}
const StoreContext = createContext<Store | null>(null)
function assertClient() {
  if (!supabase) throw new Error('请先配置 Supabase。')
  return supabase
}
function checkResult<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error
  return result
}
const monthKey = (value: string) => value.slice(0, 7)
/** Read every page in stable ID order, including servers configured below 1,000 rows. */
async function selectAll<T extends { id: string }>(
  client: NonNullable<typeof supabase>,
  table: string,
  current: () => boolean,
  publishedOnly = false,
): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | undefined
  while (current()) {
    let query = client.from(table).select('*').order('id', { ascending: true }).limit(500)
    if (cursor) query = query.gt('id', cursor)
    if (publishedOnly) query = query.eq('published', true)
    const result = checkResult(await query),
      page = (result.data ?? []) as T[]
    if (!page.length) break
    rows.push(...page)
    const next = page[page.length - 1].id
    if (!next || next === cursor) throw new Error('数据分页未能前进，请重新加载。')
    cursor = next
  }
  return rows
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [mode, setMode] = useState<Mode>('public')
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(!supabase)
  const [authLoading, setAuthLoading] = useState(!!supabase)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publicRules, setPublicRules] = useState(defaultRules)
  const [studentId, setStudentId] = useState('')
  const dataRef = useRef(data),
    modeRef = useRef(mode),
    sessionRef = useRef(session)
  const requestRevision = useRef(0),
    accessRevision = useRef(0),
    mounted = useRef(true)
  function replaceData(next: AppData) {
    dataRef.current = next
    setData(next)
  }
  function changeMode(next: Mode) {
    if (modeRef.current !== next) requestRevision.current += 1
    modeRef.current = next
    setMode(next)
  }
  function clearPrivateData() {
    requestRevision.current += 1
    replaceData(emptyData)
    setStudentId('')
    setLoading(false)
  }
  function acceptSession(next: Session | null) {
    const changed = sessionRef.current?.user.id !== next?.user.id
    sessionRef.current = next
    if (changed) {
      accessRevision.current += 1
      requestRevision.current += 1
      if (modeRef.current !== 'demo') {
        clearPrivateData()
        changeMode('public')
        setAuthLoading(true)
      }
    }
    setSession(next)
    setSessionReady(true)
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestRevision.current += 1
      accessRevision.current += 1
    }
  }, [])
  useEffect(() => {
    if (!supabase) return
    let active = true,
      sawAuthEvent = false
    // Keep this callback synchronous: awaiting Supabase here can deadlock Auth.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        sawAuthEvent = true
        acceptSession(next)
      }
    })
    void supabase.auth
      .getSession()
      .then(({ data: result, error: authError }) => {
        if (!active || sawAuthEvent) return
        acceptSession(result.session)
        if (authError) setError(authError.message)
      })
      .catch((cause) => {
        if (active && !sawAuthEvent) {
          acceptSession(null)
          setError(errorMessage(cause))
        }
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    if (!sessionReady || modeRef.current === 'demo' || !supabase) return
    let active = true
    const revision = ++accessRevision.current,
      userId = session?.user.id
    const current = () =>
      active &&
      mounted.current &&
      revision === accessRevision.current &&
      modeRef.current !== 'demo' &&
      sessionRef.current?.user.id === userId
    if (!session) {
      changeMode('public')
      setAuthLoading(false)
      return
    }
    setAuthLoading(true)
    const determine = async () => {
      try {
        const result = checkResult(await supabase!.rpc('is_admin'))
        if (current()) {
          changeMode(result.data === true ? 'admin' : 'public')
          if (result.data !== true) setError('当前账号没有管理员授权，请由数据库管理员授权。')
        }
      } catch (cause) {
        if (current()) {
          clearPrivateData()
          changeMode('public')
          setError(errorMessage(cause))
        }
      } finally {
        if (current()) setAuthLoading(false)
      }
    }
    void determine()
    return () => {
      active = false
    }
  }, [session?.user.id, sessionReady, mode === 'demo'])
  async function refresh() {
    const requestedMode = modeRef.current,
      client = supabase
    if (requestedMode === 'demo' || !client) return
    const revision = ++requestRevision.current,
      userId = sessionRef.current?.user.id
    const current = () =>
      mounted.current &&
      revision === requestRevision.current &&
      modeRef.current === requestedMode &&
      sessionRef.current?.user.id === userId
    setLoading(true)
    if (requestedMode === 'admin' || !sessionRef.current) setError(null)
    try {
      const publicConfiguration = client.rpc('get_public_rules')
      if (requestedMode === 'admin') {
        const tables: [keyof AppData, string][] = [
          ['students', 'students'],
          ['rules', 'rule_versions'],
          ['weekly', 'weekly_records'],
          ['exams', 'exams'],
          ['settlements', 'monthly_settlements'],
          ['rewards', 'reward_entries'],
          ['semesters', 'semester_reviews'],
          ['publicGrowth', 'public_growth'],
        ]
        const [results, audit, rules] = await Promise.all([
          Promise.all(
            tables.map(
              async ([key, table]) => [key, await selectAll(client, table, current)] as const,
            ),
          ),
          client
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(200),
          publicConfiguration,
        ])
        checkResult(audit)
        checkResult(rules)
        if (!current()) return
        const loaded = {
          ...Object.fromEntries(results),
          audit: audit.data ?? [],
        } as unknown as AppData
        replaceData(loaded)
        setStudentId((previous) =>
          loaded.students.some((student) => student.id === previous)
            ? previous
            : (loaded.students[0]?.id ?? ''),
        )
        const config = rules.data?.config ?? rules.data
        if (config && !validateRules(config).length) setPublicRules(config)
      } else {
        const [published, rules] = await Promise.all([
          selectAll<PublicGrowth>(client, 'public_growth', current, true),
          publicConfiguration,
        ])
        checkResult(rules)
        if (!current()) return
        replaceData({
          ...emptyData,
          publicGrowth: published.sort((a, b) => a.month.localeCompare(b.month)),
        })
        setStudentId('')
        const config = rules.data?.config ?? rules.data
        setPublicRules(config && !validateRules(config).length ? config : defaultRules)
      }
    } catch (cause) {
      if (current()) {
        setError(errorMessage(cause))
        throw cause
      }
    } finally {
      if (current()) setLoading(false)
    }
  }
  useEffect(() => {
    if (!authLoading && sessionReady) void refresh().catch(() => {})
  }, [mode, authLoading, sessionReady])
  // A committed write remains successful even if the following read fails.
  // refresh already exposes its error in the global banner; retrying the write could duplicate a ledger entry.
  async function refreshAfterSave() {
    try {
      await refresh()
    } catch {
      /* Keep the refresh error for the retry-read action. */
    }
  }
  function demoMutate(
    action: string,
    entity: string,
    fn: (d: AppData) => AppData,
    detail: Record<string, unknown> = {},
    entityId: string | null = null,
  ) {
    const previous = dataRef.current,
      next = fn(previous)
    replaceData({
      ...next,
      audit: [
        {
          id: newId(),
          actor_id: null,
          action,
          entity,
          entity_id: entityId,
          detail: { mode: 'demo', ...structuredClone(detail) },
          created_at: new Date().toISOString(),
        },
        ...previous.audit,
      ],
    })
  }
  function requireAdmin() {
    if (modeRef.current !== 'admin' && modeRef.current !== 'demo')
      throw new Error('请使用已授权的管理员账号登录。')
  }
  async function saveWeekly(record: WeeklyRecord) {
    requireAdmin()
    if (modeRef.current === 'demo') {
      demoMutate(
        'save',
        'weekly_records',
        (d) => {
          const existing = d.weekly.find((r) => r.id === record.id)
          if (
            d.weekly.some(
              (r) =>
                r.id !== record.id &&
                r.student_id === record.student_id &&
                r.lesson_date === record.lesson_date,
            )
          )
            throw new Error('该学生在此日期已有周记录，请编辑现有记录。')
          if (
            existing &&
            (existing.student_id !== record.student_id ||
              existing.rule_version_id !== record.rule_version_id)
          )
            throw new Error('历史记录的学生和规则版本不可更改。')
          const version = existing
            ? d.rules.find((r) => r.id === existing.rule_version_id)
            : selectRuleVersion(d.rules, record.lesson_date)
          if (!version || record.lesson_date < version.effective_from)
            throw new Error('授课日期不能早于关联规则的生效日期。')
          const saved = structuredClone({
            ...record,
            rule_version_id: version.id,
            scores: record.status === 'completed' ? record.scores : null,
          })
          if (saved.status === 'completed' && calculateWeeklyTotal(saved, version.config) === null)
            throw new Error('请检查四项积分和授课日期。')
          return { ...d, weekly: [...d.weekly.filter((r) => r.id !== saved.id), saved] }
        },
        {},
        record.id,
      )
      return
    }
    const client = assertClient()
    const existing = dataRef.current.weekly.some((r) => r.id === record.id)
    const { created_at, rule_version_id, ...payload } = record
    checkResult(
      await (existing
        ? client.from('weekly_records').update(payload).eq('id', record.id)
        : client.from('weekly_records').insert(payload)),
    )
    await refreshAfterSave()
  }
  async function deleteWeekly(id: string) {
    requireAdmin()
    if (modeRef.current === 'demo')
      demoMutate(
        'delete',
        'weekly_records',
        (d) => ({ ...d, weekly: d.weekly.filter((r) => r.id !== id) }),
        {},
        id,
      )
    else {
      checkResult(await assertClient().from('weekly_records').delete().eq('id', id))
      await refreshAfterSave()
    }
  }
  async function saveExam(record: ExamRecord) {
    requireAdmin()
    if (modeRef.current === 'demo') {
      demoMutate(
        'save',
        'exams',
        (d) => {
          const baseline = d.exams.find((r) => r.id === record.comparison_id)
          if (
            !Number.isFinite(record.score) ||
            !Number.isFinite(record.max_score) ||
            record.max_score <= 0 ||
            record.score < 0 ||
            record.score > record.max_score
          )
            throw new Error('成绩必须在 0 与考试满分之间。')
          if (record.comparable && !baseline) throw new Error('确认可比性前请先选择对比考试。')
          if (
            record.comparison_id &&
            (!baseline ||
              baseline.student_id !== record.student_id ||
              baseline.exam_date >= record.exam_date ||
              baseline.id === record.id)
          )
            throw new Error('对比考试必须是同一学生更早的考试。')
          const existing = d.exams.find((r) => r.id === record.id)
          if (existing && existing.student_id !== record.student_id)
            throw new Error('考试所属学生不可更改。')
          if (d.exams.some((r) => r.comparison_id === record.id && r.exam_date <= record.exam_date))
            throw new Error('日期调整会破坏已有考试对比。')
          return {
            ...d,
            exams: [...d.exams.filter((r) => r.id !== record.id), structuredClone(record)],
          }
        },
        {},
        record.id,
      )
      return
    }
    const { created_at, ...payload } = record
    checkResult(await assertClient().from('exams').upsert(payload))
    await refreshAfterSave()
  }
  async function deleteExam(id: string) {
    requireAdmin()
    if (modeRef.current === 'demo')
      demoMutate(
        'delete',
        'exams',
        (d) => {
          if (d.exams.some((e) => e.comparison_id === id))
            throw new Error('其他考试仍引用此考试，请先修改对比考试。')
          return { ...d, exams: d.exams.filter((r) => r.id !== id) }
        },
        {},
        id,
      )
    else {
      checkResult(await assertClient().from('exams').delete().eq('id', id))
      await refreshAfterSave()
    }
  }
  async function saveRules(config: RulesConfig, date: string) {
    requireAdmin()
    const errors = validateRules(config)
    if (errors.length) throw new Error(errors.join('；'))
    if (modeRef.current === 'demo') {
      const id = newId()
      demoMutate(
        'create_version',
        'rule_versions',
        (d) => ({
          ...d,
          rules: [
            ...d.rules,
            {
              id,
              version: Math.max(0, ...d.rules.map((r) => r.version)) + 1,
              effective_from: date,
              config: structuredClone(config),
              created_at: new Date().toISOString(),
            },
          ],
        }),
        { effective_from: date },
        id,
      )
      return
    }
    checkResult(await assertClient().from('rule_versions').insert({ effective_from: date, config }))
    await refreshAfterSave()
  }
  async function settleMonth(
    month: string,
    rating: Rating | null,
    reason: string,
    strengths: string,
    improvements: string,
    recalculate: boolean,
  ) {
    requireAdmin()
    if (modeRef.current === 'demo') {
      const current = dataRef.current,
        version = selectRuleVersion(current.rules, `${month}-01`)
      const existing = current.settlements.find(
        (s) => s.student_id === studentId && monthKey(s.month) === month,
      )
      if (existing && !recalculate) throw new Error('该月已结算，需选择重新结算。')
      if ((existing || rating) && !reason.trim())
        throw new Error('调整评级或重新结算必须填写原因。')
      if (!current.students.some((s) => s.id === studentId)) throw new Error('请先选择学生。')
      const snapshot = calculateMonth(
        current.weekly.filter((r) => r.student_id === studentId),
        current.exams.filter((r) => r.student_id === studentId),
        month,
        version.config,
        current.rules,
      )
      if (rating) snapshot.rating = rating
      snapshot.overrideReason = reason
      snapshot.strengths = strengths
      snapshot.improvements = improvements
      const settlement: MonthlySettlement = {
        id: existing?.id ?? newId(),
        student_id: studentId,
        month: `${month}-01`,
        rule_version_id: version.id,
        revision: (existing?.revision ?? 0) + 1,
        snapshot,
        finalized_at: new Date().toISOString(),
      }
      const detail = {
        reason,
        revision: settlement.revision,
        ...(existing
          ? {
              previousSnapshot: structuredClone(existing.snapshot),
              previousRevision: existing.revision,
            }
          : {}),
      }
      demoMutate(
        existing ? 'recalculate' : 'settle',
        'monthly_settlements',
        (d) => {
          const next = [...d.settlements.filter((s) => s.id !== settlement.id), settlement]
          const streak = calculateStreak(
            next.filter((s) => s.student_id === studentId && monthKey(s.month) <= month),
          ).current
          const quantity =
            snapshot.rating === 'excellent' ? rewardForStreak(streak, version.config) : 0
          const award =
            quantity > 0 &&
            !d.rewards.some((r) => r.settlement_id === settlement.id && r.kind === 'earned')
          return {
            ...d,
            settlements: next,
            rewards: award
              ? [
                  ...d.rewards,
                  {
                    id: newId(),
                    student_id: studentId,
                    settlement_id: settlement.id,
                    kind: 'earned',
                    quantity,
                    name: version.config.reward.name,
                    unit: version.config.reward.unit,
                    note: `${month} 优秀奖励`,
                    created_at: settlement.finalized_at,
                  },
                ]
              : d.rewards,
            publicGrowth: existing
              ? d.publicGrowth.map((p) => (p.id === settlement.id ? { ...p, published: false } : p))
              : d.publicGrowth,
          }
        },
        detail,
        settlement.id,
      )
      return
    }
    checkResult(
      await assertClient().rpc('settle_month', {
        p_student_id: studentId,
        p_month: `${month}-01`,
        p_override_rating: rating,
        p_reason: reason,
        p_strengths: strengths,
        p_improvements: improvements,
        p_recalculate: recalculate,
      }),
    )
    await refreshAfterSave()
  }
  async function useReward(quantity: number, name: string, unit: string, note: string) {
    requireAdmin()
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000)
      throw new Error('使用数量必须大于 0 且不超过 1000000。')
    if (modeRef.current === 'demo') {
      const id = newId()
      demoMutate(
        'use',
        'reward_entries',
        (d) => {
          const balance = d.rewards
            .filter((r) => r.student_id === studentId && r.name === name && r.unit === unit)
            .reduce((s, r) => s + r.quantity, 0)
          if (quantity > balance) throw new Error('使用数量超过剩余奖励。')
          return {
            ...d,
            rewards: [
              ...d.rewards,
              {
                id,
                student_id: studentId,
                settlement_id: null,
                kind: 'used',
                quantity: -quantity,
                name,
                unit,
                note,
                created_at: new Date().toISOString(),
              },
            ],
          }
        },
        { quantity: -quantity, name, unit },
        id,
      )
      return
    }
    checkResult(
      await assertClient().rpc('use_reward', {
        p_student_id: studentId,
        p_quantity: quantity,
        p_name: name,
        p_unit: unit,
        p_note: note,
      }),
    )
    await refreshAfterSave()
  }
  async function adjustReward(quantity: number, name: string, unit: string, reason: string) {
    requireAdmin()
    if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 1000000)
      throw new Error('调整数量必须是非零有限数值，绝对值不能超过 1000000。')
    if (!reason.trim()) throw new Error('调整奖励必须填写原因。')
    if (modeRef.current === 'demo') {
      const id = newId()
      demoMutate(
        'adjust',
        'reward_entries',
        (d) => {
          if (!d.students.some((s) => s.id === studentId)) throw new Error('请先选择学生。')
          const balance = d.rewards
            .filter((r) => r.student_id === studentId && r.name === name && r.unit === unit)
            .reduce((sum, r) => sum + r.quantity, 0)
          if (balance + quantity < 0) throw new Error('调整后奖励余额不能小于 0。')
          return {
            ...d,
            rewards: [
              ...d.rewards,
              {
                id,
                student_id: studentId,
                settlement_id: null,
                kind: 'adjustment',
                quantity,
                name,
                unit,
                note: reason.trim(),
                created_at: new Date().toISOString(),
              },
            ],
          }
        },
        { quantity, name, unit, reason: reason.trim() },
        id,
      )
      return
    }
    checkResult(
      await assertClient().rpc('adjust_reward', {
        p_student_id: studentId,
        p_quantity: quantity,
        p_name: name,
        p_unit: unit,
        p_reason: reason,
      }),
    )
    await refreshAfterSave()
  }
  async function publishMonth(id: string, publish: boolean) {
    requireAdmin()
    if (modeRef.current === 'demo') {
      demoMutate(
        publish ? 'publish' : 'unpublish',
        'public_growth',
        (d) => {
          const s = d.settlements.find((s) => s.id === id)
          if (!s) throw new Error('结算不存在。')
          const month = monthKey(s.month)
          return {
            ...d,
            publicGrowth: [
              ...d.publicGrowth.filter((p) => p.id !== id),
              {
                id,
                month: s.month,
                label: `${month} · 匿名学习者（虚构演示）`,
                average: s.snapshot.average,
                exam_bonus: s.snapshot.examBonus,
                rating: s.snapshot.rating,
                streak: calculateStreak(
                  d.settlements.filter(
                    (m) => m.student_id === s.student_id && monthKey(m.month) <= month,
                  ),
                ).current,
                published: publish,
                created_at: new Date().toISOString(),
              },
            ],
          }
        },
        { published: publish },
        id,
      )
      return
    }
    checkResult(
      await assertClient().rpc('publish_month', { p_settlement_id: id, p_publish: publish }),
    )
    await refreshAfterSave()
  }
  async function saveSemester(review: SemesterReview) {
    requireAdmin()
    if (modeRef.current === 'demo') {
      if (review.start_date > review.end_date) throw new Error('结束日期不能早于开始日期。')
      demoMutate(
        'save',
        'semester_reviews',
        (d) => ({
          ...d,
          semesters: [...d.semesters.filter((s) => s.id !== review.id), structuredClone(review)],
        }),
        {},
        review.id,
      )
      return
    }
    const { created_at, ...payload } = review
    checkResult(await assertClient().from('semester_reviews').upsert(payload))
    await refreshAfterSave()
  }
  async function saveStudent(name: string, grade: string) {
    requireAdmin()
    if (!name.trim()) throw new Error('请填写学生姓名。')
    if (modeRef.current === 'demo') {
      const id = newId()
      demoMutate(
        'create',
        'students',
        (d) => ({
          ...d,
          students: [
            ...d.students,
            { id, name: name.trim(), grade, created_at: new Date().toISOString() },
          ],
        }),
        {},
        id,
      )
      return
    }
    checkResult(await assertClient().from('students').insert({ name: name.trim(), grade }))
    await refreshAfterSave()
  }
  function enterDemo() {
    accessRevision.current += 1
    requestRevision.current += 1
    const d = structuredClone(demoData)
    changeMode('demo')
    replaceData(d)
    setStudentId(d.students[0]?.id ?? '')
    setError(null)
    setLoading(false)
    setAuthLoading(false)
  }
  function leaveDemo() {
    clearPrivateData()
    changeMode('public')
    setAuthLoading(!!sessionRef.current && !!supabase)
  }
  async function signOut() {
    if (modeRef.current === 'demo') {
      leaveDemo()
      return
    }
    checkResult(await assertClient().auth.signOut())
    acceptSession(null)
    clearPrivateData()
    changeMode('public')
    setAuthLoading(false)
  }
  return (
    <StoreContext.Provider
      value={{
        data,
        mode,
        session,
        authLoading,
        loading,
        error,
        publicRules,
        studentId,
        selectStudent: setStudentId,
        enterDemo,
        leaveDemo,
        signOut,
        refresh,
        saveWeekly,
        deleteWeekly,
        saveExam,
        deleteExam,
        saveRules,
        settleMonth,
        useReward,
        adjustReward,
        publishMonth,
        saveSemester,
        saveStudent,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}
export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('StoreProvider missing')
  return value
}
