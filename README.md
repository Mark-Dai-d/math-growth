# 知阶 · 高一数学学习激励管理系统

一个面向数学家教的学习记录与奖励管理应用。前端采用 React、TypeScript、Vite、Tailwind CSS、Radix UI、Lucide 和 Recharts；真实数据保存在 Supabase PostgreSQL，管理员通过 Supabase Auth 登录，GitHub Pages 托管前端。

**当前交付包含可运行代码、数据库迁移、权限测试和自动部署配置。尚未创建或连接你的 GitHub / Supabase 项目，因此还没有线上地址。** 按下面步骤初始化云端后，记录会持久保存在数据库。

未配置云端时，可以打开明确标注的匿名演示工作台体验操作。演示修改只保存在内存中，刷新后重置；它不会伪装成已保存的真实记录。连接 Supabase 后，公开首页只读取已发布的匿名数据，管理员记录真实数据。

## 已实现的流程

- 公开首页：四项评分、月度评级、连续优秀阶梯、管理员主动发布的匿名趋势。
- 管理员：邮箱密码登录、数据库角色校验、退出登录、登录状态恢复。
- 周记录：四项细分评分、延迟复测知识点、薄弱点与下周重点、历史编辑与删除确认；请假 / 未授课 / 待测评不计为零分。
- 考试：原始成绩与满分、对比考试、可比性确认、得分率趋势、月度额外加分。
- 月度与学期：实时预测、数据库权威结算、带规则配置的结算快照、评级调整理由、明确重新结算、学期评价与学期大奖。
- 奖励：连续优秀阶梯、累计与剩余数量、奖励使用流水、有理由的人工调整，按奖励名称和单位区分余额。
- 规则：四项名称 / 权重 / 细则、评级门槛、考试档位与上限、奖励阶梯、学期配置、按日期生效的不可变历史版本。
- 设置：学生初始化、公开数据发布范围、学习数据导出、关键操作审计。

本次实际检查结果见 [验证报告](docs/VERIFICATION.md)，界面截图见 [桌面工作台](docs/preview/dashboard-desktop.png) 和 [手机工作台](docs/preview/dashboard-mobile.png)。

## 本地启动

要求：Node.js 22、pnpm 10.28.2、Git。首次安装 pnpm 可使用 `corepack enable` 和 `corepack prepare pnpm@10.28.2 --activate`；如果 Node 安装未附带 Corepack，可使用 `npm install --global pnpm@10.28.2`。

在本项目目录执行：

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

打开终端显示的地址，通常为 `http://127.0.0.1:5173/`。`.env.local` 默认为空，可直接体验演示工作台。环境变量修改后需要重启开发服务器。

常用检查：

```powershell
pnpm check
pnpm test
pnpm test:database
pnpm build
pnpm preview
```

浏览器冒烟检查：

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

Windows 已安装 Microsoft Edge 时，可改用系统 Chromium：先执行 `$env:PLAYWRIGHT_CHANNEL='msedge'`，然后运行 `pnpm test:e2e`。默认配置仍使用 Playwright 安装的 Chromium。

数据库测试在临时内存 PostgreSQL（PGlite）中执行真实 SQL，并模拟 Supabase 的 Auth 身份函数和角色。它验证迁移、约束、业务函数与 RLS 权限；**不代表已验证云端的 Auth、PostgREST 网关或生产部署**。`supabase/tests` 使用测试账户和测试记录，勿直接在生产数据库运行。

## 初始化 Supabase

### 1. 创建云端项目与数据库

