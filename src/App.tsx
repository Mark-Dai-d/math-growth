import { lazy, Suspense } from 'react'
import { Brand } from './components/brand'
import './styles.css'
import {
  HashRouter,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  Link,
  useLocation,
} from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  GraduationCap,
  BarChart3,
  SlidersHorizontal,
  Gift,
  ShieldCheck,
  LogOut,
  ArrowUpRight,
  History,
  Sprout,
  CircleHelp,
} from 'lucide-react'
import { StoreProvider, useStore } from './lib/store'
import { NoticeProvider, Loading, Button, useAction } from './components/ui'
const PublicPage = lazy(() =>
  import('./pages/Public').then((module) => ({ default: module.PublicPage })),
)
const LoginPage = lazy(() =>
  import('./pages/Public').then((module) => ({ default: module.LoginPage })),
)
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })),
)
const WeeklyPage = lazy(() =>
  import('./pages/Weekly').then((module) => ({ default: module.WeeklyPage })),
)
const ExamsPage = lazy(() =>
  import('./pages/Exams').then((module) => ({ default: module.ExamsPage })),
)
const SummariesPage = lazy(() =>
  import('./pages/Summaries').then((module) => ({ default: module.SummariesPage })),
)
const RulesPage = lazy(() =>
  import('./pages/Rules').then((module) => ({ default: module.RulesPage })),
)
const RewardsPage = lazy(() =>
  import('./pages/Manage').then((module) => ({ default: module.RewardsPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/Manage').then((module) => ({ default: module.SettingsPage })),
)

const nav = [
  { to: '/admin', name: '学习概览', icon: LayoutDashboard, end: true },
  { to: '/admin/weekly', name: '每周记录', icon: ClipboardList },
  { to: '/admin/exams', name: '考试成绩', icon: GraduationCap },
  { to: '/admin/summaries', name: '月度与学期', icon: BarChart3 },
  { to: '/admin/rewards', name: '奖励管理', icon: Gift },
  { to: '/admin/rules', name: '规则版本', icon: SlidersHorizontal },
  { to: '/admin/settings', name: '数据与日志', icon: History },
]
function AdminShell() {
  const store = useStore()
  const location = useLocation()
  const { run, busy } = useAction()
  if (store.authLoading) return <Loading />
  if (store.mode === 'public') return <Navigate to="/login" replace />
  const selected = store.data.students.find((s) => s.id === store.studentId)
  const name =
    nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
      ?.name ?? '学习概览'
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/admin" className="brand-link">
          <Brand />
        </Link>
        <div className="workspace-label">
          学习工作台 <span>高一数学</span>
        </div>
        <nav aria-label="后台导航">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <n.icon size={19} />
              <span>{n.name}</span>
              {n.end && <span className="nav-pill">总览</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sprout size={25} />
          <h3>进步，来自每一小步</h3>
          <p>
            多一点理解，
            <br />
            多一份独立思考。
          </p>
          <Link to="/">
            查看公开首页 <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={17} />
          <span>{store.mode === 'demo' ? '演示工作台' : '管理员专属空间'}</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作台 <span>/</span> <strong>{name}</strong>
          </div>
          <div className="topbar-right">
            <Link to="/" className="topbar-link">
              公开首页 <ArrowUpRight size={14} />
            </Link>
            <span className="topbar-divider" />
            <div className="avatar">{selected?.name.slice(0, 1) ?? '学'}</div>
            <select
              aria-label="选择学生"
              value={store.studentId}
              onChange={(e) => store.selectStudent(e.target.value)}
            >
              {store.data.students.length ? (
                store.data.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.grade}
                  </option>
                ))
              ) : (
                <option value="">尚未添加学生</option>
              )}
            </select>
            <button
              title="退出登录"
              aria-label="退出登录"
              className="icon-button"
              disabled={busy}
              onClick={() => run(store.signOut, '已退出')}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {store.mode === 'demo' && (
          <div className="demo-banner">
            <CircleHelp size={16} />
            <span>
              <strong>演示模式</strong> · 匿名示例数据，修改仅在本次会话有效，不会写入云端。
            </span>
            <Link to="/login">
              连接真实数据 <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main className="content">
          {store.error && (
            <div role="alert" className="error-banner">
              {store.error}
              <Button variant="ghost" onClick={() => run(store.refresh, '数据已刷新')}>
                重试
              </Button>
            </div>
          )}
          {store.loading && store.data.rules.length > 0 && (
            <div role="status" className="refresh-status">
              正在同步云端数据…
            </div>
          )}
          {store.loading && !store.data.rules.length ? <Loading /> : <Outlet />}
        </main>
        <footer className="app-footer">
          <span>知阶 · 记录理解，见证成长</span>
          <span>基础积分 10 分 + 考试奖励单独计算</span>
        </footer>
      </div>
    </div>
  )
}
export default function App() {
  return (
    <HashRouter>
      <StoreProvider>
        <NoticeProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<PublicPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<AdminShell />}>
                <Route index element={<Dashboard />} />
                <Route path="weekly" element={<WeeklyPage />} />
                <Route path="exams" element={<ExamsPage />} />
                <Route path="summaries" element={<SummariesPage />} />
                <Route path="rewards" element={<RewardsPage />} />
                <Route path="rules" element={<RulesPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </NoticeProvider>
      </StoreProvider>
    </HashRouter>
  )
}
