import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { formatScore } from '../domain/engine'
export default function ScoreChart({
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
  return (
    <figure className="chart">
      <div className="chart-frame" aria-hidden="true">
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={points} margin={{ top: 15, right: 20, bottom: 5, left: -22 }}>
            <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e6ebf1" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#7c8999', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              domain={[0, max]}
              tick={{ fill: '#7c8999', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v) => [formatScore(Number(v)), label]}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="score"
              name={label}
              stroke="#248d80"
              strokeWidth={3}
              dot={{ r: 4, fill: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
            {second && (
              <Line
                isAnimationActive={false}
                dataKey="bonus"
                name="考试加分"
                stroke="#d99937"
                strokeDasharray="4 4"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="chart-caption">{label} · 缺失或未完成的测评不记为 0 分</figcaption>
      <table className="sr-only">
        <caption>{label}趋势数据</caption>
        <thead>
          <tr>
            <th>日期</th>
            <th>{label}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.name}</td>
              <td>{p.score === null ? '未评估' : formatScore(p.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
