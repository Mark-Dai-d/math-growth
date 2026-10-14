# 本次交付验证

验证日期：2026-10-14（Asia/Shanghai）。当前工作区项目目录为 `math-growth`，本地 Git 分支为 `main`；尚无远程仓库与云端项目。

## 检查结果

| 检查 | 实际结果 |
| --- | --- |
| TypeScript 严格类型、未使用变量检查 | 通过 |
| Vitest | 82 项通过：69 项领域计算、13 项日期与导出辅助逻辑 |
| PostgreSQL migration | 在 PGlite 执行通过；11 张业务表均启用 RLS |
| SQL 权限与业务断言 | 86 条通过 |
| Playwright | 14 项通过，桌面与 Pixel 7 手机宽度各 7 项 |
| Vite 生产构建 | 通过；页面与图表按需加载 |
| GitHub Pages 子路径 | 以 `GITHUB_REPOSITORY=verification-owner/math-growth` 构建，资源正确引用 `/math-growth/` |
| 子路径生产浏览器验证 | 首页、图标、演示路由、受保护的深层 Hash 路由及刷新均通过；无 JS 或 HTTP 错误 |

本次环境使用 Node.js 24.19.0。浏览器验证使用系统 Microsoft Edge 的 Chromium 引擎；手机测试是视口模拟，不是实机 Safari 或 Android 测试。项目运行与 CI 要求 Node.js 22，依赖通过 pnpm 锁文件固定。

## 覆盖的关键行为

- 已完成测评才计算周积分；请假、未授课和待测评返回空积分。
- 月度平均、优秀的双门槛、最少有效次数、11 分综合分与展示舍入。
- 不同满分考试比较、可比性确认、5 / 10 个百分点边界、单场最高档位和月度封顶。
- 连续优秀递增、未评估月份暂停、中断后重新累计、历史规则关联。
- 规则不可覆盖、历史原始记录与规则配置快照、带理由和确认的重新结算、旧版本查看。
- 奖励按名称和单位分开统计；已使用与人工调整分别计数；数据库拒绝超用和负余额。
- 匿名用户和普通已登录用户无法读取私有记录、修改分数或自授管理员角色。
- 公开摘要仅有匿名字段；发布、撤回和重算撤回；私有反馈不进入公开表。
- 桌面 / 手机页面无横向溢出；表单范围校验、临时演示保存与刷新重置。
- 已成功提交的写入与后续数据刷新分开处理，避免读失败误报保存失败；刷新保留当前历史月份上下文。

## 可复现命令

按 README 安装指定版本的 pnpm 后：

```powershell
pnpm check
pnpm test
pnpm test:database
pnpm build
$env:PLAYWRIGHT_CHANNEL='msedge'
pnpm test:e2e --workers=1
```

没有系统 Edge 时，使用 `pnpm exec playwright install chromium`，并不设置 `PLAYWRIGHT_CHANNEL`。本工作区为避开运行环境的 pnpm 包管理器版本差异，检查时也直接执行过相同脚本对应的 `node node_modules/typescript/bin/tsc`、Vitest、Vite、Playwright 入口。

## 仍需完成的外部配置

用户本次确认尚未创建 GitHub / Supabase。以下操作尚未发生，不能把本地验证视为线上验收：

1. 创建 Supabase 项目，应用 SQL migration。
2. 禁止公开注册，创建 Auth 管理员用户并由数据库授予角色。
3. 配置实际 URL 和 publishable key。
4. 创建 GitHub 仓库、推送代码、设置 Repository Variables、启用 Pages 的 Actions 发布。
5. 按 [云端验收清单](OPERATIONS.md) 验证真实登录、跨刷新 / 跨设备的数据持久化、REST 权限和实际 Pages 地址。

PGlite 模拟了 Auth 身份和角色，执行真实 PostgreSQL 业务函数与 RLS；没有启动 Supabase 的 Auth 服务、邮件和 REST 网关。

## 界面预览

预览仅使用明确标注的匿名合成数据：

- [桌面工作台](preview/dashboard-desktop.png)
- [手机工作台](preview/dashboard-mobile.png)
- [桌面公开首页](preview/homepage-desktop.png)
- [手机公开首页](preview/homepage-mobile.png)