在 [Supabase 控制台](https://supabase.com/dashboard) 新建项目。数据库密码仅保存在你自己的密码管理器中，不放进前端、GitHub 或聊天。

打开项目 SQL Editor，在新建的空数据库中执行：

```text
supabase/migrations/202610140001_initial.sql
```

该迁移建立业务表、索引、约束、管理员角色表、RLS、审计触发器和结算 / 奖励 / 发布函数，并初始化默认规则。迁移文件需要按文件名顺序只应用一次，后续结构修改应新增迁移文件。

也可以用 Supabase CLI 管理迁移；项目已经附带 `supabase/config.toml` 配置：

```powershell
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <你的项目引用ID>
pnpm dlx supabase db push
```

SQL Editor 与 CLI 任选一种初始化方式；已经手动应用的迁移，应先正确对齐 CLI 迁移历史再切换方式，避免重复执行。

### 2. 禁止公开注册，创建管理员 Auth 用户

在 Authentication 的配置中关闭 **Allow new users to sign up** 和 **Allow anonymous sign-ins**，保留 Email 登录。关闭注册后只有已有用户可以登录；本应用也没有公开注册入口。[Supabase Auth 配置说明](https://supabase.com/docs/guides/auth/general-configuration)

在 Authentication → Users 手动创建管理员用户，输入你自己的邮箱和强密码，并按控制台选项确认邮箱。不要把密码写入 SQL 或项目文件。

然后在 SQL Editor 执行以下授权 SQL；将示例邮箱替换为刚创建的真实邮箱：

```sql
insert into public.admin_roles (user_id)
select id
from auth.users
where lower(email) = lower('your-admin@example.com')
on conflict (user_id) do nothing;

-- 必须查到一个授权账户；0 行表示邮箱填写错误或 Auth 用户尚未创建。
select u.id, u.email
from auth.users u
join public.admin_roles a on a.user_id = u.id
where lower(u.email) = lower('your-admin@example.com');
```

仅 Supabase 的数据库管理员能授予或撤销管理员身份。普通 Auth 用户不会因为登录成功、修改前端代码或自定义角色而获得管理员权限。

撤销管理员时，在控制台执行：

```sql
delete from public.admin_roles
where user_id in (
  select id from auth.users where lower(email) = lower('your-admin@example.com')
);
```

### 3. 配置前端公开连接信息

在 Supabase 项目的 Connect 对话框或 Settings → API Keys 查到 Project URL 和 **publishable key**。浏览器使用 `sb_publishable_` 开头的 key，访问范围由 RLS 控制；secret / service_role 具有高权限，不能放在前端。[Supabase API keys 说明](https://supabase.com/docs/guides/getting-started/api-keys)

填写本地 `.env.local`：

```dotenv
VITE_SUPABASE_URL=https://你的项目引用ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_你的公开密钥
VITE_BASE_PATH=
```

`VITE_` 变量会进入浏览器构建产物。此项目只接受 publishable key，拒绝 legacy JWT、secret 和 service_role key。`.env.local` 已在 `.gitignore` 中。

在 Authentication → URL Configuration 中设置生产 Site URL，例如 `https://用户名.github.io/math-growth/`。需要本地认证调试时，可添加 `http://127.0.0.1:5173/` 到允许的 Redirect URLs。当前版本使用密码登录，不依赖 OAuth 回调或魔法链接。

### 4. 首次登录与真实记录

重启 `pnpm dev`，从首页进入管理员登录。登录后在设置页新增学生，再添加周记录与考试。初始数据库不写入虚构的学生、考试或成绩。

完成一个月的记录后，在月度页面执行结算。结算保存快照并生成当月应得奖励。匿名成长数据必须通过管理员明确发布后才会出现在公开首页；公开首页没有原始成绩、姓名、课堂评语和学习明细。

## 部署到 GitHub Pages

### 1. 新建并推送仓库

在 GitHub 创建空仓库，例如 `math-growth`。当前交付工作区已经初始化本地 Git；如果使用 ZIP 在新目录解压，则先初始化并提交：

```powershell
git init -b main
git add .
git commit -m "feat: 高一数学学习激励管理系统"
```

然后在项目目录配置远程仓库并推送，将地址替换为你的真实仓库地址：

```powershell
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

如果已有远程地址，先查看 `git status` 和 `git remote -v`，使用已有远程配置。真实 GitHub 仓库尚未创建，因此交付时没有绑定远程，也没有推送或发布。

### 2. 设置 GitHub Repository Variables

仓库 Settings → Secrets and variables → Actions → **Variables** 新增：

| 名称 | 值 |
| --- | --- |
| `VITE_SUPABASE_URL` | 实际的 `https://项目引用ID.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 实际的 `sb_publishable_...` |
| `VITE_BASE_PATH` | 通常不设置；自定义部署路径时才填 `/路径/` |

这里只填写前端公开配置，不添加数据库密码或管理员密码。工作流在生产构建前检查配置；缺少 URL / publishable key 时主动失败，不会把空配置的演示页面误部署成正式应用。

### 3. 启用 Pages 的 GitHub Actions 发布

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。工作流已配置 Pages artifact、部署权限和 `github-pages` environment。[GitHub 自定义 Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

推送到 `main` 或在 Actions 手动运行 **Verify and deploy GitHub Pages**。工作流依次执行依赖锁定安装、类型检查、业务单元测试、PostgreSQL / RLS 测试、配置检查、构建、上传与部署。拉取请求执行检查和构建，不发布网站。

工作流成功后，以 deploy job 输出的 Pages URL 为准：

```text
https://<GitHub用户名>.github.io/<仓库名>/
```

Vite 从 `GITHUB_REPOSITORY` 自动推导 `/仓库名/`；`用户名.github.io` 仓库自动使用 `/`。路由使用 HashRouter，例如 `/仓库名/#/admin/weekly`，直接刷新也由同一个 `index.html` 处理。若手动本地预览仓库子路径，可临时将 `.env.local` 的 `VITE_BASE_PATH` 设置为 `/仓库名/`，然后重新构建。

## 计算与历史保护

基础周积分满分始终为 10，默认权重 3 / 3 / 2 / 2。课堂表现允许半分。只有已完成且具有有效评分的记录参与自然月平均，请假、未授课和待测评记录不视为零分。

考试加分按两次得分率的百分点差计算，需要管理员确认可比性。默认提高至少 5 个百分点加 0.5，提高至少 10 个百分点加 1，同一次考试档位不叠加；同月符合条件的奖励累计后受月度上限约束，默认最多 1。没有考试加分为 0。

月度展示分开列出基础平均和考试加分；默认综合分最高为 11。计算和评级使用完整精度，只有展示格式化至两位小数。默认至少 3 条有效记录才能自动评级；优秀需要平均 ≥ 8 且综合 ≥ 8.5，良好需要综合 ≥ 7。

周记录绑定授课日期对应的规则版本；月度结算使用月初对应的评级 / 考试 / 奖励规则。将新规则的生效日选为未来月份的 1 日最容易核对。修改规则会新增版本，不修改旧版本；结算快照保存规则内容、周记录、考试及其对比输入和最终评级，已结算趋势使用这些快照输入，不随后续编辑自动改变。

已经结算的月份需要明确执行“重新结算”并填写原因。人工评级调整也需要原因；数据库记录修订次数与操作审计。规则修改和重新结算都通过确认操作进行。重新结算会撤回旧的公开摘要，核对新快照后再主动发布。

连续优秀按已结算月份计算：优秀累加，良好 / 待提升清零，无有效评价的月份暂停。默认每个优秀月新增 1、2、3 天，第 4 个月起每月仍新增 3 天。奖励以流水累积，非优秀月份不撤回已获奖励；重算也不会自动取消已领取的奖励。奖励使用由数据库事务检查余额，无法超用。补录或调整历史月份后，已发放流水保留原值；管理员核对后可通过“人工调整”补发或纠正，必须填写原因，扣减不能让余额小于零，调整会写入审计。

## 项目目录

```text
src/
  components/         UI、布局与按需加载的图表组件
  pages/              公开首页与管理页面
  domain/             类型、默认规则、匿名演示、独立计算引擎和单元测试
  lib/                Supabase 客户端、状态和数据访问、辅助函数
supabase/
  migrations/         PostgreSQL 结构、RLS、数据库业务函数
  tests/              数据库约束、业务和越权测试
scripts/
  verify-database.mjs  临时 PostgreSQL 迁移与权限测试执行器
  verify-deploy-config.mjs  部署环境变量格式检查
tests/e2e/            浏览器公开页、路由、演示和移动端冒烟
docs/                 架构、安全、备份与上线验收
.github/workflows/    GitHub Pages 自动构建部署
```

## 长期维护

上线前执行 [验收清单](docs/OPERATIONS.md)，了解 [数据权限与架构](docs/ARCHITECTURE.md)。未来扩展多名学生时，已有业务表通过 `student_id` 关联；如果改为多位老师分别管理自己的学生，需要新增管理员与学生的归属关系，并同步调整 RLS，不能仅在前端增加筛选。

学习记录导出便于查阅，完整灾难恢复仍需数据库备份。定期做加密备份并在独立测试项目验证恢复；真实姓名、成绩与审计日志不存放在公开仓库。每次修改计算规则或数据库函数，都运行 `pnpm test` 与 `pnpm test:database`，再构建部署。

常见问题：

- **首页仍显示演示 / 未连接**：检查 `.env.local` 或 GitHub Variables；变量名必须完全一致，修改后重启或重新部署。
- **已登录但提示未授权**：检查 Auth 用户是否在 `public.admin_roles` 中；不要修改浏览器状态来绕过。
- **云端报表不存在 / 函数不存在**：确认在正确 Supabase 项目完整应用 migration。
- **Pages 404**：检查 Source 是否为 GitHub Actions、Actions 是否成功、访问地址是否带仓库子路径。
- **公开首页没有趋势**：管理员未发布结算时，这属于正常隐私保护；先完成结算再主动发布。
- **修改历史周记录后结算没变**：月度快照受到保护；确认修改原因后执行重新结算。
- **部署工作流因配置失败**：先创建并初始化 Supabase，配置公开 URL / publishable key，再重新运行。
