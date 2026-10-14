import type { RulesConfig } from './types'

/** Initial rule template. Every saved version receives its own independent copy. */
export const defaultRules: RulesConfig = {
  indicators: [
    {
      id: 'understanding',
      name: '错题理解',
      max: 3,
      description:
        '每周精选 4—6 道代表性错题或疑难题，重在理解，不按题量加分。没有错题时可用概念辨析代替。',
      criteria: [
        '指出原来的错误或不会做的地方',
        '解释错误原因和正确方法',
        '脱离答案独立完成关键解题过程',
      ],
    },
    {
      id: 'consolidation',
      name: '知识巩固',
      max: 3,
      description: '延迟复测 3 道基础或典型题，独立正确完成每题得 1 分。',
      criteria: ['第一道题独立正确完成', '第二道题独立正确完成', '第三道题独立正确完成'],
    },
    {
      id: 'transfer',
      name: '知识迁移',
      max: 2,
      description: '通过适度变化的新题检验举一反三。',
      criteria: ['独立判断正确解题方法', '独立完成关键步骤并得到正确结果'],
    },
    {
      id: 'engagement',
      name: '课堂表现',
      max: 2,
      description: '两项各可得 0、0.5 或 1 分；不因答错题、性格内向或表达习惯扣分。',
      criteria: ['课堂专注与任务投入', '独立思考与有效互动'],
    },
  ],
  month: { minRecords: 3, excellentAverage: 8, excellentTotal: 8.5, goodTotal: 7 },
  exam: {
    tiers: [
      { minImprovement: 5, bonus: 0.5 },
      { minImprovement: 10, bonus: 1 },
    ],
    cap: 1,
  },
  reward: {
    name: '设备体验卡',
    description: '完成学习安排后，由老师与家庭共同约定体验内容和使用时间。',
    unit: '天',
    stages: [1, 2, 3],
    cap: 3,
  },
  semester: { award: '', description: '学期大奖由管理员根据学习进步与坚持情况填写。' },
}
