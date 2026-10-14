import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// The .e2e.ts suffix keeps this browser suite separate from Vitest unit tests.

const runtimeErrors = new WeakMap<Page, string[]>()

async function capturePreview(page: Page, name: string) {
  if (process.env.CAPTURE_PREVIEW !== 'true') return
  const directory = join(process.cwd(), 'docs', 'preview')
  await mkdir(directory, { recursive: true })
  const screen = test.info().project.name.startsWith('mobile') ? 'mobile' : 'desktop'
  const path = join(directory, `${name}-${screen}.png`)
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  await test.info().attach(`${name}-${screen}`, { path, contentType: 'image/png' })
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T12:00:00+08:00') })
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page), '页面不应发生 JavaScript 运行错误').toEqual([])
})

async function openDemoWeekly(page: Page, preview = false) {
  await page.goto('/#/')
  await page.getByRole('button', { name: '体验演示工作台' }).click()
  await expect(page.getByRole('heading', { name: '学习概览', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), '工作台应适配视口').toBeLessThanOrEqual(2)
  if (preview) await capturePreview(page, 'dashboard')
  await page.evaluate(() => { window.location.hash = '/admin/weekly' })
  await expect(page.getByRole('heading', { name: '每周学习记录', exact: true })).toBeVisible()
}

async function unusedDate(page: Page) {
  // Pending lessons may be scheduled in the future and have no max attribute.
  // Select an early date in the editor's current month, outside fixture dates.
  const reference = await page.getByLabel('授课日期', { exact: true }).inputValue()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reference)) throw new Error('授课日期尚未初始化')
  return `${reference.slice(0, 8)}${Number(reference.slice(8)) >= 2 ? '02' : '01'}`
}

test('公开页面说明评分与隐私，手机布局不溢出', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('让每一次理解')
  for (const label of ['错题理解', '知识巩固', '知识迁移', '课堂表现']) {
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByText('只有管理员明确发布的匿名月度数据会出现在这里。')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, '页面宽度应适配当前视口').toBeLessThanOrEqual(2)
  await capturePreview(page, 'homepage')
})

test('直接访问管理员深层路由时要求登录，刷新保持路由可用', async ({ page }) => {
  await page.goto('/#/admin/weekly')
  await expect(page.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录工作台', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible()
  await expect(page.getByText('无公开注册 · 权限由数据库验证')).toBeVisible()
})

test('演示评分实时计算并保存到当前会话，刷新后重置', async ({ page }) => {
  await openDemoWeekly(page, true)
  await page.getByRole('button', { name: '新增周记录', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '新增周记录' })
  await dialog.getByLabel('授课日期', { exact: true }).fill(await unusedDate(page))
  await dialog.getByLabel('记录状态').selectOption('completed')
  const marker = '浏览器验收：函数单调性'
  await dialog.getByLabel('本周学习知识点').fill(marker)
  await dialog.getByLabel('错题理解分数', { exact: true }).fill('4')
  await dialog.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(dialog).toBeVisible()
  expect(await dialog.getByLabel('错题理解分数', { exact: true }).evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false)
  await dialog.getByLabel('错题理解分数', { exact: true }).fill('3')
  await dialog.getByLabel('知识巩固分数', { exact: true }).fill('2')
  await dialog.getByLabel('知识迁移分数', { exact: true }).fill('2')
  await dialog.getByLabel('课堂表现分数', { exact: true }).fill('1.5')
  await expect(dialog.locator('.score-total')).toContainText('8.50')
  await dialog.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  const record = page.locator('.record-row').filter({ hasText: marker })
  await expect(record).toContainText('已完成')
  await expect(record).toContainText('8.50')
  await page.reload()
  await expect(page.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打开演示工作台', exact: true }).click()
  await page.evaluate(() => { window.location.hash = '/admin/weekly' })
  await expect(page.getByRole('heading', { name: '每周学习记录', exact: true })).toBeVisible()
  await expect(page.locator('.record-row').filter({ hasText: marker })).toHaveCount(0)
})

test('待测评记录保存为不计分，避免把缺失测评当作零分', async ({ page }) => {
  await openDemoWeekly(page)
  await page.getByRole('button', { name: '新增周记录', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '新增周记录' })
  await dialog.getByLabel('授课日期', { exact: true }).fill(await unusedDate(page))
  await dialog.getByLabel('本周学习知识点').fill('浏览器验收：尚未测评')
  await expect(dialog.getByText('本条记录不计分，不计入有效授课次数和月度平均分。')).toBeVisible()
  await dialog.getByRole('button', { name: '保存记录', exact: true }).click()
  const record = page.locator('.record-row').filter({ hasText: '浏览器验收：尚未测评' })
  await expect(record).toContainText('待测评')
  await expect(record).toContainText('不计分')
})
