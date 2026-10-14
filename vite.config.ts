import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  const base = env.VITE_BASE_PATH || (repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/')
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..'))
    throw new Error('VITE_BASE_PATH 必须以 / 开头和结尾，例如 /math-growth/')
  return { plugins: [react(), tailwindcss()], base, build: { chunkSizeWarningLimit: 700 } }
})
