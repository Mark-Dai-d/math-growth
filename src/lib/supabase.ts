import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const configurationError =
  !url || !key
    ? '尚未连接 Supabase，请按 README 配置项目 URL 和 publishable key。'
    : !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)
      ? 'Supabase URL 必须是项目的 https://…supabase.co 地址。'
      : !key.startsWith('sb_publishable_')
        ? '前端只接受 sb_publishable_ 开头的公开密钥。请勿配置 secret 或 service_role key。'
        : null
export const supabase = configurationError
  ? null
  : createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
