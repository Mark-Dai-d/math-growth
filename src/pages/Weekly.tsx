import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
  Download,
  CheckCircle2,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useStudentData } from '../lib/derived'
import { currentMonth, today, newId, downloadCsv } from '../lib/utils'
import { calculateWeeklyTotal, formatScore, selectRuleVersion } from '../domain/engine'
import type { WeeklyRecord, IndicatorId, RuleVersion } from '../domain/types'
import {
  Button,
  Card,
  PageHeading,
  MonthPicker,
  Modal,
  Confirm,
  Field,
  Empty,
  useAction,
  SectionHeader,
} from '../components/ui'

const statusLabels = { completed: '已完成', pending: '待测评', absent: '请假', cancelled: '未授课' }
export function WeeklyRow({
  record,
  compact = false,
  onEdit,
  onDelete,
}: {
  record: WeeklyRecord
  compact?: boolean
  onEdit?: () => void
  onDelete?: () => void
}) {
  const store = useStore()
  const rule = store.data.rules.find((r) => r.id === record.rule_version_id)
  const total = rule ? calculateWeeklyTotal(record, rule.config) : null
  return (
    <div className={compact ? 'record-row compact' : 'record-row'}>
      <div className="record-date">
        <strong>{record.lesson_date.slice(8)}</strong>
        <small>{Number(record.lesson_date.slice(5, 7))}月</small>
      </div>
      <div className="record-body">
        <div className="record-title">
          <strong>{record.topics.join(' · ') || '未填写知识点'}</strong>
          <span className={`status-tag status-${record.status}`}>
            {statusLabels[record.status]}
          </span>
        </div>
        <p>
          {compact
            ? record.feedback || record.next_focus || '暂无课堂反馈'
            : record.weaknesses || '本次暂无薄弱点备注'}
        </p>
        {!compact && (
          <div className="record-detail">
            {rule?.config.indicators.map((i) => (
              <span key={i.id}>
                {i.name} <b>{record.scores?.[i.id] ?? '—'}</b>/{i.max}
              </span>
            ))}
            <span>规则 v{rule?.version ?? '—'}</span>
          </div>
        )}
      </div>
      <div className="record-score">
        <strong>{formatScore(total)}</strong>
        <small>{total !== null ? '/ 10' : '不计分'}</small>
      </div>
      {!compact && (
        <div className="record-actions">
          <button
            className="icon-button"
            aria-label={`编辑 ${record.lesson_date} 记录`}
            onClick={onEdit}
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button delete-icon"
            aria-label={`删除 ${record.lesson_date} 记录`}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
export function WeeklyPage() {
  const [month, setMonth] = useState(currentMonth())
  const d = useStudentData(month)
  const [params, setParams] = useSearchParams()
  const [editor, setEditor] = useState<WeeklyRecord | 'new' | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { run, busy } = useAction()
  const rows = d.weekly.filter((r) => r.lesson_date.startsWith(month)).reverse()
  useEffect(() => {
    if (params.get('new') === '1') {
      setEditor('new')
      setParams({}, { replace: true })
    }
  }, [params])
  function exportRecords() {
    downloadCsv(`学习周记录-${month}.csv`, [
      [
        '日期',
        '状态',
        '知识点',
        '规则版本',
        '错题理解',
        '知识巩固',
        '知识迁移',
        '课堂表现',
        '总分',
        '薄弱点',
        '课堂反馈',
        '下周重点',
      ],
      ...rows.map((r) => [
        r.lesson_date,
        statusLabels[r.status],
        r.topics.join('；'),
        d.store.data.rules.find((v) => v.id === r.rule_version_id)?.version,
        ...(['understanding', 'consolidation', 'transfer', 'engagement'] as IndicatorId[]).map(
          (i) => r.scores?.[i],
        ),
        calculateWeeklyTotal(
          r,
          d.store.data.rules.find((v) => v.id === r.rule_version_id)?.config ?? d.config,
        ),
        r.weaknesses,
        r.feedback,
        r.next_focus,
      ]),
    ])
  }
  return (
    <>
      <PageHeading
        eyebrow="WEEK BY WEEK"
        title="每周学习记录"
        description="用两分钟记录理解、巩固、迁移与课堂投入。"
        action={
          <>
            <Button variant="secondary" onClick={exportRecords} disabled={!rows.length}>
              <Download size={16} /> 导出记录
            </Button>
            <Button onClick={() => setEditor('new')} disabled={!d.store.studentId}>
              <Plus size={17} /> 新增周记录
            </Button>
          </>
        }
      />
      <div className="filter-bar">
        <MonthPicker value={month} onChange={setMonth} />
        <span>
          {rows.length} 条记录 · {rows.filter((r) => r.status === 'completed').length} 次有效授课
        </span>
      </div>
      <Card>
        <SectionHeader
          title="本月授课记录"
          description="请假、未授课和待测评记录不计入月度平均分"
        />
        {rows.length ? (
          rows.map((r) => (
            <WeeklyRow
              key={r.id}
              record={r}
              onEdit={() => setEditor(r)}
              onDelete={() => setDeleteId(r.id)}
            />
          ))
        ) : (
          <Empty
            title="这个月还没有记录"
            description={
              d.store.studentId ? '记录一节课，开始看见成长。' : '请先在“数据与日志”中添加学生。'
            }
            action={
              d.store.studentId && (
                <Button onClick={() => setEditor('new')}>
                  <Plus size={16} /> 新增周记录
                </Button>
              )
            }
          />
        )}
      </Card>
      <div className="info-banner">
        <ClipboardList size={18} />
        <span>
          编辑历史周记录后，已结算月份保持原快照。需要更新评级时，请在月度页面选择“重新结算”并填写原因。
        </span>
      </div>
      {editor && (
        <WeeklyEditor
          record={editor === 'new' ? undefined : editor}
          month={month}
          close={() => setEditor(null)}
        />
      )}
      <Confirm
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="删除这条学习记录？"
        description="删除后不能直接恢复。已结算的月度快照会保留，操作会写入日志。"
        busy={busy}
        onConfirm={() =>
          run(
            () => d.store.deleteWeekly(deleteId!),
            '记录已删除',
            () => setDeleteId(null),
          )
        }
      />
    </>
  )
}
function WeeklyEditor({
  record,
  month,
  close,
}: {
  record?: WeeklyRecord
  month: string
  close: () => void
}) {
  const store = useStore()
  const [date, setDate] = useState(
    record?.lesson_date ?? (month === currentMonth() ? today() : `${month}-01`),
  )
  const [status, setStatus] = useState<WeeklyRecord['status']>(record?.status ?? 'pending')
  const [topics, setTopics] = useState(record?.topics.join('，') ?? '')
  const [checks, setChecks] = useState<Partial<Record<IndicatorId, number[]>>>(
    record?.criteria_checks ?? {},
  )
  const [scores, setScores] = useState<Record<IndicatorId, number>>(
    record?.scores ?? { understanding: 0, consolidation: 0, transfer: 0, engagement: 0 },
  )
  const [consolidation, setConsolidation] = useState(
    record?.consolidation ?? Array.from({ length: 3 }, () => ({ topic: '', mastered: false })),
  )
  const [weaknesses, setWeaknesses] = useState(record?.weaknesses ?? '')
  const [feedback, setFeedback] = useState(record?.feedback ?? '')
  const [nextFocus, setNextFocus] = useState(record?.next_focus ?? '')
  const [confirm, setConfirm] = useState(false)
  const { run, busy, notify } = useAction()
  let rule: RuleVersion | null | undefined
  try {
    rule = record
      ? store.data.rules.find((r) => r.id === record.rule_version_id)
      : selectRuleVersion(store.data.rules, date)
  } catch {
    rule = null
  }
  const draft: WeeklyRecord = {
    id: record?.id ?? newId(),
    student_id: record?.student_id ?? store.studentId,
    rule_version_id: rule?.id ?? '',
    lesson_date: date,
    status,
    scores: status === 'completed' ? scores : null,
    criteria_checks: checks,
    topics: topics
      .split(/[，,；;]/)
      .map((t) => t.trim())
      .filter(Boolean),
    consolidation,
    weaknesses,
    feedback,
    next_focus: nextFocus,
    created_at: record?.created_at ?? new Date().toISOString(),
  }
  function choose(id: IndicatorId, index: number, value: number) {
    if (!rule) return
    const ind = rule.config.indicators.find((i) => i.id === id)!
    const values = Array.from({ length: ind.criteria.length }, (_, i) =>
      i === index ? value : (checks[id]?.[i] ?? 0),
    )
    setChecks({ ...checks, [id]: values })
    setScores({
      ...scores,
      [id]: Number(
        ((values.reduce((s, v) => s + v, 0) / ind.criteria.length) * ind.max).toFixed(8),
      ),
    })
    if (id === 'consolidation')
      setConsolidation(
        consolidation.map((q, i) => (i === index ? { ...q, mastered: value === 1 } : q)),
      )
  }
  async function save() {
    if (!rule) {
      notify({ type: 'error', message: '该日期没有适用的规则版本，请调整日期或新增生效规则。' })
      return
    }
    if (status === 'completed' && calculateWeeklyTotal(draft, rule.config) === null) {
      notify({ type: 'error', message: '请检查四项分数是否在对应上限范围内。' })
      return
    }
    await run(() => store.saveWeekly(draft), '周记录已保存', close)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (record) {
      setConfirm(true)
    } else void save()
  }
  return (
    <>
      <Modal
        open
        onOpenChange={(v) => !v && close()}
        title={record ? '编辑学习记录' : '新增周记录'}
        description="勾选评价要点即可计分；也可以直接调整分值。"
        wide
      >
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="授课日期">
              <input
                type="date"
                value={date}
                max={status === 'completed' ? today() : undefined}
                required
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="记录状态">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WeeklyRecord['status'])}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="本周学习知识点" hint="多个知识点用逗号分隔">
            <input
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              placeholder="例如：函数单调性，集合运算"
              maxLength={500}
            />
          </Field>
          {rule ? (
            <div className="rule-info">
              评分依据：规则 v{rule.version} · 生效 {rule.effective_from}
              {record && ' · 历史记录保留原版本'}
            </div>
          ) : (
            <p role="alert" className="form-error">
              当前日期没有适用规则，请先配置规则版本。
            </p>
          )}
          {status === 'completed' && rule ? (
            <>
              <div className="scoring-grid">
                {rule.config.indicators.map((ind) => (
                  <section className="scoring-card" key={ind.id}>
                    <div className="scoring-title">
                      <h3>{ind.name}</h3>
                      <label>
                        <input
                          aria-label={`${ind.name}分数`}
                          type="number"
                          min={0}
                          max={ind.max}
                          step="any"
                          required
                          value={scores[ind.id]}
                          onChange={(e) =>
                            setScores({ ...scores, [ind.id]: Number(e.target.value) })
                          }
                        />
                        <span>/ {ind.max}</span>
                      </label>
                    </div>
                    <p>{ind.description}</p>
                    <div className="criteria-list">
                      {ind.criteria.map((criterion, i) => (
                        <div key={i} className="criterion">
                          {ind.id === 'engagement' ? (
                            <>
                              <span>{criterion}</span>
                              <div className="score-buttons">
                                {[0, 0.5, 1].map((v) => (
                                  <button
                                    type="button"
                                    key={v}
                                    aria-pressed={(checks[ind.id]?.[i] ?? 0) === v}
                                    onClick={() => choose(ind.id, i, v)}
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <label>
                              <input
                                type="checkbox"
                                checked={checks[ind.id]?.[i] === 1}
                                onChange={(e) => choose(ind.id, i, e.target.checked ? 1 : 0)}
                              />
                              <span>{criterion}</span>
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                    {ind.id === 'consolidation' && (
                      <div className="knowledge-inputs">
                        {consolidation.map((q, i) => (
                          <label key={i}>
                            <span>第 {i + 1} 题</span>
                            <input
                              aria-label={`第${i + 1}题考查知识点`}
                              placeholder="考查知识点"
                              value={q.topic}
                              onChange={(e) =>
                                setConsolidation(
                                  consolidation.map((x, j) =>
                                    i === j ? { ...x, topic: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                            <select
                              aria-label={`第${i + 1}题掌握状态`}
                              value={q.mastered ? 'yes' : 'no'}
                              onChange={(e) => {
                                const v = e.target.value === 'yes'
                                setConsolidation(
                                  consolidation.map((x, j) =>
                                    i === j ? { ...x, mastered: v } : x,
                                  ),
                                )
                                choose(ind.id, i, v ? 1 : 0)
                              }}
                            >
                              <option value="no">未掌握</option>
                              <option value="yes">已掌握</option>
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
              <div className="score-total">
                <CheckCircle2 size={20} />
                <span>本周基础积分</span>
                <strong>
                  {formatScore(calculateWeeklyTotal(draft, rule.config))}
                  <small> / 10 分</small>
                </strong>
              </div>
            </>
          ) : (
            <div className="info-banner">本条记录不计分，不计入有效授课次数和月度平均分。</div>
          )}
          <div className="form-grid">
            <Field label="重点错题或薄弱知识">
              <textarea
                rows={2}
                maxLength={2000}
                value={weaknesses}
                onChange={(e) => setWeaknesses(e.target.value)}
                placeholder="例如：单调区间端点判断"
              />
            </Field>
            <Field label="课堂简短反馈">
              <textarea
                rows={2}
                maxLength={2000}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="例如：能独立讲清解题思路"
              />
            </Field>
          </div>
          <Field label="下周巩固重点">
            <input
              value={nextFocus}
              maxLength={2000}
              onChange={(e) => setNextFocus(e.target.value)}
              placeholder="下次复测重点"
            />
          </Field>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" disabled={busy} onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={busy || !rule || !store.studentId}>
              {busy ? '保存中…' : '保存记录'}
            </Button>
          </div>
        </form>
      </Modal>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="确认修改历史记录？"
        description="修改会记入操作日志。已结算月份保持原快照，如需同步变化请明确重新结算。"
        busy={busy}
        onConfirm={() => void save()}
      />
    </>
  )
}
