import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Brain,
  Layers,
  Sprout,
  ShieldCheck,
  Check,
  Sparkles,
  LockKeyhole,
  ChevronRight,
} from 'lucide-react'
import { Brand } from '../components/brand'
import { useStore } from '../lib/store'
import { supabase, configurationError } from '../lib/supabase'
import { errorMessage } from '../lib/utils'
import { Card, Button, ScoreChart, RatingBadge, Field, Loading } from '../components/ui'
import { selectRuleVersion } from '../domain/engine'

const icons = [BookOpenCheck, Layers, Brain, Sprout]
export function PublicPage() {
  const store = useStore()
  const navigate = useNavigate()
  const config =
    store.mode === 'demo'
      ? selectRuleVersion(
          store.data.rules,
          new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
        ).config
      : store.publicRules
  const published = store.data.publicGrowth
    .filter((p) => p.published)
    .sort((a, b) => a.month.localeCompare(b.month))
  const latest = published.at(-1)
  const streak = latest?.streak ?? 0
  function openDemo() {
    store.enterDemo()
    navigate('/admin')
  }
  return (
    <div className="public-page">
      <header className="public-nav">
        <Link to="/" className="brand-link">
          <Brand />
        </Link>
        <nav aria-label="公开导航">
          <a
            href="#mechanism"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('mechanism')?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            学习机制
          </a>
          <a
            href="#growth"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('growth')?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            成长记录
          </a>
          <Link
            to={store.mode === 'admin' ? '/admin' : '/login'}
            className="button button-secondary"
          >
            {store.mode === 'admin' ? '进入工作台' : '管理员登录'} <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      {configurationError && store.mode !== 'demo' && (
        <div className="public-preview-note">默认规则预览 · 尚未连接云端，未展示真实学习记录。</div>
      )}
      {store.mode === 'demo' && (
        <div className="public-demo">
          正在查看匿名演示数据 · 公开展示效果预览{' '}
          <button onClick={store.leaveDemo}>退出演示</button>
        </div>
      )}
      <main>
        <section className="public-hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="green-dot" /> 高一数学 · 长期成长计划
            </div>
            <h1>
              让每一次理解，
              <br />
              都成为<span>进步。</span>
            </h1>
            <p>
              不只看一次成绩，更看见每周的努力。
              <br />
              从读懂错题到独立解题，用小步积累，走向持续成长。
            </p>
            <div className="hero-actions">
              <Button onClick={openDemo}>
                体验演示工作台 <ArrowRight size={17} />
              </Button>
              <a
                className="text-link"
                href="#mechanism"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('mechanism')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                了解激励机制 <ChevronRight size={17} />
              </a>
            </div>
            <div className="hero-benefits">
              <span>
                <Check size={15} /> 每周 2 分钟记录
              </span>
              <span>
                <Check size={15} /> 按月看见成长
              </span>
              <span>
                <ShieldCheck size={15} /> 私密数据保护
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="math-grid" />
            <span className="math-symbol symbol-1">ƒ(x)</span>
            <span className="math-symbol symbol-2">Δ</span>
            <div className="growth-stair">
              <div className="stair-step step-one">
                <span>理解</span>
                <BookOpenCheck size={25} />
              </div>
              <div className="stair-step step-two">
                <span>巩固</span>
                <Layers size={25} />
              </div>
              <div className="stair-step step-three">
                <span>迁移</span>
                <Brain size={25} />
              </div>
            </div>
            <div className="floating-note">
              <span className="note-icon">
                <Sparkles size={19} />
              </span>
              <div>
                <strong>每一小步，都算数</strong>
                <small>理解 · 独立 · 坚持</small>
              </div>
            </div>
            <svg viewBox="0 0 400 210" className="hero-curve">
              <path
                d="M20 185 C90 180,100 130,160 130 S220 90,270 80 S330 40,375 20"
                fill="none"
                stroke="#3caa97"
                strokeWidth="3"
                strokeDasharray="5 5"
              />
              <path d="M364 23 l12 -5 -3 14" fill="none" stroke="#3caa97" strokeWidth="3" />
            </svg>
          </div>
        </section>
        <section id="mechanism" className="public-section">
          <div className="section-eyebrow">THE WAY TO GROW</div>
          <h2>四个方向，让努力有迹可循</h2>
          <p className="section-intro">
            每周基础积分共 10 分。用代表性任务评价学习质量，不按题目数量加分。
          </p>
          <div className="indicator-grid">
            {config.indicators.map((ind, i) => {
              const Icon = icons[i]
              return (
                <Card key={ind.id} className="indicator-card">
                  <div className={`indicator-icon tone-${i}`}>
                    <Icon size={24} />
                  </div>
                  <div className="indicator-title">
                    <h3>{ind.name}</h3>
                    <span>
                      {ind.max}
                      <small> 分</small>
                    </span>
                  </div>
                  <p>{ind.description}</p>
                  <ul>
                    {ind.criteria.map((c, j) => (
                      <li key={j}>
                        <Check size={13} />
                        {c}
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>
          <p className="subtle-note">
            没有错题时可用概念辨析代替；数学题做错或性格差异不直接扣课堂表现分。未授课、请假和未完成测评不会自动记为
            0 分。
          </p>
        </section>
        <section className="public-section public-two-columns">
          <Card className="public-rating">
            <div className="section-eyebrow">MONTHLY REVIEW</div>
            <h2>努力有反馈，成长有方向</h2>
            <p>
              有效周积分取平均，再加考试进步奖励。少于 {config.month.minRecords}{' '}
              次有效授课时，保持“待评估”。
            </p>
            <div className="rating-explain">
              <div>
                <RatingBadge rating="excellent" />
                <p>
                  月均 ≥ {config.month.excellentAverage}，综合 ≥ {config.month.excellentTotal}
                </p>
              </div>
              <div>
                <RatingBadge rating="good" />
                <p>未达优秀，综合 ≥ {config.month.goodTotal}</p>
              </div>
              <div>
                <RatingBadge rating="improve" />
                <p>下一阶段，我们一起找到突破点</p>
              </div>
            </div>
            <div className="formula">月度综合分 = 月度平均分 + 考试额外加分</div>
            <small>
              考试得分率提高{' '}
              {config.exam.tiers
                .map((t) => `${t.minImprovement} 个百分点 → +${t.bonus} 分`)
                .join(' / ')}
              ，同场只取最高档；每月上限 {config.exam.cap} 分，需管理员确认可比性。
            </small>
          </Card>
          <Card className="public-reward">
            <div className="section-eyebrow">KEEP THE MOMENTUM</div>
            <h2>持续优秀，奖励逐月积累</h2>
            <p>
              {config.reward.name || '成长奖励'} ·{' '}
              {config.reward.description || '每一次坚持，都值得被看见。'}
            </p>
            <div className="reward-stages">
              {config.reward.stages.map((q, i) => (
                <div className={streak >= i + 1 ? 'stage completed' : 'stage'} key={i}>
                  <span>{i + 1}</span>
                  <strong>连续 {i + 1} 个月</strong>
                  <small>
                    新增 {Math.min(q, config.reward.cap)} {config.reward.unit}
                  </small>
                </div>
              ))}
            </div>
            <div className="streak-message">
              <Sparkles size={19} />
              <span>
                {latest ? `已发布的连续优秀：${streak} 个月` : '从第一个优秀月，开始积累'}
                <small>
                  超过阶梯后每月最多新增 {config.reward.cap} {config.reward.unit}
                  ；已获得的奖励不会自动取消。
                </small>
              </span>
            </div>
            <p className="subtle-note">无有效评价的月份暂停累计，未达优秀的月份重新开始。</p>
          </Card>
        </section>
        <section id="growth" className="public-section">
          <div className="section-eyebrow">SMALL STEPS, REAL GROWTH</div>
          <h2>看见一条向前的成长轨迹</h2>
          <p className="section-intro">只有管理员明确发布的匿名月度数据会出现在这里。</p>
          <Card>
            <ScoreChart
              label="已发布月度平均分"
              points={published.map((p) => ({
                name: `${Number(p.month.slice(5, 7))}月`,
                score: p.average,
              }))}
            />
            {published.length > 0 && (
              <div className="public-history">
                {published.map((p) => (
                  <div key={p.id}>
                    <span>{p.month.slice(0, 7)}</span>
                    <RatingBadge rating={p.rating} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          {store.error && (
            <p role="alert" className="subtle-note">
              公开数据暂时加载失败。{store.error}
            </p>
          )}
        </section>
        <section className="public-bottom">
          <Sprout size={32} />
          <h2>把眼光放长一点，把每一步走扎实。</h2>
          <p>学习的目标，是越来越能独立面对一道新题。</p>
          <Button onClick={openDemo}>
            探索学习工作台 <ArrowRight size={17} />
          </Button>
        </section>
      </main>
      <footer className="public-footer">
        <Brand />
        <span>为理解而学，为成长而记录。</span>
        <Link to="/login">管理员入口</Link>
      </footer>
    </div>
  )
}
export function LoginPage() {
  const store = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (store.authLoading) return <Loading />
  if (store.mode === 'admin') return <Navigate to="/admin" replace />
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      if (store.mode === 'demo') store.leaveDemo()
      setPassword('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="login-page">
      <Link className="login-home brand-link" to="/">
        <Brand />
      </Link>
      <div className="login-layout">
        <div className="login-story">
          <div className="eyebrow">TEACH WITH PURPOSE</div>
          <h1>
            专注教学，
            <br />
            让成长被看见。
          </h1>
          <p>
            每周简洁记录，每月清晰反馈。
            <br />
            让积分管理成为教学的助力。
          </p>
          <div className="login-motto">
            <Sprout size={32} />
            <span>耐心，比速度更有力量。</span>
          </div>
        </div>
        <Card className="login-card">
          <span className="login-lock">
            <LockKeyhole size={25} />
          </span>
          <h2>管理员登录</h2>
          <p>使用已获得数据库授权的邮箱账号。</p>
          {configurationError && <div className="info-banner">{configurationError}</div>}
          <form onSubmit={submit}>
            <Field label="邮箱">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.com"
                autoComplete="username"
                required
                disabled={!supabase}
              />
            </Field>
            <Field label="密码">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                required
                disabled={!supabase}
              />
            </Field>
            {(error || store.error) && (
              <p role="alert" className="form-error">
                {error || store.error}
              </p>
            )}
            <Button className="full-width" type="submit" disabled={busy || !supabase}>
              {busy ? '正在验证…' : '登录工作台'}
              <ArrowRight size={16} />
            </Button>
          </form>
          <div className="login-divider">
            <span>先了解系统</span>
          </div>
          <Button
            variant="secondary"
            className="full-width"
            onClick={() => {
              store.enterDemo()
              navigate('/admin')
            }}
          >
            打开演示工作台 <ArrowUpRight size={16} />
          </Button>
          <div className="login-security">
            <ShieldCheck size={14} />
            <span>无公开注册 · 权限由数据库验证</span>
          </div>
        </Card>
      </div>
      <p className="login-footer">知阶 · 高一数学学习激励管理系统</p>
    </div>
  )
}
