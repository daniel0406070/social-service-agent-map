import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBasePath(rawValue) {
  const value = String(rawValue ?? '').trim()
  if (!value || value === '/') return '/'
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appBasePath = env.APP_BASE_PATH || process.env.APP_BASE_PATH || '/ssp'

  return {
    plugins: [react()],
    // APP_BASE_PATH examples: /ssp, /map, /foo/bar
    base: mode === 'production' ? normalizeBasePath(appBasePath) : '/',
  }
})
