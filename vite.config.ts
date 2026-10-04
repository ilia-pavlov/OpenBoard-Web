import { defineConfig } from 'vite'

// US Chess only allows browser requests from its own site (CORS), so the page
// calls same-origin /api/* paths and this dev server relays them. A deployed
// build needs the same relay (e.g. a Cloudflare Worker) at the same paths.
const userAgent = 'OpenBoard-Web/0.1'

export default defineConfig({
  build: {
    rollupOptions: {
      // Two apps from one codebase: the family app and the coach dashboard (/coach/).
      input: { main: 'index.html', coach: 'coach/index.html' },
    },
  },
  server: {
    proxy: {
      '/api/ratings': {
        target: 'https://ratings-api.uschess.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ratings/, '/api/v1'),
        headers: { 'User-Agent': userAgent },
      },
      '/api/site': {
        target: 'https://new.uschess.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/site/, ''),
        headers: { 'User-Agent': userAgent },
      },
    },
  },
})
