import * as Dialog from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import {
  ChevronLeft,
  ChevronRight,
  X,
  LoaderCircle,
  Inbox,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  createContext,
  useContext,
  useState,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react'
import { cn, errorMessage, monthLabel, shiftMonth } from '../lib/utils'
import { ratingLabels } from '../domain/engine'
import type { Rating } from '../domain/types'

const LazyScoreChart = lazy(() => import('./ScoreChart'))

const buttonVariants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
  },
  defaultVariants: { variant: 'default' },
})
export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />
}
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('card', className)}>{children}</section>
}
export function RatingBadge({ rating }: { rating: Rating }) {
  return (
    <span className={`badge rating-${rating}`}>
      {rating === 'excellent' && '✦ '}
      {ratingLabels[rating]}
    </span>
  )
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  )
}
export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="month-picker">
      <button aria-label="上个月" onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft size={17} />
      </button>
      <input
        type="month"
        aria-label="选择月份"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
      <button aria-label="下个月" onClick={() => onChange(shiftMonth(value, 1))}>
        <ChevronRight size={17} />
      </button>
    </div>
  )
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function Loading() {
  return (
    <div role="status" className="empty">
      <LoaderCircle className="spin" size={28} />
      <p>正在加载云端数据…</p>
    </div>
  )
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={cn('dialog', wide && 'dialog-wide')}>
          <div className="dialog-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="关闭">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  busy = false,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  busy?: boolean
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="dialog-actions">
        <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {busy ? '处理中…' : '确认操作'}
        </Button>
      </div>
    </Modal>
  )
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement(children) &&
      typeof children.type === 'string' &&
      ['input', 'textarea', 'select'].includes(children.type)
        ? cloneElement(children as ReactElement<{ 'aria-label'?: string }>, { 'aria-label': label })
        : children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function ScoreChart({
  points,
  max = 10,
  label = '每周积分',
  second,
}: {
  points: { name: string; score: number | null; bonus?: number }[]
  max?: number
  label?: string
  second?: boolean
}) {
  if (!points.length)
    return <Empty title="成长从第一条记录开始" description="记录有效授课后，这里会显示积分趋势。" />
  return (
    <Suspense
      fallback={
        <div className="chart-frame chart-loading" role="status">
          正在绘制成长趋势…
        </div>
      }
    >
      <LazyScoreChart points={points} max={max} label={label} second={second} />
    </Suspense>
  )
}
interface Notice {
  message: string
  type: 'success' | 'error'
}
const NoticeContext = createContext<((n: Notice) => void) | null>(null)
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  return (
    <NoticeContext.Provider value={(n) => setNotice(n)}>
      {children}
      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`toast toast-${notice.type}`}
        >
          {notice.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{notice.message}</span>
          <button aria-label="关闭通知" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </NoticeContext.Provider>
  )
}
export function useAction() {
  const notify = useContext(NoticeContext)!
  const [busy, setBusy] = useState(false)
  async function run(action: () => Promise<unknown>, message = '操作已保存', after?: () => void) {
    setBusy(true)
    try {
      await action()
      notify({ message, type: 'success' })
      after?.()
      return true
    } catch (e) {
      notify({ message: errorMessage(e), type: 'error' })
      return false
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, notify }
}
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function Metric({
  label,
  value,
  unit,
  foot,
  icon,
  tone = 'navy',
}: {
  label: string
  value: ReactNode
  unit?: string
  foot: ReactNode
  icon: ReactNode
  tone?: string
}) {
  return (
    <Card className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="metric-foot">{foot}</div>
    </Card>
  )
}
export { monthLabel }
