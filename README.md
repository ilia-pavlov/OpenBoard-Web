# ♛ OpenBoard Web

A web version of [OpenBoard](https://github.com/ilia-pavlov/OpenBoard), the iOS client
for US Chess ratings, running on live data from US Chess.

- **My Card**: follow a player and see their ratings as glowing chess-clock digits,
  with a rating sparkline, a "just rated" banner, national and state rank, and recent events.
- **Rating History**: every rated event as a chart. A green ▲ means the rating went up,
  a red ▼ means it went down, and a gray ● means no change. Filter by Regular or Quick,
  number of events, time period, or result. Filters are kept in the URL, so you can
  bookmark or share a filtered view.
- **Crosstables**: every event row opens its crosstable at the right section, with the
  player outlined and expanded. Big events have a section picker. Tap a player to see each
  round: the opponent, their rating, and an **estimated** rating change for both players.
  US Chess only publishes the event total, so the estimates are scaled to add up to it.
- **Best wins**: on My Card and every profile, the highest-rated opponents a player has
  beaten in Regular play, **rated as they were on the day of the game**, and how far above
  the player that was. Tap a win to open the opponent or the tournament. The first check
  reads one section per second (strongest events first, stopping early once nothing
  better is possible). Checked sections are kept in this browser, so later visits are
  instant. Pause is remembered until Resume.
- **Top 100 by age**: browse US Chess's monthly Top 100 lists (age 7 and under through 18,
  girls, 50+, 65+; Regular, Quick or Blitz; optionally only your followed player's state).
  Players on a list get a badge like **🏅 #37 · Age 9** on My Card, profiles, search
  results, crosstables and Best wins. A profile's badges open that list with the player
  highlighted.
- **Upcoming tournaments** (Events tab): US Chess tournaments near a city or ZIP (10 to
  500 miles; this weekend, 30 days or 3 months; scholastic, quads or Grand Prix) and the
  nationwide major events from the Plan Ahead Calendar. Each tournament shows its dates,
  a venue map with **Directions**, a **Register** button, **Save** for later, organizer
  contacts, and the full announcement as the organizer formatted it, with a **Copy**
  button that keeps each link's address.
- **Watching**: follow your kid, rivals and teammates with **♥ Watch** on any profile
  (the first player watched becomes My Card). Watching lists saved tournaments, My
  players and Rivals & friends, with each rating, when they were last rated, and Top 100
  badges. Make primary, Unfollow and reorder from there. **Rating alerts** are browser
  notifications when a watched player's rating changes. A website can't check in the
  background like the app, so it checks when you open it (at most every 12 hours) and
  when you tap ↻.
- **About**: tap ♛ OpenBoard in the header for why the project exists (helping parents
  find tournaments, letting kids follow friends and rivals and track their points, and
  growing chess in the US) and a tour of what it can do.
- **Search**: by name, 8-digit member ID, or 12-digit event ID, with recent searches
  remembered in this browser.


## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

`npm test` runs the unit tests. `npm run build` typechecks and builds a static site into `dist/`.

## Why there's a relay

US Chess only lets browsers call `ratings-api.uschess.org` from its own site. The
server sends `Access-Control-Allow-Origin` only for `https://ratings.uschess.org`, and
`new.uschess.org` (tournament listings) sends no CORS headers at all. So the page calls
same-origin paths, and something on the server side forwards them:

| Page calls | Forwarded to |
|---|---|
| `/api/ratings/*` | `https://ratings-api.uschess.org/api/v1/*` |
| `/api/site/*` | `https://new.uschess.org/*` |


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
| `src/bestwins.ts` | Best wins ranking and the paced, resumable scan. Port of `BestWins` and `bestWinsScan`. |
| `src/toplists.ts` | Which Top 100 lists each player is on, and the badges. Port of `TopListsIndex.swift`. |
| `src/tournaments.ts` | Upcoming tournaments: listings, announcements and the Plan Ahead Calendar, parsed from new.uschess.org. Port of `TournamentsService.swift`. |
| `src/announcement.ts` | Makes an organizer's announcement HTML safe to show (allowlist) and builds the Copy text. |
| `src/location.ts` | "Use my location" and distances. |
| `src/watchlist.ts` | Checks watched players for rating changes and sends alerts. Port of `RefreshScheduler.swift`. |
| `src/store.ts` | IndexedDB cache for data worth keeping across visits. |
| `src/estimator.ts` | Per-round rating estimates. Port of `RoundRatingEstimator.swift`. |
| `src/views/` | My Card and player profile, Search, Rating History, Crosstable, Best wins, Top 100, Events, Tournament, Watching. |

## Other services

- **OpenStreetMap** draws the venue map on a tournament page (an embedded map; it needs
  WebGL), and its Nominatim service turns your location into a city, only when you tap
  "Use my location". The US Chess search accepts a city or ZIP but ignores coordinates.
- **Directions** open Apple Maps on Apple devices and Google Maps elsewhere.

US Chess's ratings API isn't officially documented or supported, so its responses
can change without notice.
