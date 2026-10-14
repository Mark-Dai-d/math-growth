import { useState, type FormEvent } from 'react'
import {
  Plus,
  ShieldCheck,
  History,
  SlidersHorizontal,
  Check,
  CalendarDays,
  Copy,
  Save,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { today } from '../lib/utils'
import { defaultRules } from '../domain/defaults'
import { selectRuleVersion, validateRules } from '../domain/engine'
import type { RulesConfig, RuleVersion } from '../domain/types'
import {
  Card,
  Button,
  PageHeading,
  Field,
  SectionHeader,
  Confirm,
  useAction,
} from '../components/ui'

export function RulesPage() {
  const store = useStore()
  let active: RuleVersion | null
  try {
    active = selectRuleVersion(store.data.rules, today())
  } catch {
    active = null
  }
  const [selected, setSelected] = useState<RuleVersion | null>(active)
  const [editing, setEditing] = useState(false)
  const [config, setConfig] = useState<RulesConfig>(structuredClone(active?.config ?? defaultRules))
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [confirm, setConfirm] = useState(false)
  const { run, busy } = useAction()
  const shown = editing ? config : ((selected ?? active)?.config ?? defaultRules)
  const errors = validateRules(config)
  const versions = [...store.data.rules].sort((a, b) => b.version - a.version)
  function choose(version: RuleVersion) {
    setSelected(version)
    setEditing(false)
    setConfig(structuredClone(version.config))
  }
  function begin() {
    setConfig(structuredClone(shown))
    setEffectiveDate(today())
    setEditing(true)
  }
  function setMonth(key: keyof RulesConfig['month'], v: number) {
    setConfig({ ...config, month: { ...config.month, [key]: v } })
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (errors.length) return
    setConfirm(true)
  }
  async function save() {
    await run(
      () => store.saveRules(config, effectiveDate),
      '新规则版本已保存',
      () => {
        setEditing(false)
        setSelected(null)
        setConfirm(false)
      },
    )
  }
  return (
    <>
      <PageHeading
        eyebrow="CLEAR RULES, LASTING TRUST"
        title="规则版本管理"
        description="让评分有据可依，也让历史结果保持可信。"
        action={
          editing ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(false)
                setConfig(structuredClone(selected?.config ?? active?.config ?? defaultRules))
              }}
            >
              取消编辑
            </Button>
          ) : (
            <Button onClick={begin}>
              <Plus size={17} /> 创建新版本
            </Button>
          )
        }
      />
      <div className="info-banner">
        <ShieldCheck size={19} />
        <span>
          每次保存均创建不可修改的新版本。周记录保留当时版本，已结算月份保留完整快照。月度规则按当月
          1 日生效的版本选取。
        </span>
      </div>
      <div className="rules-layout">
        <aside className="rule-versions card">
          <SectionHeader title="版本历史" action={<History size={18} />} />
          {versions.map((v) => (
            <button
              key={v.id}
              className={`version-item ${(selected?.id ?? active?.id) === v.id && !editing ? 'selected' : ''}`}
              onClick={() => choose(v)}
              disabled={busy}
            >
              <div>
                <strong>规则 v{v.version}</strong>
                <span>
                  {v.id === active?.id
                    ? '当前生效'
                    : v.effective_from > today()
                      ? '计划生效'
                      : '历史版本'}
                </span>
              </div>
              <small>
                <CalendarDays size={12} /> {v.effective_from}
              </small>
            </button>
          ))}
          {!versions.length && <p className="subtle-note">尚未初始化云端规则</p>}
          <p className="subtle-note">历史版本可查看、复制，不能覆盖或删除。</p>
        </aside>
        <form className="rules-form" onSubmit={submit}>
          <Card>
            <SectionHeader
              title={
                editing ? '新版本配置' : `评分规则 · v${(selected ?? active)?.version ?? '默认'}`
              }
              description={
                editing
                  ? '填写生效日期后保存，旧版本将完整保留'
                  : `生效日期：${(selected ?? active)?.effective_from ?? '默认规则预览'}`
              }
              action={
                !editing && (
                  <Button variant="ghost" type="button" onClick={begin}>
                    <Copy size={16} /> 复制为新版本
                  </Button>
                )
              }
            />
            {editing && (
              <Field label="生效日期">
                <input
                  type="date"
                  required
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </Field>
            )}
            <div className="weights-summary">
              <SlidersHorizontal size={18} />
              <span>四项权重合计</span>
              <strong>{shown.indicators.reduce((s, i) => s + i.max, 0).toFixed(2)} / 10 分</strong>
              {Math.abs(shown.indicators.reduce((s, i) => s + i.max, 0) - 10) < 1e-9 && (
                <Check size={18} />
              )}
            </div>
            <div className="rules-indicators">
              {shown.indicators.map((ind, i) => (
                <div key={ind.id} className="rules-indicator">
                  <div className="form-grid">
                    <Field label={`指标 ${i + 1} · 名称`}>
                      <input
                        value={ind.name}
                        disabled={!editing}
                        maxLength={100}
                        required
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            indicators: config.indicators.map((x, j) =>
                              i === j ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="满分权重">
                      <input
                        type="number"
                        step="any"
                        min={0.01}
                        max={10}
                        required
                        disabled={!editing}
                        value={ind.max}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            indicators: config.indicators.map((x, j) =>
                              i === j ? { ...x, max: Number(e.target.value) } : x,
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="指标说明">
                    <input
                      value={ind.description}
                      disabled={!editing}
                      maxLength={500}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          indicators: config.indicators.map((x, j) =>
                            i === j ? { ...x, description: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="评分细则"
                    hint="每行一个评价要点；勾选时按要点比例分配该指标满分，课堂表现允许半分。"
                  >
                    <textarea
                      rows={Math.max(2, ind.criteria.length)}
                      value={ind.criteria.join('\n')}
                      disabled={!editing}
                      required
                      maxLength={3000}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          indicators: config.indicators.map((x, j) =>
                            i === j ? { ...x, criteria: e.target.value.split('\n') } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeader
              title="月度评级门槛"
              description="优秀同时满足月均门槛和综合分门槛，良好按综合分判断"
            />
            <div className="form-grid">
              <Field label="最少有效授课次数">
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={!editing}
                  required
                  value={shown.month.minRecords}
                  onChange={(e) => setMonth('minRecords', Number(e.target.value))}
                />
              </Field>
              <Field label="优秀 · 月均分至少">
                <input
                  type="number"
                  min={0}
                  max={10}
                  step="any"
                  disabled={!editing}
                  required
                  value={shown.month.excellentAverage}
                  onChange={(e) => setMonth('excellentAverage', Number(e.target.value))}
                />
              </Field>
              <Field label="优秀 · 综合分至少">
                <input
                  type="number"
                  min={0}
                  max={10 + shown.exam.cap}
                  step="any"
                  disabled={!editing}
                  required
                  value={shown.month.excellentTotal}
                  onChange={(e) => setMonth('excellentTotal', Number(e.target.value))}
                />
              </Field>
              <Field label="良好 · 综合分至少">
                <input
                  type="number"
                  min={0}
                  max={10 + shown.exam.cap}
                  step="any"
                  disabled={!editing}
                  required
                  value={shown.month.goodTotal}
                  onChange={(e) => setMonth('goodTotal', Number(e.target.value))}
                />
              </Field>
            </div>
          </Card>
          <Card>
            <SectionHeader
              title="考试进步奖励"
              description="得分率变化以百分点计算，单场最高档位、同月累加后封顶"
              action={
                editing && (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        exam: {
                          ...config.exam,
                          tiers: [
                            ...config.exam.tiers,
                            { minImprovement: 15, bonus: config.exam.cap },
                          ],
                        },
                      })
                    }
                  >
                    <Plus size={15} /> 增加档位
                  </Button>
                )
              }
            />
            {shown.exam.tiers.map((tier, i) => (
              <div className="rule-tier" key={i}>
                <Field label={`档位 ${i + 1} · 至少提升百分点`}>
                  <input
                    type="number"
                    min={0.01}
                    max={100}
                    step="any"
                    disabled={!editing}
                    required
                    value={tier.minImprovement}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        exam: {
                          ...config.exam,
                          tiers: config.exam.tiers.map((x, j) =>
                            i === j ? { ...x, minImprovement: Number(e.target.value) } : x,
                          ),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="额外加分">
                  <input
                    type="number"
                    min={0}
                    max={shown.exam.cap}
                    step="any"
                    disabled={!editing}
                    required
                    value={tier.bonus}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        exam: {
                          ...config.exam,
                          tiers: config.exam.tiers.map((x, j) =>
                            i === j ? { ...x, bonus: Number(e.target.value) } : x,
                          ),
                        },
                      })
                    }
                  />
                </Field>
                {editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setConfig({
                        ...config,
                        exam: {
                          ...config.exam,
                          tiers: config.exam.tiers.filter((_, j) => j !== i),
                        },
                      })
                    }
                  >
                    移除
                  </Button>
                )}
              </div>
            ))}
            <Field label="每月考试加分上限">
              <input
                type="number"
                min={0}
                max={10}
                step="any"
                disabled={!editing}
                required
                value={shown.exam.cap}
                onChange={(e) =>
                  setConfig({ ...config, exam: { ...config.exam, cap: Number(e.target.value) } })
                }
              />
            </Field>
          </Card>
          <Card>
            <SectionHeader
              title="连续优秀奖励"
              description="每月获得新增奖励，已获得奖励不因中断或重算被自动取消"
            />
            <div className="form-grid">
              <Field label="奖励名称（可留空）">
                <input
                  value={shown.reward.name}
                  maxLength={100}
                  disabled={!editing}
                  onChange={(e) =>
                    setConfig({ ...config, reward: { ...config.reward, name: e.target.value } })
                  }
                />
              </Field>
              <Field label="奖励单位（可留空）">
                <input
                  value={shown.reward.unit}
                  maxLength={50}
                  disabled={!editing}
                  onChange={(e) =>
                    setConfig({ ...config, reward: { ...config.reward, unit: e.target.value } })
                  }
                />
              </Field>
            </div>
            <Field label="奖励说明">
              <textarea
                rows={2}
                value={shown.reward.description}
                maxLength={2000}
                disabled={!editing}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    reward: { ...config.reward, description: e.target.value },
                  })
                }
              />
            </Field>
            <div className="form-grid">
              {shown.reward.stages.map((q, i) => (
                <Field key={i} label={`连续 ${i + 1} 个月 · 本月新增`}>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={q}
                    disabled={!editing}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        reward: {
                          ...config.reward,
                          stages: config.reward.stages.map((x, j) =>
                            i === j ? Number(e.target.value) : x,
                          ),
                        },
                      })
                    }
                  />
                </Field>
              ))}
              <Field label="每月新增奖励封顶">
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={!editing}
                  required
                  value={shown.reward.cap}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      reward: { ...config.reward, cap: Number(e.target.value) },
                    })
                  }
                />
              </Field>
            </div>
            {editing && (
              <div className="inline-actions">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setConfig({
                      ...config,
                      reward: {
                        ...config.reward,
                        stages: [...config.reward.stages, config.reward.cap],
                      },
                    })
                  }
                >
                  <Plus size={14} /> 新增阶段
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={config.reward.stages.length < 2}
                  onClick={() =>
                    setConfig({
                      ...config,
                      reward: { ...config.reward, stages: config.reward.stages.slice(0, -1) },
                    })
                  }
                >
                  移除最后阶段
                </Button>
              </div>
            )}
          </Card>
          <Card>
            <SectionHeader
              title="学期评价设置"
              description="作为可编辑配置保留，管理员在学期页面核实后录入"
            />
            <Field label="学期大奖默认内容">
              <input
                value={shown.semester.award}
                disabled={!editing}
                maxLength={2000}
                onChange={(e) =>
                  setConfig({ ...config, semester: { ...config.semester, award: e.target.value } })
                }
              />
            </Field>
            <Field label="学期评价说明">
              <textarea
                rows={2}
                value={shown.semester.description}
                disabled={!editing}
                maxLength={3000}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    semester: { ...config.semester, description: e.target.value },
                  })
                }
              />
            </Field>
          </Card>
          {editing && (
            <div className="rules-save">
              {errors.length > 0 && (
                <ul className="form-error">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <Button type="submit" disabled={busy || !!errors.length}>
                <Save size={17} /> 保存新版本
              </Button>
            </div>
          )}
        </form>
      </div>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="创建新的规则版本？"
        description={`新版本将于 ${effectiveDate} 生效。历史周记录继续使用原版本；已结算月度结果不变。该操作会写入日志。`}
        busy={busy}
        onConfirm={() => void save()}
      />
    </>
  )
}
