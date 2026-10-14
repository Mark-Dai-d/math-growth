import { useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, TrendingUp, GraduationCap, Info, Download } from 'lucide-react'
import { useStudentData } from '../lib/derived'
import { useStore } from '../lib/store'
import { currentMonth, today, newId, downloadCsv } from '../lib/utils'
import { calculateExamImprovement, calculateExamBonus, formatScore } from '../domain/engine'
import type { ExamRecord } from '../domain/types'
import {
  PageHeading,
  Button,
  Card,
  MonthPicker,
  SectionHeader,
  ScoreChart,
  Empty,
  Modal,
  Confirm,
  Field,
  Metric,
  useAction,
} from '../components/ui'

export function ExamsPage() {
  const [month, setMonth] = useState(currentMonth())
  const d = useStudentData(month)
  const [editor, setEditor] = useState<ExamRecord | 'new' | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { run, busy } = useAction()
  const exams = d.exams.filter((e) => e.exam_date.startsWith(month)).reverse()
  const latest = d.exams.at(-1)
  const bonus = calculateExamBonus(d.exams, month, d.config)
  function exportExams() {
    downloadCsv(`考试成绩-${month}.csv`, [
      [
        '名称',
        '日期',
        '原始成绩',
        '满分',
        '得分率%',
        '对比考试',
        '可比性确认',
        '进步百分点',
        '范围',
        '备注',
      ],
      ...exams.map((e) => [
        e.name,
        e.exam_date,
        e.score,
        e.max_score,
        formatScore((e.score / e.max_score) * 100),
        d.exams.find((x) => x.id === e.comparison_id)?.name,
        e.comparable ? '已确认' : '未确认',
        calculateExamImprovement(
          e,
          d.exams.find((x) => x.id === e.comparison_id),
        ),
        e.scope,
        e.notes,
      ]),
    ])
  }
  return (
    <>
      <PageHeading
        eyebrow="PROGRESS BEYOND A SCORE"
        title="考试成绩"
        description="关注得分率的变化，考试进步奖励独立于每周 10 分。"
        action={
          <>
            <Button variant="secondary" onClick={exportExams} disabled={!exams.length}>
              <Download size={16} /> 导出成绩
            </Button>
            <Button onClick={() => setEditor('new')} disabled={!d.store.studentId}>
              <Plus size={17} /> 录入考试
            </Button>
          </>
        }
      />
      <div className="metric-grid three">
        <Metric
          label="最近考试得分率"
          value={latest ? formatScore((latest.score / latest.max_score) * 100) : '—'}
          unit="%"
          icon={<GraduationCap size={19} />}
          foot={latest?.name ?? '暂无考试记录'}
        />
        <Metric
          label="本月考试额外加分"
          value={formatScore(bonus)}
          unit={`/ ${d.config.exam.cap}`}
          icon={<TrendingUp size={19} />}
          tone="teal"
          foot="实时计算 · 每月封顶 · 低于门槛不扣分"
        />
        <Metric
          label="本月考试记录"
          value={exams.length}
          unit="场"
          icon={<Info size={19} />}
          tone="gold"
          foot={`${exams.filter((e) => e.comparable).length} 场已确认可比性`}
        />
      </div>
      <Card>
        <SectionHeader title="考试得分率趋势" description="统一按百分比展示；不同满分也可对比" />
        <ScoreChart
          max={100}
          label="得分率（%）"
          points={d.exams.map((e) => ({
            name: e.exam_date.slice(5),
            score: (e.score / e.max_score) * 100,
          }))}
        />
      </Card>
      <div className="filter-bar">
        <MonthPicker value={month} onChange={setMonth} />
        <span>同场考试只取最高奖励档位，同月加分合计后封顶。</span>
      </div>
      <Card>
        <SectionHeader title="考试记录" />
        {exams.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>考试 / 日期</th>
                  <th>成绩</th>
                  <th>得分率</th>
                  <th>进步幅度</th>
                  <th>可比性</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => {
                  const improvement = calculateExamImprovement(
                    e,
                    d.exams.find((x) => x.id === e.comparison_id),
                  )
                  return (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.name}</strong>
                        <small>{e.exam_date}</small>
                      </td>
                      <td>
                        {e.score} / {e.max_score}
                      </td>
                      <td>
                        <strong>{formatScore((e.score / e.max_score) * 100)}%</strong>
                      </td>
                      <td>
                        {improvement === null
                          ? '—'
                          : `${improvement > 0 ? '+' : ''}${formatScore(improvement)} 个百分点`}
                        <small>
                          {d.exams.find((x) => x.id === e.comparison_id)?.name ?? '无对比考试'}
                        </small>
                      </td>
                      <td>
                        <span
                          className={e.comparable ? 'badge rating-good' : 'badge rating-pending'}
                        >
                          {e.comparable ? '已确认' : '未确认'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            aria-label={`编辑 ${e.name}`}
                            className="icon-button"
                            onClick={() => setEditor(e)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label={`删除 ${e.name}`}
                            className="icon-button delete-icon"
                            onClick={() => setDeleteId(e.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="本月没有考试" description="考试加分为 0；没有考试不代表扣分或处罚。" />
        )}
      </Card>
      <div className="info-banner">
        <Info size={18} />
        <span>
          不同试卷可能存在难度差异。只有管理员确认范围、难度合理可比，并选择更早的对比考试后，才启用进步加分。
        </span>
      </div>
      {editor && (
        <ExamEditor record={editor === 'new' ? undefined : editor} close={() => setEditor(null)} />
      )}
      <Confirm
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="删除这场考试？"
        description="已结算月份保留快照。被其他考试引用为对比考试的记录需要先解除引用。操作会写入日志。"
        busy={busy}
        onConfirm={() =>
          run(
            () => d.store.deleteExam(deleteId!),
            '考试已删除',
            () => setDeleteId(null),
          )
        }
      />
    </>
  )
}
function ExamEditor({ record, close }: { record?: ExamRecord; close: () => void }) {
  const store = useStore()
  const [name, setName] = useState(record?.name ?? '')
  const [date, setDate] = useState(record?.exam_date ?? today())
  const [score, setScore] = useState(record?.score ?? 0)
  const [maxScore, setMaxScore] = useState(record?.max_score ?? 150)
  const [comparison, setComparison] = useState(record?.comparison_id ?? '')
  const [comparable, setComparable] = useState(record?.comparable ?? false)
  const [scope, setScope] = useState(record?.scope ?? '')
  const [notes, setNotes] = useState(record?.notes ?? '')
  const [confirm, setConfirm] = useState(false)
  const { run, busy, notify } = useAction()
  const others = store.data.exams.filter(
    (e) => e.student_id === store.studentId && e.id !== record?.id && e.exam_date < date,
  )
  const draft: ExamRecord = {
    id: record?.id ?? newId(),
    student_id: record?.student_id ?? store.studentId,
    name,
    exam_date: date,
    score,
    max_score: maxScore,
    comparison_id: comparison || null,
    comparable,
    scope,
    notes,
    created_at: record?.created_at ?? new Date().toISOString(),
  }
  const improvement = calculateExamImprovement(
    draft,
    others.find((e) => e.id === comparison),
  )
  async function save() {
    if (!(maxScore > 0) || score < 0 || score > maxScore) {
      notify({ type: 'error', message: '成绩必须在 0 与考试满分之间，满分必须大于 0。' })
      return
    }
    if (comparable && !others.some((e) => e.id === comparison)) {
      notify({ type: 'error', message: '请先选择同一学生更早的对比考试。' })
      return
    }
    await run(() => store.saveExam(draft), '考试成绩已保存', close)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    record ? setConfirm(true) : void save()
  }
  return (
    <>
      <Modal
        open
        onOpenChange={(v) => !v && close()}
        title={record ? '编辑考试成绩' : '录入考试成绩'}
        description="使用得分率差值计算进步，不直接比较原始分数。"
      >
        <form onSubmit={submit}>
          <Field label="考试名称">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：第一次月考"
              required
              maxLength={150}
            />
          </Field>
          <div className="form-grid">
            <Field label="考试日期">
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => {
                  setDate(e.target.value)
                  setComparison('')
                  setComparable(false)
                }}
                required
              />
            </Field>
            <Field label="考试满分">
              <input
                type="number"
                min={1}
                step="any"
                required
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="原始成绩">
            <input
              type="number"
              min={0}
              max={maxScore}
              step="any"
              required
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
            />
          </Field>
          <div className="score-total">
            <span>当前得分率</span>
            <strong>
              {maxScore > 0 ? formatScore((score / maxScore) * 100) : '—'}
              <small>%</small>
            </strong>
          </div>
          <Field label="对比考试">
            <select
              value={comparison}
              onChange={(e) => {
                setComparison(e.target.value)
                if (!e.target.value) setComparable(false)
              }}
            >
              <option value="">无对比考试 / 首次考试</option>
              {others.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.exam_date} · {e.name}（{e.score}/{e.max_score}）
                </option>
              ))}
            </select>
          </Field>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={comparable}
              disabled={!comparison}
              onChange={(e) => setComparable(e.target.checked)}
            />
            <span>我已确认两次考试范围与难度合理可比</span>
          </label>
          {improvement !== null && (
            <div className="info-banner">
              得分率变化：{improvement > 0 ? '+' : ''}
              {formatScore(improvement)} 个百分点。考试加分按目标考试所在月的规则计算。
            </div>
          )}
          <Field label="考试范围">
            <input
              value={scope}
              maxLength={2000}
              onChange={(e) => setScope(e.target.value)}
              placeholder="例如：集合与函数概念"
            />
          </Field>
          <Field label="备注">
            <textarea
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={close} disabled={busy}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存考试'}
            </Button>
          </div>
        </form>
      </Modal>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="确认修改考试成绩？"
        description="修改会写入日志；历史月度结算不自动变化。如需同步，请重新结算。"
        busy={busy}
        onConfirm={() => void save()}
      />
    </>
  )
}
