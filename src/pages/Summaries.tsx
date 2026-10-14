import { useState, type FormEvent } from 'react'
import {
  Download,
  CheckCircle2,
  RefreshCw,
  Globe,
  LockKeyhole,
  History,
  Award,
  TrendingUp,
  CalendarCheck,
  Pencil,
  Flame,
  Gift,
} from 'lucide-react'
import { useStudentData } from '../lib/derived'
import {
  currentMonth,
  monthLabel,
  newId,
  downloadCsv,
  today,
  rewardSummary,
  shanghaiDate,
} from '../lib/utils'
import { calculateWeeklyTotal, calculateStreak, formatScore } from '../domain/engine'
import { supabase } from '../lib/supabase'
import type { Rating, SemesterReview, MonthlySnapshot } from '../domain/types'
import {
  PageHeading,
  Card,
  Button,
  MonthPicker,
  RatingBadge,
  Metric,
  SectionHeader,
  ScoreChart,
  Empty,
  Modal,
  Confirm,
  Field,
  useAction,
} from '../components/ui'

export function SummariesPage() {
  const [month, setMonth] = useState(currentMonth())
  const d = useStudentData(month)
  const [tab, setTab] = useState<'month' | 'semester'>('month')
  const [editor, setEditor] = useState(false)
  const [publish, setPublish] = useState<boolean | null>(null)
  const [history, setHistory] = useState<
    { revision: number; snapshot: MonthlySnapshot; created_at?: string }[] | null
  >(null)
  const { run, busy } = useAction()
  const publicRow = d.store.data.publicGrowth.find((p) => p.id === d.settlement?.id)
  const snapshot = d.snapshot
  const cfg = snapshot.ruleConfig
  const rows = (d.settlement ? (snapshot.weeklyInputs ?? d.weekly) : d.weekly)
    .filter((r) => r.lesson_date.startsWith(month))
    .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date))
  async function loadHistory() {
    await run(async () => {
      if (d.store.mode === 'demo') {
        const entries = d.store.data.audit
          .filter((a) => a.entity_id === d.settlement?.id && a.detail.previousSnapshot)
          .map((a) => ({
            revision: Number(a.detail.previousRevision),
            snapshot: a.detail.previousSnapshot as MonthlySnapshot,
            created_at: a.created_at,
          }))
        setHistory(entries)
        return
      }
      const { data, error } = await supabase!
        .from('settlement_revisions')
        .select('*')
        .eq('settlement_id', d.settlement!.id)
        .order('revision', { ascending: false })
      if (error) throw error
      setHistory(data ?? [])
    }, '结算历史已加载')
  }
  function exportMonth() {
    downloadCsv(`月度结算-${month}.csv`, [
      [
        '月份',
        '状态',
        '结算版本',
        '有效授课',
        '月度平均',
        '考试加分',
        '综合分',
        '评级',
        '调整原因',
        '本月进步',
        '待改善内容',
      ],
      [
        month,
        d.settlement ? '已结算' : '实时预测',
        d.settlement?.revision ?? '',
        snapshot.validCount,
        snapshot.average,
        snapshot.examBonus,
        snapshot.total,
        snapshot.rating,
        snapshot.overrideReason,
        snapshot.strengths,
        snapshot.improvements,
      ],
    ])
  }
  return (
    <>
      <PageHeading
        eyebrow="A BIGGER PICTURE"
        title="月度与学期总结"
        description="以自然月为单位评估，把短期反馈连成长期成长。"
        action={
          <Button variant="secondary" onClick={exportMonth}>
            <Download size={16} /> 导出月度结果
          </Button>
        }
      />
      <div className="tabs">
        <button className={tab === 'month' ? 'active' : ''} onClick={() => setTab('month')}>
          月度结算
        </button>
        <button className={tab === 'semester' ? 'active' : ''} onClick={() => setTab('semester')}>
          学期回顾
        </button>
      </div>
      {tab === 'month' ? (
        <>
          <div className="filter-bar">
            <MonthPicker value={month} onChange={setMonth} />
            <span>
              {d.settlement ? `已结算 · 快照 v${d.settlement.revision}` : '实时预测 · 尚未结算'}
            </span>
          </div>
          <div className="monthly-hero">
            <div>
              <span className="eyebrow">
                {monthLabel(month)} · {d.settlement ? '已保存结果' : '预计结果'}
              </span>
              <h2>{d.settlement ? '一段成长，值得认真记录。' : '回顾本月，再向前一步。'}</h2>
              <p>
                {snapshot.validCount} 次有效授课 · 评级规则 v
                {d.store.data.rules.find((v) => v.id === d.settlement?.rule_version_id)?.version ??
                  d.version?.version ??
                  '—'}
              </p>
            </div>
            <div>
              <RatingBadge rating={snapshot.rating} />
              {snapshot.rating === 'pending' && (
                <small>默认至少 {cfg.month.minRecords} 次有效记录后评级</small>
              )}
            </div>
          </div>
          <div className="metric-grid three">
            <Metric
              label="月度平均分"
              value={formatScore(snapshot.average)}
              unit="/ 10"
              icon={<TrendingUp size={19} />}
              foot="基础分保留完整精度计算"
            />
            <Metric
              label="考试额外加分"
              value={`+${formatScore(snapshot.examBonus)}`}
              unit={`/ ${cfg.exam.cap}`}
              icon={<Award size={19} />}
              tone="gold"
              foot="单独计算，不计入每周积分"
            />
            <Metric
              label="月度综合分"
              value={formatScore(snapshot.total)}
              unit={`/ ${10 + cfg.exam.cap}`}
              icon={<CheckCircle2 size={19} />}
              tone="teal"
              foot="月度平均分 + 考试额外加分"
            />
          </div>
          <div className="dashboard-main-grid">
            <Card>
              <SectionHeader
                title="本月每周积分"
                description={
                  d.settlement ? '下图使用结算时保存的周记录快照' : '仅计入完成测评的有效记录'
                }
              />
              <ScoreChart
                points={rows.map((r) => ({
                  name: r.lesson_date.slice(5),
                  score: calculateWeeklyTotal(
                    r,
                    d.store.data.rules.find((v) => v.id === r.rule_version_id)?.config ?? d.config,
                  ),
                }))}
              />
            </Card>
            <Card>
              <SectionHeader title="结算与发布" description="公开首页只展示匿名月度结果" />
              <div className="settlement-detail">
                <p>
                  <span>记录状态</span>
                  <b>{d.settlement ? '已保存结算快照' : '尚未结算'}</b>
                </p>
                <p>
                  <span>公开展示</span>
                  <b>{publicRow?.published ? '已发布匿名结果' : '仅管理员可见'}</b>
                </p>
                {d.settlement && (
                  <p>
                    <span>结算时间</span>
                    <b>
                      {new Date(d.settlement.finalized_at).toLocaleDateString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                      })}
                    </b>
                  </p>
                )}
              </div>
              {snapshot.overrideReason && (
                <div className="info-banner">人工调整原因：{snapshot.overrideReason}</div>
              )}
              <div className="vertical-actions">
                <Button
                  disabled={!d.store.studentId || !d.version || month > currentMonth()}
                  onClick={() => setEditor(true)}
                >
                  {d.settlement ? <RefreshCw size={16} /> : <CheckCircle2 size={16} />}{' '}
                  {d.settlement ? '重新结算' : '确认月度结算'}
                </Button>
                {d.settlement && (
                  <>
                    <Button variant="secondary" onClick={() => setPublish(!publicRow?.published)}>
                      {publicRow?.published ? <LockKeyhole size={16} /> : <Globe size={16} />}{' '}
                      {publicRow?.published ? '撤下公开结果' : '发布匿名结果'}
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => void loadHistory()}>
                      <History size={16} /> 查看结算历史
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </div>
          <div className="dashboard-bottom-grid">
            <Card>
              <SectionHeader title="本月进步" />
              <p className="summary-text">
                {snapshot.strengths || '结算时填写：有哪些知识理解更清晰？哪些题型可以独立完成？'}
              </p>
            </Card>
            <Card>
              <SectionHeader title="下一步改善" />
              <p className="summary-text">
                {snapshot.improvements || '结算时填写：下个月重点巩固哪些知识点和解题习惯？'}
              </p>
            </Card>
          </div>
          <Card>
            <SectionHeader title="月度评级历史" description="只有完成结算的月份参与连续优秀计算" />
            {d.settlements.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th>有效次数</th>
                      <th>平均分</th>
                      <th>考试加分</th>
                      <th>综合分</th>
                      <th>评级</th>
                      <th>快照</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.settlements].reverse().map((s) => (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="text-link"
                            onClick={() => setMonth(s.month.slice(0, 7))}
                          >
                            {s.month.slice(0, 7)}
                          </button>
                        </td>
                        <td>{s.snapshot.validCount}</td>
                        <td>{formatScore(s.snapshot.average)}</td>
                        <td>+{formatScore(s.snapshot.examBonus)}</td>
                        <td>
                          <b>{formatScore(s.snapshot.total)}</b>
                        </td>
                        <td>
                          <RatingBadge rating={s.snapshot.rating} />
                        </td>
                        <td>v{s.revision}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="还没有月度结算"
                description="完善当月记录后，明确确认结算，即可保存评级与奖励。"
              />
            )}
          </Card>
        </>
      ) : (
        <SemesterPanel />
      )}
      {editor && <SettlementEditor month={month} close={() => setEditor(false)} />}
      <Confirm
        open={publish !== null}
        onOpenChange={(v) => !v && setPublish(null)}
        title={publish ? '发布匿名月度结果？' : '撤下公开月度结果？'}
        description={
          publish
            ? '将公开月份、平均分、考试加分、评级和连续优秀月数。学生姓名、原始周记录、考试成绩和个人反馈不会发布。'
            : '公开首页将不再读取此结果，私有结算及奖励记录保留。'
        }
        busy={busy}
        onConfirm={() =>
          run(
            () => d.store.publishMonth(d.settlement!.id, publish!),
            '公开范围已更新',
            () => setPublish(null),
          )
        }
      />
      <Modal
        open={history !== null}
        onOpenChange={(v) => !v && setHistory(null)}
        title="历史结算快照"
        description="重新结算前的结果保留在这里；当前结果见月度页面。"
      >
        {history?.length ? (
          <div className="history-list">
            {history.map((h) => (
              <div key={h.revision}>
                <strong>快照 v{h.revision}</strong>
                <RatingBadge rating={h.snapshot.rating} />
                <p>
                  平均 {formatScore(h.snapshot.average)} + 考试 {formatScore(h.snapshot.examBonus)}{' '}
                  = {formatScore(h.snapshot.total)} · {h.snapshot.validCount} 次有效记录
                </p>
                <small>{h.snapshot.overrideReason || '按当时规则自动计算'}</small>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="尚无旧版本" description="明确重新结算后，之前的快照会保留。" />
        )}
      </Modal>
    </>
  )
}
function SettlementEditor({ month, close }: { month: string; close: () => void }) {
  const d = useStudentData(month)
  const [rating, setRating] = useState<Rating | null>(null)
  const [reason, setReason] = useState('')
  const [strengths, setStrengths] = useState(d.snapshot.strengths)
  const [improvements, setImprovements] = useState(d.snapshot.improvements)
  const [confirm, setConfirm] = useState(false)
  const { run, busy } = useAction()
  function submit(e: FormEvent) {
    e.preventDefault()
    setConfirm(true)
  }
  return (
    <>
      <Modal
        open
        onOpenChange={(v) => !v && close()}
        title={d.settlement ? '重新结算本月' : '确认月度结算'}
        description="结算由数据库重新计算并保存快照，规则变更不会自动影响结果。"
      >
        <form onSubmit={submit}>
          <div className="calculation-preview">
            <span>当前有效记录 {d.forecast.validCount} 次</span>
            <strong>
              {formatScore(d.forecast.average)} + {formatScore(d.forecast.examBonus)} ={' '}
              {formatScore(d.forecast.total)}
            </strong>
            <RatingBadge rating={d.forecast.rating} />
          </div>
          <Field label="评级调整">
            <select
              value={rating ?? ''}
              onChange={(e) => setRating(e.target.value ? (e.target.value as Rating) : null)}
            >
              <option value="">按规则计算</option>
              <option value="excellent">人工调整为优秀</option>
              <option value="good">人工调整为良好</option>
              <option value="improve">人工调整为待提升</option>
              <option value="pending">保持待评估 / 暂停累计</option>
            </select>
          </Field>
          <Field
            label={
              d.settlement ? '重新结算原因（必填）' : rating ? '评级调整原因（必填）' : '结算备注'
            }
          >
            <textarea
              rows={2}
              value={reason}
              maxLength={2000}
              required={!!d.settlement || !!rating}
              onChange={(e) => setReason(e.target.value)}
              placeholder="说明特殊情况，便于后续追溯"
            />
          </Field>
          <Field label="本月进步">
            <textarea
              rows={2}
              value={strengths}
              maxLength={3000}
              onChange={(e) => setStrengths(e.target.value)}
            />
          </Field>
          <Field label="待改善内容">
            <textarea
              rows={2}
              value={improvements}
              maxLength={3000}
              onChange={(e) => setImprovements(e.target.value)}
            />
          </Field>
          {month === currentMonth() && (
            <div className="info-banner">
              本月尚未结束。提前结算后新增记录不会自动更新快照，需要明确重新结算。
            </div>
          )}
          {d.settlement && (
            <div className="info-banner">
              旧快照保留；已获得奖励不会被自动取消，历史奖励不重复发放。公开结果需重新主动发布。
            </div>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={close}>
              取消
            </Button>
            <Button type="submit">继续确认</Button>
          </div>
        </form>
      </Modal>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title={d.settlement ? '确认重新结算？' : '保存本月结算快照？'}
        description="这项操作会写入日志。结果和所用规则会永久保存，奖励按结算结果发放。"
        busy={busy}
        onConfirm={() =>
          run(
            () =>
              d.store.settleMonth(month, rating, reason, strengths, improvements, !!d.settlement),
            '月度结算已保存',
            close,
          )
        }
      />
    </>
  )
}
function SemesterPanel() {
  const d = useStudentData(currentMonth())
  const [label, setLabel] = useState(`${today().slice(0, 4)} 学年第一学期`)
  const [start, setStart] = useState(`${today().slice(0, 4)}-09-01`)
  const [end, setEnd] = useState(`${Number(today().slice(0, 4)) + 1}-01-31`)
  const [editing, setEditing] = useState<SemesterReview | 'new' | null>(null)
  const selected = d.store.data.semesters.filter((s) => s.student_id === d.store.studentId)
  const settlementRows = d.settlements.filter(
    (s) => s.month >= start.slice(0, 7) && s.month.slice(0, 7) <= end.slice(0, 7),
  )
  const streak = calculateStreak(settlementRows)
  const weeks = d.weekly.filter((w) => w.lesson_date >= start && w.lesson_date <= end)
  const exams = d.exams.filter((e) => e.exam_date >= start && e.exam_date <= end)
  const rewards = d.rewards.filter(
    (r) => shanghaiDate(r.created_at) >= start && shanghaiDate(r.created_at) <= end,
  )
  const weak = [...new Set(weeks.map((w) => w.weaknesses).filter(Boolean))]
  const topics = [...new Set(weeks.flatMap((w) => w.topics))]
  return (
    <>
      <Card className="semester-filters">
        <Field label="学期名称">
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="开始日期">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="结束日期">
          <input type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Button
          onClick={() => setEditing('new')}
          disabled={!d.store.studentId || !label.trim() || end < start}
        >
          <Pencil size={16} /> 填写学期评价
        </Button>
      </Card>
      <div className="metric-grid">
        <Metric
          label="优秀月数"
          value={streak.excellentMonths}
          unit="个月"
          icon={<Award size={19} />}
          foot="学期范围内已结算月份"
        />
        <Metric
          label="最长连续优秀"
          value={streak.longest}
          unit="个月"
          icon={<Flame size={19} />}
          foot="待评估月份暂停累计"
        />
        <Metric
          label="累计获得奖励"
          value={<span className="reward-summary-value">{rewardSummary(rewards, 'earned')}</span>}
          icon={<Gift size={19} />}
          foot="按发放时间统计，单位见奖励管理"
        />
        <Metric
          label="已使用奖励"
          value={<span className="reward-summary-value">{rewardSummary(rewards, 'used')}</span>}
          icon={<CalendarCheck size={19} />}
          foot="按使用时间统计"
        />
      </div>
      <div className="dashboard-bottom-grid">
        <Card>
          <SectionHeader title="学期周积分趋势" />
          <ScoreChart
            points={weeks.map((w) => ({
              name: w.lesson_date.slice(5),
              score: calculateWeeklyTotal(
                w,
                d.store.data.rules.find((v) => v.id === w.rule_version_id)?.config ?? d.config,
              ),
            }))}
          />
        </Card>
        <Card>
          <SectionHeader title="考试得分率变化" />
          <ScoreChart
            max={100}
            label="得分率（%）"
            points={exams.map((e) => ({
              name: e.exam_date.slice(5),
              score: (e.score / e.max_score) * 100,
            }))}
          />
        </Card>
      </div>
      <Card>
        <SectionHeader title="学期月度评级" />
        {settlementRows.length ? (
          <div className="public-history">
            {settlementRows.map((s) => (
              <div key={s.id}>
                <span>{s.month.slice(0, 7)}</span>
                <RatingBadge rating={s.snapshot.rating} />
                <small>{formatScore(s.snapshot.total)} 分</small>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="此学期暂无已结算月份"
            description="按自然月保存结算后，评级将出现在这里。"
          />
        )}
      </Card>
      <div className="dashboard-bottom-grid">
        <Card>
          <SectionHeader title="已学习与巩固的知识" />
          <div className="tags">
            {topics.length ? topics.map((t) => <span key={t}>{t}</span>) : <p>暂无知识点记录</p>}
          </div>
        </Card>
        <Card>
          <SectionHeader title="重点薄弱知识" />
          <ul className="plain-list">
            {weak.length ? weak.map((w) => <li key={w}>{w}</li>) : <li>暂无薄弱点记录</li>}
          </ul>
        </Card>
      </div>
      <Card>
        <SectionHeader
          title="学期评价与大奖"
          description={d.config.semester.description || '由管理员核实后填写，不自动判定'}
        />
        {selected.length ? (
          selected.map((s) => (
            <div className="semester-review" key={s.id}>
              <div>
                <h3>{s.label}</h3>
                <small>
                  {s.start_date} 至 {s.end_date}
                </small>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setLabel(s.label)
                  setStart(s.start_date)
                  setEnd(s.end_date)
                  setEditing(s)
                }}
              >
                <Pencil size={15} /> 编辑
              </Button>
              <p>{s.review || '未填写评价'}</p>
              <span className="badge rating-excellent">学期大奖：{s.award || '尚未设置'}</span>
            </div>
          ))
        ) : (
          <Empty title="写下更长远的反馈" description="记录主要进步、薄弱点和下一学期的目标。" />
        )}
      </Card>
      {editing && (
        <SemesterEditor
          record={editing === 'new' ? undefined : editing}
          label={label}
          start={start}
          end={end}
          close={() => setEditing(null)}
        />
      )}
    </>
  )
}
function SemesterEditor({
  record,
  label,
  start,
  end,
  close,
}: {
  record?: SemesterReview
  label: string
  start: string
  end: string
  close: () => void
}) {
  const d = useStudentData(currentMonth())
  const [review, setReview] = useState(record?.review ?? '')
  const [award, setAward] = useState(record?.award ?? d.config.semester.award)
  const { run, busy } = useAction()
  return (
    <Modal
      open
      onOpenChange={(v) => !v && close()}
      title="学期评价"
      description={`${label} · ${start} 至 ${end}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(
            () =>
              d.store.saveSemester({
                id: record?.id ?? newId(),
                student_id: d.store.studentId,
                label,
                start_date: start,
                end_date: end,
                review,
                award,
                created_at: record?.created_at ?? new Date().toISOString(),
              }),
            '学期评价已保存',
            close,
          )
        }}
      >
        <Field label="学期评价">
          <textarea
            rows={5}
            value={review}
            maxLength={5000}
            onChange={(e) => setReview(e.target.value)}
            placeholder="知识理解、独立解题、学习习惯与下一阶段目标"
          />
        </Field>
        <Field label="学期大奖（可留空）">
          <input value={award} maxLength={2000} onChange={(e) => setAward(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <Button variant="secondary" type="button" onClick={close}>
            取消
          </Button>
          <Button type="submit" disabled={busy}>
            保存评价
          </Button>
        </div>
      </form>
    </Modal>
  )
}
