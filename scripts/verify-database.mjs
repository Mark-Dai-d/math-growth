import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

// A fresh in-memory PostgreSQL engine: no cloud credentials or persistent data.
// Auth / REST / HTTP gateway behavior still needs verification on Supabase.
const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const db = await PGlite.create()
let stage = '创建本地 Supabase Auth 测试环境'

try {
  await db.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    revoke create on schema public from public;
  `)

  const migrationDir = join(projectRoot, 'supabase', 'migrations')
  const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort()
  if (!migrations.length) throw new Error('未找到 SQL migration，不能跳过数据库验证。')

  for (const name of migrations) {
    stage = `执行 migration ${name}`
    await db.exec(await readFile(join(migrationDir, name), 'utf8'))
    console.log(`✓ migration ${name}`)
  }

  stage = '检查 public 数据表的 RLS 状态'
  const { rows: tables } = await db.query(`
    select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  `)
  if (!tables.length) throw new Error('public schema 没有业务表。')
  const unprotected = tables.filter((table) => !table.relrowsecurity)
  if (unprotected.length) throw new Error(`以下业务表未启用 RLS：${unprotected.map((table) => table.relname).join('、')}`)
  console.log(`✓ ${tables.length} 张业务表全部启用 RLS`)

  const testDir = join(projectRoot, 'supabase', 'tests')
  const tests = (await readdir(testDir)).filter((name) => name.endsWith('.sql')).sort()
  if (!tests.length) throw new Error('未找到数据库权限测试，不能报告通过。')
  for (const name of tests) {
    stage = `执行 SQL 测试 ${name}`
    const results = await db.exec(await readFile(join(testDir, name), 'utf8'))
    const assertionCount = results.filter((result) => result.fields?.some((field) => ['assert_true', 'expect_error'].includes(field.name))).length
    for (const result of results) {
      for (const row of result.rows ?? []) {
        if (typeof row.test_result === 'string') console.log(`✓ ${row.test_result}`)
      }
    }
    console.log(`✓ SQL assertions ${name}${assertionCount ? ` (${assertionCount} 条)` : ''}`)
  }
  console.log('本地 PostgreSQL migration / 业务函数 / 权限断言通过。尚未验证云端 Auth 或 REST 网关。')
} catch (error) {
  console.error(`数据库验证失败：${stage}`)
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await db.close()
}
