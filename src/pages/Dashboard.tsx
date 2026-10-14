import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  ArrowUpRight,
  ClipboardCheck,
  TrendingUp,
  Award,
  Flame,
  ChevronRight,
  BookOpenCheck,
  Layers,
  Brain,
  Sprout,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react'
import { useStudentData } from '../lib/derived'
import { currentMonth, monthLabel, rewardSummary } from '../lib/utils'
import {
  Card,
  PageHeading,
  MonthPicker,
  Metric,
  RatingBadge,
  SectionHeader,
  ScoreChart,
  Empty,
} from '../components/ui'
import { calculateWeeklyTotal, formatScore, rewardForStreak } from '../domain/engine'
import { WeeklyRow } from './Weekly'

export function Dashboard() {
  const [month, setMonth] = useState(currentMonth())
  const d = useStudentData(month)
  const rows = d.weekly.filter((r) => r.lesson_date.startsWith(month))
  const completed = rows.filter((r) => r.status === 'completed')
  const latest = completed.at(-1)
  const rule = d.store.data.rules.find((v) => v.id === latest?.rule_version_id)
  const icons = [BookOpenCheck, Layers, Brain, Sprout]
  const totalReward = rewardSummary(d.rewards, 'earned')
  return (
    <>
      <PageHeading
        eyebrow="YOUR LEARNING JOURNEY"
        title="学习概览"
        description={`${monthLabel(month)}，把每一次小进步，积累成更大的成长。`}
        action={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Link to="/admin/weekly?new=1" className="button button-primary">
              <Plus size={17} /> 新增周记录
            </Link>
          </>
        }
      />
      <section className="welcome-card">
        <div>
          <span className="welcome-kicker">
            <span className="green-dot" /> 成长进行时
          </span>
          <h2>学会一道题，更理解一类题。</h2>
          <p>关注理解、独立思考和持续投入。每周向前一步，就很好。</p>
          <Link to="/admin/summaries">
            查看我的成长轨迹 <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span className="orbit orbit-1" />
          <span className="orbit orbit-2" />
          <span className="orbit orbit-3" />
          <span className="welcome-symbol">ƒ(x)</span>
          <div className="art-label">
            <TrendingUp size={18} /> GROW A LITTLE, EVERY WEEK
          </div>
        </div>
      </section>
      <div className="metric-grid">
        <Metric
          label="最近一次周积分"
          value={latest ? formatScore(calculateWeeklyTotal(latest, rule?.config ?? d.config)) : '—'}
          unit="/ 10"
          icon={<ClipboardCheck size={19} />}
          foot={
            latest ? (
              <>
                <span className="green-dot" />
                {latest.lesson_date.slice(5)} · 已完成测评
              </>
            ) : (
              '暂无有效周记录'
            )
          }
        />
        <Metric
          label="本月平均分"
          value={formatScore(d.snapshot.average)}
          unit="/ 10"
          icon={<TrendingUp size={19} />}
          tone="teal"
          foot={`${d.snapshot.validCount} 次有效授课 · 请假不计入平均`}
        />
        <Metric
          label={d.settlement ? '已结算月度评级' : '本月评级预测'}
          value={<RatingBadge rating={d.snapshot.rating} />}
          icon={<Award size={19} />}
          tone="gold"
          foot={
            d.snapshot.rating === 'pending'
              ? `还需 ${Math.max(0, d.config.month.minRecords - d.snapshot.validCount)} 次有效记录`
              : `综合分 ${formatScore(d.snapshot.total)} = 基础 + 奖励`
          }
        />
        <Metric
          label="连续优秀"
          value={d.streak.current}
          unit="个月"
          icon={<Flame size={19} />}
          tone="coral"
          foot={`累计优秀 ${d.streak.excellentMonths} 个月 · 只按结算计算`}
        />
      </div>
      <div className="dashboard-main-grid">
        <Card className="trend-card">
          <SectionHeader
            title="每周积分趋势"
            description="看见积累的力量"
            action={
              <span className="chart-legend">
                <span /> 基础积分 / 10
              </span>
            }
          />
          <ScoreChart
            points={rows.map((r) => ({
              name: `${Number(r.lesson_date.slice(5, 7))}/${Number(r.lesson_date.slice(8))}`,
              score: calculateWeeklyTotal(
                r,
                d.store.data.rules.find((v) => v.id === r.rule_version_id)?.config ?? d.config,
              ),
            }))}
          />
          <div className="chart-bottom">
            <CalendarDays size={15} />
            <span>
              {monthLabel(month)} · {completed.length} 次有效授课
            </span>
            <Link to="/admin/weekly">
              查看全部记录 <ChevronRight size={14} />
            </Link>
          </div>
        </Card>
        <Card className="reward-preview">
          <SectionHeader
            title="连续优秀奖励"
            action={
              <span className="mini-icon">
                <Award size={18} />
              </span>
            }
          />
          <div className="reward-highlight">
            <span>下一阶段奖励</span>
            <strong>
              +{rewardForStreak(d.streak.current + 1, d.config)}
              <small> {d.config.reward.unit}</small>
            </strong>
            <p>{d.config.reward.name || '成长奖励'}</p>
          </div>
          <div className="compact-stages">
            {d.config.reward.stages.map((_, i) => (
              <div key={i} className={d.streak.current > i ? 'achieved' : ''}>
                <span>{d.streak.current > i ? <CheckCircle2 size={17} /> : i + 1}</span>
                <small>{i + 1}个月</small>
              </div>
            ))}
          </div>
          <p className="reward-progress-copy">
            {d.streak.current > 0
              ? `已连续优秀 ${d.streak.current} 个月，继续保持。`
              : '从第一个优秀月开始，慢慢积累。'}
          </p>
          <div className="reward-card-footer">
            <span>
              累计获得 <strong>{totalReward}</strong>
            </span>
            <Link to="/admin/rewards">
              奖励记录 <ArrowUpRight size={14} />
            </Link>
          </div>
        </Card>
      </div>
      <div className="dashboard-bottom-grid">
        <Card>
          <SectionHeader
            title="最近学习记录"
            description="每一次认真，都留下痕迹"
            action={
              <Link className="text-link" to="/admin/weekly">
                全部记录 <ArrowUpRight size={14} />
              </Link>
            }
          />
          {d.weekly.length ? (
            <div className="recent-records">
              {[...d.weekly]
                .reverse()
                .slice(0, 3)
                .map((r) => (
                  <WeeklyRow key={r.id} record={r} compact />
                ))}
            </div>
          ) : (
            <Empty
              title="还没有学习记录"
              description="先在数据管理中添加学生，再记录第一次授课。"
              action={
                <Link to="/admin/settings" className="text-link">
                  添加学生 <ArrowRightIcon />
                </Link>
              }
            />
          )}
        </Card>
        <Card>
          <SectionHeader title="四项核心指标" description="学习质量，比题目数量更重要" />
          <div className="mini-indicators">
            {d.config.indicators.map((ind, i) => {
              const Icon = icons[i]
              return (
                <div key={ind.id}>
                  <span className={`mini-indicator-icon tone-${i}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{ind.name}</strong>
                    <small>{ind.criteria.length} 个评价要点</small>
                  </div>
                  <b>
                    {ind.max}
                    <small> 分</small>
                  </b>
                </div>
              )
            })}
          </div>
          <Link to="/admin/rules" className="card-bottom-link">
            查看评分细则 <ChevronRight size={14} />
          </Link>
        </Card>
      </div>
    </>
  )
}
function ArrowRightIcon() {
  return <ChevronRight size={14} />
}
