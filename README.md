# ♛ OpenBoard Web

A web version of [OpenBoard](https://github.com/ilia-pavlov/OpenBoard), the iOS client
for US Chess ratings, running on live data from US Chess.

- **My Card**: follow a player and see their ratings as glowing chess-clock digits,
  with a rating sparkline, a "just rated" banner, national and state rank, and recent events.
- **Rating History**: every rated event as a chart. A green ▲ means the rating went up,
  a red ▼ means it went down, and a gray ● means no change. Filter by Regular or Quick,
  number of events, time period, or result. Filters are kept in the URL, so you can
  bookmark or share a filtered view.
- **Search**: by name or 8-digit member ID, with recent searches remembered in this browser.

Coming next, one branch each: Crosstables, Best wins, Top 100, Upcoming tournaments.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

`npm run build` typechecks and builds a static site into `dist/`.

## Why there's a relay

US Chess only lets browsers call `ratings-api.uschess.org` from its own site. The
server sends `Access-Control-Allow-Origin` only for `https://ratings.uschess.org`. So
the page calls same-origin `/api/ratings/*` paths, and something on the server side
forwards them:

- **Development:** Vite's dev proxy (`vite.config.ts`).
- **Production (not set up yet):** a small relay at the same paths, for example a
  Cloudflare Worker.

## Layout

| File | What it holds |
|---|---|
| `src/endpoints.ts` | US Chess paths and query parameters. Mirrors the app's `Shared/USChessEndpoints.swift`. |
| `src/models.ts` | API wire types and their mapping to domain models. Port of `USCFAPITypes.swift`. |
| `src/api.ts` | Fetching: paging, request de-duplication, and waiting out rate limits (429). |
| `src/router.ts` | Hash router. Each screen gets a signal that aborts when you navigate away. |
| `src/chart.ts` | The Rating History chart (SVG, hover, tap, and arrow keys). |
| `src/views/` | My Card and player profile, Search, Rating History. |

US Chess's ratings API isn't officially documented or supported, so its responses
can change without notice.
