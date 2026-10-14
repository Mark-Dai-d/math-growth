// Only public configuration is read. Never print the key in CI logs.
const url = process.env.VITE_SUPABASE_URL?.trim()
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!url || !key) fail('部署停止：请在 GitHub Repository Variables 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。')
if (!key.startsWith('sb_publishable_') || key.length <= 'sb_publishable_'.length) {
  fail('部署停止：前端仅接受 sb_publishable_ 开头的公开密钥，禁止 secret / service_role / legacy JWT key。')
}

try {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co') || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    fail('部署停止：VITE_SUPABASE_URL 必须是无凭据、路径和查询参数的 https://项目引用ID.supabase.co 项目地址。')
  }
  if (parsed.hostname === 'your-project.supabase.co' || parsed.hostname === 'example.supabase.co') fail('部署停止：请填写实际 Supabase 项目地址。')
} catch {
  fail('部署停止：VITE_SUPABASE_URL 不是有效地址。')
}

console.log('✓ 云端公开配置格式有效；云端可用性仍需上线验收。')
