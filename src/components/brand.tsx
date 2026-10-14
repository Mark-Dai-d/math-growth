import { BookOpen } from 'lucide-react'
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <BookOpen size={21} />
      </span>
      <span>
        <strong>
          知阶<span className="brand-dot">.</span>
        </strong>
        <small>数学成长计划</small>
      </span>
    </span>
  )
}
