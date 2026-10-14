import { useState, type FormEvent } from 'react'
import {
  Gift,
  CheckCircle2,
  Download,
  ShieldCheck,
  Database,
  Globe,
  UserPlus,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useStudentData } from '../lib/derived'
import { currentMonth, downloadCsv } from '../lib/utils'
import { formatScore } from '../domain/engine'
import { configurationError } from '../lib/supabase'
import {
  PageHeading,
  Card,
  Button,
  SectionHeader,
  Field,
  Modal,
  Confirm,
  Empty,
  useAction,
} from '../components/ui'

interface RewardGroup {
  name: string
  unit: string
  earned: number
  used: number
  balance: number
}
export function RewardsPage() {
  const d = useStudentData(currentMonth())
  const [editor, setEditor] = useState<{ group: RewardGroup; kind: 'use' | 'adjust' } | null>(null)
  const groups: RewardGroup[] = []
  for (const r of d.rewards) {
    let g = groups.find((g) => g.name === r.name && g.unit === r.unit)
    if (!g) {
      g = { name: r.name, unit: r.unit, earned: 0, used: 0, balance: 0 }
      groups.push(g)
    }
    g.balance += r.quantity
    if (r.kind === 'used') g.used -= r.quantity
    else if (r.quantity > 0) g.earned += r.quantity
  }
  function exportRewards() {
    downloadCsv('奖励历史.csv', [
      ['时间', '类型', '奖励名称', '单位', '数量变化', '原因'],
      ...d.rewards.map((r) => [
        r.created_at,
        r.kind === 'earned' ? '获得' : r.kind === 'used' ? '使用' : '人工调整',
        r.name,
        r.unit,
        r.quantity,
        r.note,
      ]),
    ])
  }
  return (
    <>
      <PageHeading
        eyebrow="CONSISTENCY DESERVES A REWARD"
        title="奖励管理"
        description="让持续的努力得到反馈，已获得的奖励不会自动取消。"
        action={
          <Button variant="secondary" onClick={exportRewards} disabled={!d.rewards.length}>
            <Download size={16} /> 导出奖励记录
          </Button>
        }
      />
      {groups.length ? (
        groups.map((g) => (
          <Card className="reward-balance-card" key={`${g.name}-${g.unit}`}>
            <div className="reward-balance-title">
              <span className="reward-title-icon">
                <Gift size={23} />
              </span>
              <div>
                <h2>{g.name || '未命名成长奖励'}</h2>
                <p>分别记录获得、使用与人工调整 · 单位：{g.unit || '未设置'}</p>
              </div>
            </div>
            <div className="balance-numbers">
              <div>
                <span>累计获得</span>
                <strong>
                  {formatScore(g.earned)}
                  <small> {g.unit}</small>
                </strong>
              </div>
              <div>
                <span>已使用</span>
                <strong>
                  {formatScore(g.used)}
                  <small> {g.unit}</small>
                </strong>
              </div>
              <div className="remaining">
                <span>可使用余额</span>
                <strong>
                  {formatScore(g.balance)}
                  <small> {g.unit}</small>
                </strong>
              </div>
            </div>
            <div className="inline-actions">
              <Button
                onClick={() => setEditor({ group: g, kind: 'use' })}
                disabled={g.balance <= 0}
              >
                <CheckCircle2 size={16} /> 记录使用
              </Button>
              <Button variant="secondary" onClick={() => setEditor({ group: g, kind: 'adjust' })}>
                <SlidersHorizontal size={16} /> 人工核实调整
              </Button>
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <Empty
            title="奖励从第一个优秀月开始"
            description="完成优秀月份结算后，系统按连续优秀阶梯发放新增奖励。"
          />
        </Card>
      )}
      <div className="info-banner">
        <ShieldCheck size={18} />
        <span>
          奖励名称、说明、单位和阶梯可在“规则版本”中修改。历史奖励保留当时名称和单位；补录历史月份后如需修正数量，请核实并使用人工调整。
        </span>
      </div>
      <Card>
        <SectionHeader title="奖励流水" description="获得与使用分别记录，余额由流水合计计算" />
        {d.rewards.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>奖励</th>
                  <th>类型</th>
                  <th>变化数量</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {[...d.rewards]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        {new Date(r.created_at).toLocaleDateString('zh-CN', {
                          timeZone: 'Asia/Shanghai',
                        })}
                      </td>
                      <td>{r.name || '未命名奖励'}</td>
                      <td>
                        <span
                          className={`badge ${r.kind === 'earned' ? 'rating-excellent' : r.kind === 'used' ? 'rating-pending' : 'rating-good'}`}
                        >
                          {r.kind === 'earned' ? '获得' : r.kind === 'used' ? '使用' : '人工调整'}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {r.quantity > 0 ? '+' : ''}
                          {formatScore(r.quantity)} {r.unit}
                        </strong>
                      </td>
                      <td>{r.note || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="暂无奖励流水" description="结算和使用后，每笔变化都可追溯。" />
        )}
      </Card>
      {editor && (
        <RewardEditor group={editor.group} kind={editor.kind} close={() => setEditor(null)} />
      )}
    </>
  )
}
function RewardEditor({
  group,
  kind,
  close,
}: {
  group: RewardGroup
  kind: 'use' | 'adjust'
  close: () => void
}) {
  const store = useStore()
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
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
        title={kind === 'use' ? '记录奖励使用' : '人工核实调整'}
        description={`${group.name || '未命名奖励'} · 可用 ${formatScore(group.balance)} ${group.unit}`}
      >
        <form onSubmit={submit}>
          <Field label={kind === 'use' ? '本次使用数量' : '调整数量（增加为正，减少为负）'}>
            <input
              type="number"
              min={kind === 'use' ? 0.01 : -group.balance}
              max={kind === 'use' ? group.balance : undefined}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </Field>
          <Field label={kind === 'use' ? '使用备注' : '核实与调整原因（必填）'}>
            <textarea
              rows={3}
              value={note}
              maxLength={2000}
              required={kind === 'adjust'}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                kind === 'use' ? '例如：周六已使用 1 天' : '说明为什么需要补发或减少奖励'
              }
            />
          </Field>
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={quantity === 0}>
              继续确认
            </Button>
          </div>
        </form>
      </Modal>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title={kind === 'use' ? '确认记录奖励使用？' : '确认人工调整奖励？'}
        description="系统会保存一笔独立流水并记录操作日志。可用余额不能小于 0。"
        busy={busy}
        onConfirm={() =>
          run(
            () =>
              kind === 'use'
                ? store.useReward(quantity, group.name, group.unit, note)
                : store.adjustReward(quantity, group.name, group.unit, note),
            '奖励流水已保存',
            close,
          )
        }
      />
    </>
  )
}

const actions: Record<string, string> = {
  INSERT: '新增',
  UPDATE: '更新',
  DELETE: '删除',
  insert: '新增',
  update: '更新',
  delete: '删除',
  save: '保存',
  settle: '月度结算',
  recalculate: '重新结算',
  settle_month: '月度结算',
  use: '使用奖励',
  use_reward: '使用奖励',
  adjust_reward: '人工调整奖励',
  adjust: '人工调整',
  publish: '发布',
  unpublish: '撤回发布',
  publish_month: '发布设置',
  create_version: '创建规则版本',
  create: '新增',
}
const entities: Record<string, string> = {
  students: '学生资料',
  rule_versions: '规则版本',
  weekly_records: '每周记录',
  exams: '考试成绩',
  monthly_settlements: '月度结算',
  reward_entries: '奖励流水',
  semester_reviews: '学期评价',
  public_growth: '公开数据',
}
export function SettingsPage() {
  const store = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('高一')
  const { run, busy } = useAction()
  const pub = store.data.publicGrowth.filter((p) => p.published)
  function exportAudit() {
    downloadCsv('操作日志.csv', [
      ['时间', '操作', '对象', '对象ID', '执行人ID'],
      ...store.data.audit.map((a) => [
        a.created_at,
        actions[a.action] ?? a.action,
        entities[a.entity] ?? a.entity,
        a.entity_id,
        a.actor_id,
      ]),
    ])
  }
  return (
    <>
      <PageHeading
        eyebrow="PRIVATE BY DEFAULT"
        title="数据与操作日志"
        description="数据默认私有；只公开你明确允许展示的匿名结果。"
        action={
          <Button
            variant="secondary"
            onClick={() => run(store.refresh, '云端数据已刷新')}
            disabled={busy || store.mode === 'demo'}
          >
            <RefreshCw size={16} /> 刷新云端数据
          </Button>
        }
      />
      <div className="dashboard-bottom-grid">
        <Card>
          <SectionHeader title="数据连接" action={<Database size={19} />} />
          <div className="settings-status">
            <span className={`green-dot ${configurationError ? 'muted-dot' : ''}`} />
            <b>
              {store.mode === 'demo'
                ? '演示模式 · 未写入云端'
                : configurationError
                  ? '尚未配置 Supabase'
                  : '已连接 Supabase 云端'}
            </b>
          </div>
          <p className="summary-text">
            {store.mode === 'demo'
              ? '数据仅保留在内存中，刷新页面即恢复示例。实际管理员模式使用云端数据库持久化。'
              : '使用 Auth 邮箱登录，管理员角色由数据库授权。学生资料、周记录、考试成绩和结算快照受 RLS 保护。'}
          </p>
          <div className="security-points">
            <span>
              <ShieldCheck size={15} /> 前端仅使用 publishable key
            </span>
            <span>
              <ShieldCheck size={15} /> 无公开管理员注册入口
            </span>
          </div>
        </Card>
        <Card>
          <SectionHeader title="公开展示范围" action={<Globe size={19} />} />
          <div className="settings-count">
            <strong>{pub.length}</strong>
            <span>条匿名月度摘要已发布</span>
          </div>
          <p className="summary-text">
            仅包含月份、平均分、额外加分、评级与连续优秀月数。学生姓名、原始成绩、课堂反馈和家庭信息不进入公开表。
          </p>
          <p className="subtle-note">在“月度与学期”中逐月发布或撤下摘要。</p>
        </Card>
      </div>
      <Card>
        <SectionHeader
          title="学生资料"
          description="第一版支持一个学生；数据结构可扩展为多个学生"
          action={
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <UserPlus size={16} /> 添加学生
            </Button>
          }
        />
        {store.data.students.length ? (
          <div className="student-list">
            {store.data.students.map((s) => (
              <div key={s.id}>
                <span className="avatar">{s.name.slice(0, 1)}</span>
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.grade} · 私有资料</small>
                </div>
                {s.id === store.studentId && <span className="badge rating-good">当前学生</span>}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="先添加一位学生" description="学生资料仅管理员可见，不会出现在公开首页。" />
        )}
      </Card>
      <Card>
        <SectionHeader
          title="最近操作日志"
          description="显示最近 200 条；数据库保留完整日志，客户端不能修改或删除"
          action={
            <Button variant="ghost" onClick={exportAudit} disabled={!store.data.audit.length}>
              <Download size={16} /> 导出日志
            </Button>
          }
        />
        {store.data.audit.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作</th>
                  <th>对象</th>
                  <th>记录标识</th>
                </tr>
              </thead>
              <tbody>
                {store.data.audit.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {new Date(a.created_at).toLocaleString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        hour12: false,
                      })}
                    </td>
                    <td>
                      <span className="audit-action">{actions[a.action] ?? a.action}</span>
                    </td>
                    <td>{entities[a.entity] ?? a.entity}</td>
                    <td className="mono">
                      {a.entity_id?.slice(0, 8) ?? '演示操作'}
                      {!!a.detail.reason && <small>{String(a.detail.reason)}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="暂无操作日志"
            description="保存记录、修改规则、月度结算和奖励使用时会自动记录。"
          />
        )}
      </Card>
      <Modal
        open={adding}
        onOpenChange={setAdding}
        title="添加学生"
        description="学生姓名仅保存到私有资料表，匿名发布不会包含姓名。"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(
              () => store.saveStudent(name.trim(), grade.trim()),
              '学生已添加',
              () => {
                setAdding(false)
                setName('')
              },
            )
          }}
        >
          <Field label="学生姓名">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              placeholder="请输入姓名"
            />
          </Field>
          <Field label="年级">
            <input
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              required
              maxLength={50}
            />
          </Field>
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              保存学生
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
