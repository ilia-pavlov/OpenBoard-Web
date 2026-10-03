import { defineConfig } from 'vite'

// US Chess only allows browser requests from its own site (CORS), so the page
// calls same-origin /api/* paths and this dev server relays them. A deployed
// build needs the same relay (e.g. a Cloudflare Worker) at the same paths.
const userAgent = 'OpenBoard-Web/0.1'

export default defineConfig({
  server: {
    proxy: {
      '/api/ratings': {
        target: 'https://ratings-api.uschess.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ratings/, '/api/v1'),
        headers: { 'User-Agent': userAgent },
      },
    },
  },
})
